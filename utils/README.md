# Asset maintenance utilities

These standalone operator scripts are retained while current usage and output
contracts are confirmed under **#251**. Their dependency files are opt-in
inventories; they do not qualify old commands, upstream selectors, image
quality or remote writes. Review inputs, working directories and destinations
before a separately authorized maintenance task. Use the
[root instructions](../AGENTS.md) and [task index](../docs/README.md).

## Dependency inventories

Normal API setup uses
[`clock-api/v3/requirements-dev.txt`](../clock-api/v3/requirements-dev.txt),
including runtime requirements and Black. Frontend setup needs no Python.
The former mixed root `requirements.txt` has been replaced by these groups,
to install only in a separate, owned Python 3.12 virtual environment:

| Group                                                    | Imports supplied                                        | Intended consumers                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`requirements-scraping.txt`](requirements-scraping.txt) | Requests, BeautifulSoup                                 | `add_club.py`, `fetch_clubs.py`                                                         |
| [`requirements-images.txt`](requirements-images.txt)     | Scraping group plus OpenCV, scikit-image, NumPy, Pillow | `image-converter.py`; currently imported eagerly, including for help, `pids` and `crop` |
| [`requirements-firebase.txt`](requirements-firebase.txt) | Firebase Admin, Typer, google-cloud-storage             | `copy-folder.py`                                                                        |

For example, from the **repository root**, with the separately selected tool
environment's Python on PATH:

```bash
python -m pip install -r utils/requirements-scraping.txt
```

Choose the group needed for the task. Installing it does not authorize invoking
a tool or accessing a live service. Typer 0.12.3 and Firebase Admin 6.5.0 retain
the historical pins. Other versions were unpinned and remain so; NumPy, Pillow
and google-cloud-storage are now explicit direct imports. Installer resolution
alone does not verify command compatibility, including Typer/Click behavior.

