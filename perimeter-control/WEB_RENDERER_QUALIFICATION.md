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
10. Goal-scorer overlay cases (after the venue's controller is cleared to emit
    version-2 semantic commands — see `clock/AGENTS.md`):
    a. Select a scorer with a `players/{id}-fagn.png` celebration image. The band repeats `[portrait | number | name]` at each overlay logical screen's native dimensions above the advancing base.
    b. Select a scorer whose celebration image is missing or undecodable. The band uses the venue crest (`{location}/crest.png`).
    c. Temporarily remove both source objects and select a scorer. Confirm the previously visible overlay is retained (or the base stays unobscured on a cold start) and the failure appears in the Skjáarvillur panel with a safe message.
    d. Select a scorer with a long name (over 3x band height at nominal size). Confirm the name shrinks to the minimum before truncating and repeated units never overlap.
    e. Clear the active overlay. Confirm every scorer target is removed atomically and the base playlist resumes.
    f. Power the perimeter off and on with a scorer active. Confirm black while off and the composed scorer restored when powered on.
    g. Publish a changed mapping while a scorer is visible. Confirm the bands recompose at the new logical-screen dimensions before the textures swap, and the previous textures are retained until all new-size bands are ready.
    h. Confirm the automated emulator scenario (`clock/e2e/perimeter-goal-scorer.spec.ts`) passes for the venue's fixture shapes.

## Evidence

Attach the calibration screenshot, browser console log, storage estimate, codec
matrix, and long-run timing notes to the deployment record. Do not enable the
second stadium until every step has a recorded result and the rollback target
is known.

Rollback is configuration-only: publish or remove the venue's `web` mapping so
the public Perimeter option disappears, then reconnect the physical output to
its previous playback path. Víkin remains `resolume` during this qualification.
