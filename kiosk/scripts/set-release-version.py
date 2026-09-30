"""Synchronize kiosk versions from a vMAJOR.MINOR.PATCH release tag."""

import json
from pathlib import Path
import re
import sys
import tomllib


def set_version(tag: str) -> None:
    if not re.fullmatch(
        r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", tag
    ):
        raise ValueError("Release tag must be vMAJOR.MINOR.PATCH")
    version = tag[1:]
    major, minor, patch = map(int, version.split("."))
    if major > 255 or minor > 255 or patch > 65535:
        raise ValueError("Release version exceeds Windows MSI version limits")

    root = Path("kiosk/src-tauri")
    manifest = root / "Cargo.toml"
    lockfile = root / "Cargo.lock"
    config = root / "tauri.conf.json"
    manifest_text = manifest.read_text()
    package_name = tomllib.loads(manifest_text)["package"]["name"]
    replacements = {}
    # Restrict replacements to the root package, leaving dependency versions intact.
    patterns = {
        manifest: r'(\[package\]\s*\n(?:(?!\[)[^\n]*\n)*?version = ")[^"]+(")',
        lockfile: rf'(\[\[package\]\]\nname = "{re.escape(package_name)}"\nversion = ")[^"]+(")',
        config: r'("version": ")[^"]+(")',
    }
    for path, pattern in patterns.items():
        replacements[path], count = re.subn(
            pattern,
            lambda match: f"{match[1]}{version}{match[2]}",
            path.read_text(),
        )
        if count != 1:
            raise ValueError(
                f"Expected exactly one version in {path}, got {count}"
            )

    tomllib.loads(replacements[manifest])
    tomllib.loads(replacements[lockfile])
    json.loads(replacements[config])
    for path, text in replacements.items():
        path.write_text(text)


if __name__ == "__main__":
    set_version(sys.argv[1])
