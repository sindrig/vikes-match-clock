"""Exercise the real CLI in an owned checkout-shaped temporary fixture."""

import base64
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "rebuild_club_logos.py"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8"
    "/x8AAwMCAO+a4WQAAAAASUVORK5CYII="
)
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
STRING = r'"(?:[^"\\]|\\.)*"'


class LogoCandidateCliTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="logo-cli-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.repository = self.root / "checkout"
        self.script = self.repository / "utils" / SCRIPT.name
        self.script.parent.mkdir(parents=True)
        # Same entrypoint bytes, isolated artwork and canonical-map sentinel.
        shutil.copyfile(SCRIPT, self.script)
        self.images = self.repository / "clock" / "src" / "images"
        self.artwork = self.images / "club-logos"
        self.artwork.mkdir(parents=True)
        self.canonical = self.images / "clubLogos.ts"
        self.canonical.write_bytes(b"curated map sentinel\n")
        self.cwd = self.root / "unrelated cwd"
        self.cwd.mkdir()

    def artwork_file(self, name, directory=None):
        path = (directory or self.artwork) / name
        path.write_bytes(SVG if path.suffix.lower() == ".svg" else PNG)
        return path

    def cli(self, *arguments, cwd=None, script=None):
        return subprocess.run(
            [
                sys.executable,
                "-I",
                "-S",
                "-B",
                str(script or self.script),
                *map(str, arguments),
            ],
            cwd=cwd or self.cwd,
            capture_output=True,
            timeout=10,
            check=False,
        )

    def snapshot(self):
        return {
            str(path.relative_to(self.root)): (
                ("symlink", str(path.readlink()))
                if path.is_symlink()
                else ("file", path.read_bytes())
            )
            for path in self.root.rglob("*")
            if path.is_symlink() or path.is_file()
        }

    def candidate_map(self, source, import_base):
        text = source.decode("utf-8")
        self.assertIn("export default {", text)
        for obsolete in ("require(", "module.exports", "eslint-disable"):
            self.assertNotIn(obsolete, text)
        imports = {}
        for identifier, literal in re.findall(
            rf"^import ([A-Za-z_$][\w$]*) from ({STRING});$", text, re.M
        ):
            specifier = json.loads(literal)
            self.assertTrue(specifier.startswith(("./", "../")), specifier)
            target = (import_base / specifier).resolve()
            self.assertTrue(target.is_file(), target)
            self.assertNotIn(identifier, imports)
            imports[identifier] = target
        entries = re.findall(
            rf"^  \[?({STRING})\]?: ([A-Za-z_$][\w$]*),$", text, re.M
        )
        self.assertEqual(len(imports), len(entries))
        result = {
            json.loads(key): imports[identifier] for key, identifier in entries
        }
        self.assertEqual(len(result), len(entries))
        self.assertTrue(result)
        return result

    def assert_rejected_without_changes(self, *arguments, message):
        before = self.snapshot()
        result = self.cli(*arguments)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(message.encode(), result.stderr)
        self.assertEqual(result.stdout, b"")
        self.assertNotIn(b"Traceback", result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_no_arguments_preserve_all_files_including_legacy_output(self):
        (self.images / "clubLogos.js").write_bytes(b"legacy sentinel\n")
        self.artwork_file("Club.png")
        self.assert_rejected_without_changes(message="--stdout --output")

    def test_stdout_default_is_cwd_independent_deterministic_and_read_only(
        self,
    ):
        names = ("Zulu.png", "Alpha.png", "Alpha.svg", "Víkingur R.svg")
        for name in names:
            self.artwork_file(name)
        (self.artwork / "ignored.jpg").write_bytes(b"not supported")
        self.artwork_file("ignored.SVG")
        (self.artwork / "nested").mkdir()
        self.artwork_file("Nested.svg", self.artwork / "nested")
        before = self.snapshot()
        first = self.cli("--stdout")
        second = self.cli("--stdout", cwd=self.repository)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn(str(self.images).encode(), first.stderr)
        mapping = self.candidate_map(first.stdout, self.images)
        self.assertEqual(list(mapping), ["Alpha", "Víkingur R", "Zulu"])
        self.assertEqual(mapping["Alpha"], self.artwork / "Alpha.svg")
        self.assertEqual(self.snapshot(), before)
        for name in names:
            (self.artwork / name).unlink()
        for name in reversed(names):
            self.artwork_file(name)
        reordered = self.cli("--stdout")
        self.assertEqual(reordered.returncode, 0, reordered.stderr)
        self.assertEqual(reordered.stdout, first.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_new_candidate_uses_explicit_cwd_paths_and_escaped_exact_names(
        self,
    ):
        artwork = self.cwd / "fixture crests"
        artwork.mkdir()
        names = [
            "A B",
            "AB",
            "A-B",
            'Club "quoted" & friends',
            "Víkingur R",
            "9. FC's (A+B)",
            "line\nbreak",
            "Emoji ⚽",
            "__proto__",
            "class",
            "Malisheva",
            ".Hidden",
        ]
        for name in reversed(names):
            self.artwork_file(name + ".svg", artwork)
        output = self.cwd / "candidate.ts"
        result = self.cli(
            "--input-dir", "fixture crests", "--output", output.name
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, b"")
        mapping = self.candidate_map(output.read_bytes(), self.cwd)
        self.assertEqual(list(mapping), sorted(names))
        self.assertEqual(
            mapping,
            {name: artwork / (name + ".svg") for name in names},
        )
        self.assertNotIn("FC Malisheva", mapping)
        self.assertEqual(
            sorted(path.name for path in self.cwd.iterdir()),
            ["candidate.ts", "fixture crests"],
        )
        self.assertEqual(
            self.canonical.read_bytes(), b"curated map sentinel\n"
        )

    def test_output_parent_symlink_uses_physical_candidate_directory(self):
        artwork = self.artwork_file("Club.svg")
        destination = self.root / "review"
        destination.mkdir()
        alias = self.cwd / "review alias"
        alias.symlink_to(destination, target_is_directory=True)
        result = self.cli("--output", alias / "candidate.ts")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.candidate_map(
                (destination / "candidate.ts").read_bytes(), destination
            ),
            {"Club": artwork},
        )

    def test_hidden_filename_beside_candidate_has_relative_module_prefix(self):
        artwork = self.artwork_file(".Hidden.svg")
        output = self.artwork / "candidate.ts"
        result = self.cli("--output", output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.candidate_map(output.read_bytes(), self.artwork),
            {".Hidden": artwork},
        )

    def test_existing_and_dangling_symlink_outputs_are_never_replaced(self):
        self.artwork_file("Club.svg")
        sentinel = self.cwd / "existing.ts"
        sentinel.write_bytes(b"keep this exactly\n")
        alias = self.cwd / "alias.ts"
        alias.symlink_to(sentinel)
        dangling = self.cwd / "dangling.ts"
        dangling.symlink_to(self.cwd / "absent.ts")
        for path in (sentinel, alias, dangling):
            with self.subTest(path=path):
                self.assert_rejected_without_changes(
                    "--output", path, message="output already exists"
                )

    def test_canonical_destination_is_protected_even_when_absent_and_aliased(
        self,
    ):
        self.artwork_file("Club.svg")
        alias = self.cwd / "canonical alias.ts"
        alias.symlink_to(self.canonical)
        parent_alias = self.cwd / "images alias"
        parent_alias.symlink_to(self.images, target_is_directory=True)
        destinations = (
            self.canonical,
            Path("../checkout/clock/src/images/clubLogos.ts"),
            alias,
            parent_alias / "clubLogos.ts",
        )
        for exists in (True, False):
            if not exists:
                self.canonical.unlink()
            for path in destinations:
                with self.subTest(exists=exists, path=path):
                    self.assert_rejected_without_changes(
                        "--output", path, message="canonical map is protected"
                    )

    def test_real_entrypoint_refuses_actual_tracked_canonical_and_aliases(
        self,
    ):
        canonical = SCRIPT.parents[1] / "clock/src/images/clubLogos.ts"
        before = canonical.read_bytes()
        alias = self.cwd / "real canonical alias.ts"
        alias.symlink_to(canonical)
        for path in (canonical, alias):
            with self.subTest(path=path):
                result = self.cli("--output", path, script=SCRIPT)
                self.assertEqual(result.returncode, 2)
                self.assertIn(b"canonical map is protected", result.stderr)
                self.assertEqual(canonical.read_bytes(), before)

    def test_bad_input_and_output_errors_leave_no_candidate_or_temporary_files(
        self,
    ):
        output = self.cwd / "candidate.ts"
        cases = (
            (("--input-dir", self.root / "missing"), "input directory"),
            (("--input-dir", self.canonical), "input directory"),
            ((), "no SVG or PNG artwork"),
        )
        for arguments, message in cases:
            with self.subTest(arguments=arguments):
                self.assert_rejected_without_changes(
                    *arguments, "--output", output, message=message
                )
        self.artwork_file("Club.svg")
        for path in ("candidate.js", "candidate.d.ts", "absent/candidate.ts"):
            with self.subTest(path=path):
                self.assert_rejected_without_changes(
                    "--output", path, message="output"
                )

    def test_normalized_name_collisions_fail_before_write(
        self,
    ):
        for pair in (
            ("Club.svg", "CLUB.svg"),
            ("Club.png", "club.svg"),
            ("Café.png", "Cafe\u0301.svg"),
        ):
            with self.subTest(pair=pair):
                for path in self.artwork.iterdir():
                    path.unlink()
                for name in pair:
                    self.artwork_file(name)
                before = self.snapshot()
                result = self.cli("--output", "candidate.ts")
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn(b"collision", result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_invalid_artwork_or_import_paths_fail_before_write(self):
        for name, message in (
            (" .svg", "empty club name"),
            ("Query?.png", "module path characters"),
            ("Fragment#.svg", "module path characters"),
            ("Back\\slash.png", "module path characters"),
        ):
            with self.subTest(name=name):
                path = self.artwork_file(name)
                self.assert_rejected_without_changes(
                    "--output", "candidate.ts", message=message
                )
                path.unlink()
        (self.artwork / "directory.svg").mkdir()
        self.assert_rejected_without_changes(
            "--output", "candidate.ts", message="not a regular file"
        )


if __name__ == "__main__":
    unittest.main()
