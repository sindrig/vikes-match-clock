"""Build an offline, filename-derived TypeScript logo candidate for review."""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import unicodedata

IMAGES = Path(__file__).resolve().parents[1] / "clock" / "src" / "images"
CANONICAL = IMAGES / "clubLogos.ts"
EXTENSIONS = (".svg", ".png")


def collect_logos(directory: Path) -> dict[str, Path]:
    if not directory.is_dir():
        raise ValueError(f"input directory does not exist: {directory}")

    variants: dict[str, dict[str, Path]] = {}
    names: dict[str, str] = {}
    for path in sorted(directory.iterdir()):
        extension = path.suffix
        if extension not in EXTENSIONS:
            continue
        if not path.is_file():
            raise ValueError(f"artwork is not a regular file: {path}")
        name = path.stem
        if not name.strip():
            raise ValueError(f"empty club name: {path.name!r}")
        identity = unicodedata.normalize("NFC", name).casefold()
        previous = names.setdefault(identity, name)
        if previous != name:
            raise ValueError(f"club name collision: {previous!r} and {name!r}")
        formats = variants.setdefault(name, {})
        formats[extension] = path

    if not variants:
        raise ValueError(f"no SVG or PNG artwork found in: {directory}")
    return {
        name: next(formats[ext] for ext in EXTENSIONS if ext in formats)
        for name, formats in sorted(variants.items())
    }


def render_candidate(logos: dict[str, Path], import_base: Path) -> str:
    lines = [
        "// Filename-derived candidate; review curated aliases before adoption."
    ]
    entries = []
    for index, (name, path) in enumerate(logos.items()):
        relative = os.path.relpath(path, import_base)
        # These characters have separator/query/fragment semantics in imports.
        if any(character in relative for character in "\\?#"):
            raise ValueError(f"unsupported module path characters: {path}")
        relative.encode("utf-8")
        specifier = relative.replace(os.sep, "/")
        if not specifier.startswith(("./", "../")):
            specifier = "./" + specifier
        identifier = f"logo{index}"
        lines.append(f"import {identifier} from {json.dumps(specifier)};")
        key = json.dumps(name)
        # Object-literal __proto__ otherwise changes the object's prototype.
        if name == "__proto__":
            key = f"[{key}]"
        entries.append(f"  {key}: {identifier},")
    return "\n".join([*lines, "", "export default {", *entries, "};", ""])


def candidate_destination(path: Path) -> Path:
    resolved = path.resolve()
    if resolved == CANONICAL.resolve():
        raise ValueError(f"canonical map is protected: {CANONICAL}")
    if path.exists() or path.is_symlink():
        raise ValueError(f"output already exists: {path}")
    if resolved.suffix != ".ts" or resolved.name.endswith(".d.ts"):
        raise ValueError("output must be a new .ts candidate (not .d.ts)")
    if not resolved.parent.is_dir():
        raise ValueError(f"output directory does not exist: {resolved.parent}")
    return resolved


def write_candidate(destination: Path, source: str) -> None:
    # Publish complete bytes without replacing even a concurrently created file.
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        dir=destination.parent,
        prefix=".club-logos-",
        suffix=".tmp",
    ) as staged:
        staged.write(source)
        staged.flush()
        os.link(staged.name, destination)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=IMAGES / "club-logos",
        help="artwork directory (default: script-relative clock/src/images/club-logos)",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--stdout",
        action="store_true",
        help="print only; imports assume a candidate in clock/src/images/",
    )
    mode.add_argument(
        "--output",
        type=Path,
        help="create a new .ts candidate; imports are relative to its directory",
    )
    args = parser.parse_args()
    try:
        destination = (
            candidate_destination(args.output) if args.output else None
        )
        logos = collect_logos(args.input_dir.resolve())
        source = render_candidate(
            logos, destination.parent if destination else IMAGES
        )
        if destination:
            write_candidate(destination, source)
        else:
            print(f"Stdout import base: {IMAGES}", file=sys.stderr)
            sys.stdout.write(source)
    except (OSError, ValueError, RuntimeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
