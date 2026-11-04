# Asset maintenance utilities

These are standalone operator/asset scripts, not another web app or deployment.
Use the [root instructions](../AGENTS.md) and [task index](../docs/README.md).
Review a script's inputs, working directory and outputs before running it;
several older helpers assume layouts that no longer exist.

| Tool                                                   | Role and prerequisites                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild_club_logos.py`                                | Python standard-library logo-map generator; defaults to the old `.js` output, while the tracked map is now `clock/src/images/clubLogos.ts`; adapt/review output deliberately, not as a routine regeneration step |
| `fetch_clubs.py`, `add_club.py`                        | Networked KSI HTML/logo importers using Requests/BeautifulSoup; old upstream URLs/selectors need verification before use; output can overwrite mappings/artwork                                                  |
| `image-converter.py`                                   | Python image/player-photo processing, KSI lookup and output files; uses OpenCV, NumPy, scikit-image, Pillow, Requests and BeautifulSoup                                                                          |
| `fit-image.sh`, `convert-images.sh`                    | ImageMagick `convert`; inspect paths first (`convert-images.sh` removes/recreates its current directory's `out/`)                                                                                                |
| `copy-folder.py`, `extract.py`, `build_assets_file.py` | Legacy data/asset helpers; inspect hardcoded paths and old root `src/assets` assumptions before adapting, not checkout prerequisites                                                                             |

The broad root [requirements.txt](../requirements.txt) and [format configuration](../pyproject.toml)
(plus the historical `uv.lock`) are separate from the maintained API's requirements; this inventory does not
certify fresh installation or the old scrapers. The [team-ID pipeline](../docs/clock/assets-and-rosters.md#team-id-system--match-data-pipeline)
explains why imported IDs and normalized names must match API lineups.

Bundled source artwork is reviewed product input. Captured proof belongs under
ignored `screenshots/` and must not be committed; see [screenshot handling](../docs/screenshots.md).
