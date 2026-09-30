"""Exercise release preparation against isolated local Git repositories."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.remote = Path(self.temp.name) / "origin.git"
        self.repo = Path(self.temp.name) / "repo"
        subprocess.run(
            ["git", "init", "--bare", str(self.remote)],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "clone", str(self.remote), str(self.repo)],
            check=True,
            capture_output=True,
        )
        for relative in (
            "kiosk/src-tauri/Cargo.toml",
            "kiosk/src-tauri/Cargo.lock",
            "kiosk/src-tauri/tauri.conf.json",
            "kiosk/scripts/prepare-release.sh",
            "kiosk/scripts/set-release-version.py",
        ):
            target = self.repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        self.git("checkout", "-b", "master")
        self.git("config", "user.name", "Release test")
        self.git("config", "user.email", "release@example.com")
        self.git("add", ".")
        self.git("commit", "-m", "Initial files")
        self.git("push", "origin", "master")

    def git(self, *args):
        return subprocess.run(
            ["git", *args],
            cwd=self.repo,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def prepare(self, tag):
        return subprocess.run(
            ["bash", "kiosk/scripts/prepare-release.sh"],
            cwd=self.repo,
            env={
                **os.environ,
                "GITHUB_REF_NAME": tag,
                "GITHUB_OUTPUT": str(Path(self.temp.name) / "output"),
            },
            capture_output=True,
            text=True,
        )

    def test_release_and_retry(self):
        original_lock = tomllib.loads(
            (self.repo / "kiosk/src-tauri/Cargo.lock").read_text()
        )
        self.git("tag", "-a", "v0.2.0", "-m", "Release")
        self.git("push", "origin", "v0.2.0")
        original_sha = self.git("rev-parse", "HEAD")
        result = self.prepare("v0.2.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        sha = self.git("rev-parse", "HEAD")
        self.assertNotEqual(original_sha, sha)
        self.assertEqual(self.git("rev-parse", "origin/master"), sha)
        self.assertEqual(self.git("rev-parse", "v0.2.0^{commit}"), sha)
        refs = self.git(
            "ls-remote", "origin", "refs/heads/master", "refs/tags/v0.2.0"
        )
        self.assertTrue(
            all(line.startswith(sha) for line in refs.splitlines())
        )
        changed = self.git("diff", "--name-only", "HEAD~", "HEAD").splitlines()
        self.assertEqual(
            changed,
            [
                "kiosk/src-tauri/Cargo.lock",
                "kiosk/src-tauri/Cargo.toml",
                "kiosk/src-tauri/tauri.conf.json",
            ],
        )
        manifest = tomllib.loads((self.repo / changed[1]).read_text())
        config = json.loads((self.repo / changed[2]).read_text())
        lock = tomllib.loads((self.repo / changed[0]).read_text())
        self.assertEqual(manifest["package"]["version"], "0.2.0")
        self.assertEqual(config["version"], "0.2.0")
        for package in original_lock["package"]:
            if package["name"] == "vikes-match-clock":
                package["version"] = "0.2.0"
        self.assertEqual(lock, original_lock)
        self.assertEqual(
            (Path(self.temp.name) / "output").read_text(), f"sha={sha}\n"
        )
        retry = self.prepare("v0.2.0")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), sha)

    def test_reject_stale_tag(self):
        self.git("tag", "v0.2.0")
        self.git("commit", "--allow-empty", "-m", "Newer master")
        self.git("push", "origin", "master", "v0.2.0")
        result = self.prepare("v0.2.0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("current master HEAD", result.stderr)

    def test_reject_invalid_versions_without_changes(self):
        for tag in (
            "vnext",
            "v01.2.3",
            "v1.2.3-beta",
            "v256.0.0",
            "v1.2.65536",
        ):
            with self.subTest(tag=tag):
                self.git("tag", tag)
                self.git("push", "origin", tag)
                self.assertNotEqual(self.prepare(tag).returncode, 0)
                self.assertEqual(self.git("status", "--porcelain"), "")


if __name__ == "__main__":
    unittest.main()