Standard-library helpers need no group; the two shell image tools need the
ImageMagick `convert` executable. Root `pyproject.toml` is formatting policy
only. The removed root `uv.lock` held no resolved packages and supplied no
reproducibility. These inventories and API direct pins do not lock all
transitives; no root `uv sync` setup is implied. See
[Python tooling](../docs/api-client-preparation.md#python-tooling) for the
maintained API's formatter/typecheck boundary.

## Offline logo candidates

`rebuild_club_logos.py` uses **Python 3.12 and its standard library only**.
It enumerates local filenames into a TypeScript ESM default-exported
name-to-image map for review. It does not inspect image content. The filename
and entrypoint remain, with an **intentional CLI migration**: the former
no-argument invocation implicitly replaced obsolete `clubLogos.js`; now no
arguments report usage and exit 2 without creating or modifying files.
Select one explicit mode:

```bash
# Read-only stdout; default artwork is relative to the script, not cwd.
python utils/rebuild_club_logos.py --stdout

# New candidate in an existing review directory, with matching relative imports.
python utils/rebuild_club_logos.py --output /tmp/logo-review/candidate.ts

# Owned fixture input; explicit relative paths resolve from invocation cwd.
python utils/rebuild_club_logos.py --input-dir ./fixture-crests --output ./candidate.ts
```

`--stdout` imports assume the candidate will live directly in
`clock/src/images/` of this checkout; stderr prints that absolute import base.
Redirecting stdout elsewhere does not rebase those imports or protect a shell
redirection's destination. Use `--output` for a candidate in any other directory.
Output must be a new `.ts` file, excluding `.d.ts`; its parent must already
exist. Existing files and symlinks, including dangling links, are refused.
Relative, absolute and symlink aliases of the canonical
`clock/src/images/clubLogos.ts` are protected even if it is absent. Validation
finishes before staging output, then a hard link publishes the complete file
without replacement; the local output filesystem must support hard links.
No JavaScript companion or generated lint suppression is emitted.

Only top-level `.svg` and `.png` files are considered; lowercase extensions
match Clock's image module declarations. Equal exact stems select SVG before
PNG. Case-folded or Unicode NFC name collisions, blank names, missing
or empty inputs and supported-extension entries that are not files are errors.
Other extensions and subdirectories are ignored. Ordering uses exact stems in
Unicode code-point order. Keys retain those stems; generated ASCII identifiers
avoid punctuation/reserved-word identifier collisions, and TypeScript strings
are escaped. Unicode, spaces, quotes and ordinary punctuation are supported;
paths containing backslashes, `?` or `#` are rejected because they have module
separator/query/fragment semantics. Errors leave existing files unchanged.

This is a **filename-derived candidate**, not a canonical rebuild. It never
reads or updates curated logo mappings or club IDs. In particular,
`Malisheva.png` produces `Malisheva`, not the curated `FC Malisheva` alias.
Canonical adoption requires separate approval and comparison of every existing
key-to-file mapping, including manual/foreign teams and display aliases, then
the relevant frontend checks. Keep the candidate at its declared location
while reviewing imports. Do not replace either canonical map with this output.

Run the standard-library CLI suite from the repository root:

```bash
python -I -S -B -m unittest discover -s utils/tests -p 'test_rebuild_club_logos.py' -v
```

The suite invokes the unchanged entrypoint in owned temporary checkout-shaped
fixtures and also checks refusal of the real tracked map using read-only
sentinel comparisons. It needs no image packages, frontend install or network.

## Inputs, working directories and destinations

Except for the bounded offline candidate workflow above, entries remain
**legacy, pending operator qualification**. Paths describe existing source
behavior, including its defects; they are not a regeneration or upload recipe.
The other scripts have no qualified general dry run. Relative
positional paths use the invocation's working directory (cwd) unless a
script-relative base is stated.

| Tool                    | Input and cwd                                                                                                                                          | Filesystem and external effects                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild_club_logos.py` | Standard library; script-relative `clock/src/images/club-logos`, or explicit `--input-dir` resolved from cwd.                                          | Explicit `--stdout` for read-only output or `--output` for a new TypeScript candidate with relative imports. Existing files and the canonical map are protected. See [offline candidates](#offline-logo-candidates).                                                                                                                                                                                                                            |
| `add_club.py`           | Scraping group; CLI club ID or name; old `ksi.is/mot/felag` and search HTML. Bases artwork/maps under script-relative `clock/`.                        | May download artwork into `clock/src/images/club-logos` before editing absent `clock/src/club-ids.js` and `clock/src/images/clubLogos.js`. Partial output is possible. Import insertion also needs repair; extension changes alone are insufficient.                                                                                                                                                                                            |
| `fetch_clubs.py`        | Scraping group; old `ksi.is/mot/felog/adildarfelog/` table. `--out_folder` must be absolute; default is script-relative `clock/src/images/club-logos`. | Downloads artwork into the selected folder, then replaces `clock/src/club-ids.js` and `clock/src/images/clubLogos.js` regardless of `--out_folder`. Emits a CommonJS logo map. No timeout/dry-run contract or current selector qualification.                                                                                                                                                                                                   |
| `build_assets_file.py`  | Standard library, then `npx prettier`; script-relative absent root `src/assets`.                                                                       | Writes CommonJS `src/assets/index.js` and formats through `npx`, potentially fetching a JS tool. Current `clock/src/assets` contains directly imported fonts; no current generic index consumer was found. Do not retarget it without a defined consumer.                                                                                                                                                                                       |
| `image-converter.py`    | Image group; positional input/output folders, output must exist. Scans top-level `*.png` only.                                                         | `pids` searches `ksi.is/leit/` and copies to output `<pid>[-variant].png`. `crop` writes output `<original>.png` at 240x176. Both can overwrite output. `greenscreen` is broken on undefined `fname` and `frame_resized`, with no qualified image/alpha contract. No Firebase upload occurs here.                                                                                                                                               |
| `copy-folder.py`        | Firebase group; positional source prefix, destination prefix and service-account-key path. A relative key path uses cwd.                               | **Writes Firebase Storage objects** with `Blob.rewrite` within the selected bucket. Case-sensitive `staging` anywhere in the full `service_account_key` argument selects `vikes-match-clock-staging.appspot.com`; every other argument selects **`vikes-match-clock-firebase.appspot.com` (production)**. Lists `<source>/`; key rewrite details below. No explicit bucket/dry-run option; overlap and rewrite continuation need qualification. |
| `extract.py`            | Standard library; positional ZIP path uses cwd.                                                                                                        | Deletes/recreates script-relative `utils/extracted/`, then writes raw archive member names. Absolute/`..` names can escape that base; nested directories are not prepared. Do not use untrusted or real operator archives as a check.                                                                                                                                                                                                           |
| `fit-image.sh`          | ImageMagick; positional input/output paths and optional background, relative to cwd.                                                                   | Writes resized/padded 238x177 output. Arguments are unquoted; spaces/globs need review. No network.                                                                                                                                                                                                                                                                                                                                             |
| `convert-images.sh`     | ImageMagick; top-level `*.jpg` in **cwd**, independent of script location.                                                                             | Deletes/recreates **`./out/`**, even without matching input, then writes 174x116 images. Use a deliberately isolated temporary cwd for any future fixture verification.                                                                                                                                                                                                                                                                         |

`copy-folder.py` tests the entire key-path argument, including directory names,
without normalization: `/tmp/staging/service-account-prod.json` selects staging,
while `Staging` does not match `staging`. For each listed object name, unrestricted
`str.replace` removes **every** occurrence of `<source>/` before prepending
`<destination>/`. For example, source `images` and destination `fotbolti` turn
`images/archive/images/player.png` into `fotbolti/archive/player.png`.

The utility contains historical production migration examples for
`images`, `largeAds`, `smallAds` and `players` into `fotbolti`. They establish
past operator intent, not current authorization. Credential path-argument inference
must not be treated as environment validation. This inventory supplies no
permission to read credentials, run Admin commands or write remote objects.

## Canonical maps and pending decisions

Current bundled assets use `clock/src/images/club-logos/`,
`clock/src/images/clubLogos.ts` and `clock/src/club-ids.ts`. They moved to
TypeScript in #113. The other logo generators retain old destinations; the
offline tool above now produces candidates only. The logo map
includes curated aliases, such as `FC Malisheva` pointing to `Malisheva.png`;
filename enumeration would lose that key. The
[team-ID pipeline](../docs/clock/assets-and-rosters.md#team-id-system--match-data-pipeline)
owns KSI identities, normalized names, override-first lookup and distinct
`-1`/non-KSI and `0`/unknown meanings. Preserve manual/foreign clubs and artwork.

History shows deliberate maintenance: July 2024's Egnatia addition changed
`add_club.py` alongside maps, and April 2024 photo changes refined player-ID
matching. Greenscreen variables date to 2023; later matching edits do not
establish current greenscreen use. No automatic utility caller was found in
current source/workflows; `.envrc` exposes this directory on PATH. This evidence
does not establish retirement or reveal external operator callers.

Before a later repair or retirement, confirm:

- Which scripts, wrappers, root pip/uv commands and cwd conventions operators
  still use, including extraction and the ImageMagick tools.
- Whether bundled maps/artwork or Firebase club overrides are the current club
  workflow, and which aliases/foreign additions a generator must retain.
- Whether `pids`, `crop` and `greenscreen` are used independently, with required
  dimensions, background/alpha behavior and a suitable fixture.
- Whether Storage migration remains needed, with explicit bucket, overwrite,
  prefix-overlap and rewrite-completion requirements.

All utility sources and entrypoints are retained. Canonical alias-preserving
rebuilds, live scraper verification, image processing and Storage-tool changes
remain separate follow-ups; **#251 remains open**. Future verification should
use actual temporary output and synthetic inputs before any separately approved
live work.

Bundled artwork is reviewed product input. Captured proof belongs under ignored
`screenshots/`; see [screenshot handling](../docs/screenshots.md).
