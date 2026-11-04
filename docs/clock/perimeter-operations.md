# Web perimeter mapping and rollout

Use the [measurement procedure](../../perimeter-control/WEB_MAPPING_MEASUREMENT.md)
and [Windows/Chromium qualification](../../perimeter-control/WEB_RENDERER_QUALIFICATION.md)
for authorized venue work. These procedures are not evidence that this checkout
has qualified hardware. The [#241 rollout hold](../web-only-perimeter-rollout.md)
is authoritative for retained backend preparation and Phase 2 sequencing.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

The browser perimeter target is a local display identity, persisted as
`clock_displayTarget: { "kind": "perimeter" }` alongside
`clock_listenPrefix`. Firebase remains authoritative for the desired perimeter
state, base layout, overlay command, and mapping discovery; the anonymous
renderer never writes those paths. `RefreshHandler` reloads either display
kind when `controller.refreshToken` changes, and disconnect clears both local
values.

Web playback requires a published `locations/{location}/perimeterDisplay` with
`renderer: "web"`, validated geometry, and immutable Storage `generation`
metadata on every referenced base or overlay object. The renderer downloads a
complete base revision into persistent Cache Storage before playback, validates
pair completeness, and retains the previous complete revision if a replacement
or quota check fails. Media whose dimensions differ from the configured
logical-screen dimensions only log a console warning — the WebGL renderer
samples the full texture with normalized UVs, so such content is stretched
(with skew) to fill the region instead of blocking playback. Sources larger
than the GPU's `MAX_TEXTURE_SIZE` (e.g. 8192 px on the venue GPUs) no longer
black out their region: images are downscaled into an offscreen canvas that
fits the limit before `texImage2D`, while oversized videos are skipped and
reported through the renderer's `onError` (surfaced on the display and in the
[Skjáarvillur panel](perimeter-display.md#perimeter-display-diagnostics-skjáarvillur)). Videos
shorter than the cue duration loop at natural rate; videos longer than the cue
duration play faster when the browser supports the required rate, otherwise
they are cut at the cue boundary.

## Mapping publication

Administrators measure a packed framebuffer and logical strips, then edit the
mapping under `Stjórnborð` → `Staðsetningar` → the venue's `Perimeter mapping`
section. A venue without a mapping shows a **Nýtt perimeter mapping** button
that materializes an editable draft (first screen as a single logical screen,
20 s cue default) so a first mapping can be bootstrapped and published from
the UI instead of a hand-written Firebase document. The editor keeps changes
in a local draft, can show a calibration
preview, validates exact source coverage, and publishes a new revision in one
atomic metadata update that preserves unknown fields. Its Playback control
edits the base-ads cue
length in seconds (stored as `playback.cueDurationMs`, defaulting to 20 s
when absent); validation rejects non-positive durations, and short videos
loop while long ones speed up to fit the configured cue. Besides the generic
"Identity mapping" and "Horizontal split" templates, the editor offers two
venue templates: "Víkin úti (sannreynt)" (`applyVikinOutdoorTemplate` in
`perimeter/templates.ts`), which reproduces the physically verified
Víkin-outdoor layout from the vikin-gateway handoff
(`default-venue.json`) — a 3840x1080 framebuffer with screen-40 as one full
strip at y=0 and screen-48 split into two stacked halves at y=192 (keeping
the captured `x=-2`, width-2308 scaled/clipped calibration quirk, the only
region with `allowScaling`/`allowClipping`) and y=384 — and
"Virkið (sannreynt)" (`applyStackedTemplate`), a generic widest-first
stacked layout that reproduces the published Virkið staging document
(3648x384 framebuffer, screen-3648 at y=0, screen-3264 at y=192). Both are
no-ops for drafts lacking the expected logical screens. See
`perimeter-control/WEB_MAPPING_MEASUREMENT.md` and
`perimeter-control/WEB_RENDERER_QUALIFICATION.md`. These template measurements
remain historical references, not fresh physical qualification. Runtime mappings now accept only
`renderer: "web"`; missing/invalid mappings are unconfigured, with no inferred
geometry.

## Client rollout and rollback

The [#241 checklist](../web-only-perimeter-rollout.md) owns frontend rollout,
older-client refresh, retained Functions and later backend deletion. A successful
bundle deployment alone does not prove all active/suspended clients were refreshed.
For v2 semantic scorers, deploy/refresh displays that can parse v2 before enabling
controller emission. Before reverting to a client that cannot parse v2, clear
its semantic overlay through the authorized controller.

Qualified scorer cases include both portraits/alternation, each crest fallback,
all-sources failure, long names, clear, power off/on and mapping replacement;
use the linked physical checklist and `clock/e2e/perimeter-goal-scorer.spec.ts`
for their distinct evidence. Preserve v1 files/pairs, compatibility keys,
generation backfill/cache and existing generated media throughout rollback.

The [physical qualification procedure](../../perimeter-control/WEB_RENDERER_QUALIFICATION.md)
owns rollback to a previously qualified web mapping/media revision and kiosk
configuration. Disabling/removing a mapping leaves output unconfigured and
removes its public selector target; it never activates another playback path.
Do not delete the prior cached revision until the replacement is qualified.
The retired Resolume executor is not a rollback target; retain Vnnox/UCenter
connectivity for physical brightness.

## Storage CORS

**Storage CORS (one-time bucket configuration)**: unlike `<img>` tags elsewhere
in the app, the perimeter media loader downloads via `fetch()` into Cache
Storage (`cache.ts`), which the browser blocks with
"Cross-Origin Request Blocked … CORS header ‘Access-Control-Allow-Origin’
missing" unless the bucket's CORS configuration allows the display origin. The
Firebase-created buckets have no CORS configuration by default. Apply
`scripts/storage-cors.json` with `scripts/set-storage-cors.sh` (requires
`gcloud` authenticated with `storage.buckets.update` on both projects); it
allows `GET`/`HEAD` from `klukka.irdn.is`, `staging-klukka.irdn.is`, and the
localhost ports 3000 and 8000. Other local ports (such as 4500) are not
in the committed allowlist. This is a separately authorized bucket operation,
not frontend setup. Inspect the actual [CORS config](../../scripts/storage-cors.json)
and [operator helper](../../scripts/set-storage-cors.sh) before changing anything.
