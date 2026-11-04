"""Exercise release preparation against isolated local Git repositories."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
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
        # Keep the fixture's starting version independent of the checkout.
        subprocess.run(
            [sys.executable, "kiosk/scripts/set-release-version.py", "v0.1.0"],
            cwd=self.repo,
            check=True,
            capture_output=True,
        )
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
        # Each workflow attempt receives its own output file.
        self.output = Path(self.temp.name) / "output"
        self.output.unlink(missing_ok=True)
        return subprocess.run(
            ["bash", "kiosk/scripts/prepare-release.sh"],
            cwd=self.repo,
            env={
                **os.environ,
                "GITHUB_REF_NAME": tag,
                "GITHUB_OUTPUT": str(self.output),
            },
            capture_output=True,
            text=True,
        )

    def publish_tag(self, tag, annotated):
        if annotated:
            self.git("tag", "-a", tag, "-m", "Release")
        else:
            self.git("tag", tag)
        self.git("push", "origin", tag)
        return self.git("rev-parse", f"refs/tags/{tag}")

    def remote_refs(self, tag):
        refs = {}
        for line in self.git(
            "ls-remote",
            "origin",
            "refs/heads/master",
            f"refs/tags/{tag}",
            f"refs/tags/{tag}^{{}}",
        ).splitlines():
            sha, ref = line.split()
            refs[ref] = sha
        return refs

    def check_release_bump(self, annotated):
        original_lock = tomllib.loads(
            (self.repo / "kiosk/src-tauri/Cargo.lock").read_text()
        )
        self.publish_tag("v0.2.0", annotated)
        original_sha = self.git("rev-parse", "HEAD")
        result = self.prepare("v0.2.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        sha = self.git("rev-parse", "HEAD")
        self.assertNotEqual(original_sha, sha)
        self.assertEqual(self.git("rev-parse", "HEAD^"), original_sha)
        self.assertEqual(self.git("rev-parse", "origin/master"), sha)
        # A bump replaces even an annotated tag with a lightweight tag.
        self.assertEqual(self.git("rev-parse", "refs/tags/v0.2.0"), sha)
        self.assertEqual(self.git("rev-parse", "v0.2.0^{commit}"), sha)
        self.assertEqual(
            self.remote_refs("v0.2.0"),
            {"refs/heads/master": sha, "refs/tags/v0.2.0": sha},
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
        self.assertEqual(self.output.read_text(), f"sha={sha}\n")
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_release_bump_from_annotated_tag(self):
        self.check_release_bump(annotated=True)

    def test_release_bump_from_lightweight_tag(self):
        self.check_release_bump(annotated=False)

    def check_already_versioned_retry(self, annotated):
        sha = self.git("rev-parse", "HEAD")
        tag_sha = self.publish_tag("v0.1.0", annotated)
        refs = {"refs/heads/master": sha, "refs/tags/v0.1.0": tag_sha}
        if annotated:
            self.assertNotEqual(tag_sha, sha)
            refs["refs/tags/v0.1.0^{}"] = sha
        else:
            self.assertEqual(tag_sha, sha)

        for attempt in range(2):
            with self.subTest(attempt=attempt + 1):
                result = self.prepare("v0.1.0")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.git("rev-parse", "HEAD"), sha)
                self.assertEqual(self.git("rev-parse", "origin/master"), sha)
                self.assertEqual(
                    self.git("rev-parse", "refs/tags/v0.1.0"), tag_sha
                )
                self.assertEqual(self.git("rev-parse", "v0.1.0^{commit}"), sha)
                self.assertEqual(self.remote_refs("v0.1.0"), refs)
                self.assertEqual(self.output.read_text(), f"sha={sha}\n")
                self.assertEqual(self.git("status", "--porcelain"), "")

    def test_already_versioned_retry_with_annotated_tag(self):
        self.check_already_versioned_retry(annotated=True)

    def test_already_versioned_retry_with_lightweight_tag(self):
        self.check_already_versioned_retry(annotated=False)

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
