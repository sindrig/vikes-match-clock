# Windows/Chromium Web Renderer Qualification

Complete this checklist on the production kiosk before changing a venue's
published `perimeterDisplay.renderer` to `web`. Record the date, Windows build,
Chromium version, GPU, and configuration revision with the results.

## Test Record

| Field | Result |
| --- | --- |
| Operator / date | |
| Windows build | |
| Chromium version | |
| GPU / driver | |
| Mapping revision | |
| Framebuffer dimensions | |
| Maximum tested texture dimensions | |
| Persistent quota / usage | |

## Qualification Steps

1. Publish the measured mapping with calibration preview enabled. Confirm every label and boundary on the physical strips, including the packed canvas edge and any intentional negative clipping.
2. Run one image/image cue, one video/video cue, and one mixed image/video cue. Confirm both logical screens switch together at 20 seconds and no black or half-pair frame appears.
3. Exercise every production codec and container. Record decoded dimensions, duration, playback-rate support, and any decoder errors. Reject a playlist revision when any pair fails validation.
4. Fill the intended playlist until the browser profile is close to the expected 2 GB cache size. Record `navigator.storage.estimate()` before and after the test. Confirm a failed replacement keeps the last complete revision visible.
5. Turn the perimeter off during preload and playback. Confirm the canvas is black while off, then confirm each off-to-on transition starts cue zero.
6. Restart Chromium offline with a complete cached revision. Confirm the cached revision validates and remains playable without a network request for the media objects.
7. Send repeated remote restart tokens while on and off. Confirm the display target remains perimeter and no scoreboard selector appears.
8. Run a paired video playlist for at least two hours. Record cue-boundary drift, dropped frames, decoder errors, GPU memory growth, and whether the final cue loops correctly.
9. Show, replace, and clear an overlay while the base playlist is running. Confirm the base clock continues and visibility changes are atomic.

## Evidence

Attach the calibration screenshot, browser console log, storage estimate, codec
matrix, and long-run timing notes to the deployment record. Do not enable the
second stadium until every step has a recorded result and the rollback target
is known.

Rollback is configuration-only: publish or remove the venue's `web` mapping so
the public Perimeter option disappears, then reconnect the physical output to
its previous playback path. Víkin remains `resolume` during this qualification.
