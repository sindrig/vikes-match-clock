# Web perimeter display, bands and diagnostics

All venues use browser playback. The gateway applies physical brightness only;
Resolume execution is retired. [Media commands](perimeter-media.md),
[mapping and rollout](perimeter-operations.md), and the
[#241 backend hold](../web-only-perimeter-rollout.md) have separate ownership.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## Web Perimeter Display

The local display target is persisted separately from Firebase in
`LocalStateContext`: scoreboard targets retain their selected screen key,
while the perimeter target is represented as `{ kind: "perimeter" }`. The
public display selector offers one Perimeter target for venues whose published
mapping uses `renderer: "web"`. Selecting it routes to `PerimeterDisplay`,
which is read-only and does not write match or perimeter state. The
authenticated selector offers a separate Perimeter entry for every venue with
a published perimeter mapping; it routes to the standalone perimeter manager,
not the scoreboard controller. Selecting the venue's scoreboard button only
switches the location: a persisted screen choice that still belongs to that
venue is preserved (the controller viewport never silently changes), and only
a stale or missing choice defaults to the venue's first screen. The runtime
`perimeter.enabled` controller flag
does not expose a browser target without a valid web mapping.

`PerimeterDisplay` uses `PerimeterWebGLRenderer` and `PerimeterRuntime` for
browser playback. Published geometry is validated before activation; media is
resolved only from the active Firebase Storage bucket and must include an
immutable Storage `generation`. Legacy ad-layout records remain parseable for
admin migration but are rejected by web playback until generations are
backfilled. `PersistentMediaCache` keys entries by bucket, object path, and
generation, replaces stale generations atomically, and reports quota or
persistence failures without imposing an arbitrary playlist-size limit.
Unauthenticated displays subscribe only to the public desired-state paths;
daemon-owned `perimeter/{location}` telemetry subscriptions are started only
for authenticated controllers so public screens do not generate permission
errors.
Scoped public Storage reads also support player/crest fallback; see the
[complete retained read boundary](perimeter-media.md#public-storage-read-boundary).
Anonymous writes and unrelated reads remain denied.

Base ads use a monotonic cue timeline and complete-revision preparation before
swapping pair slots. Overlays use the same two-target mapping and render above
the base channel. A derived **band channel** (player/substitution band, see
**Web Perimeter Player & Substitution Band** below) composites between the
two: base < band < overlay. A replacement overlay prepares completely while
the current generation remains visible; activation swaps atomically, then
releases superseded sources. Failed preparation retains the current overlay
(or leaves the base visible on cold start). Re-delivery of the active command
id is a no-op so a snapshot refresh never restarts playback. An overlay region renders only when its media is frame-ready
(videos below `readyState 2` are held on the base instead of re-sampling the
previous generation's texture). Power-off clears the WebGL framebuffer to
black. The renderer and runtime must remain read-only; Firebase continues to
be the source of truth for desired layout, overlay, and power state.

All venues use the web renderer. The fourth Firebase state subtree,
`states/{location}/perimeter`, carries the admin-managed `enabled` flag and
operator-controlled `state: "on" | "off"`. `parsePerimeterState()` validates
both; `setPerimeterState()` writes only the desired power state.
The power state also gates automatic physical brightness in the gateway.

`PerimeterControl.tsx` is the standalone management page for a venue with a
published web mapping. Venues without a valid mapping retain the settings
entry in the scoreboard controller so hardware brightness remains reachable.
The manager self-hides when `perimeter.enabled !== true`. Unconfigured venues
show a configuration notice and brightness controls; they never use a legacy
renderer or guessed geometry. Venues without a brightness controller remain
excluded by `VENUES_WITHOUT_BRIGHTNESS` (currently `virkid`).

The published mapping is the authority for ad lanes: `compatibilityKeys.base`
selects lane keys and `logicalScreens` provides labels. The frontend does not
subscribe to composition previews, applied ad layouts, overlay status, overlay
geometry, or scorer preparation requests/status, and never invokes
`prepareGoalScorerMedia`. Only authenticated hardware brightness telemetry at
`perimeter/{location}/brightnessStatus` remains. Display errors continue to
arrive through presence diagnostics.

Entering match view from idle turns the perimeter on; returning to idle turns
it off, only when enabled and after initial readiness. The transition baseline
still prevents commands on initial load or venue changes. All writes retain
the existing Firebase subscription, auditing, and write-eligibility behavior.

The [brightness-only gateway](../../perimeter-control/AGENTS.md) owns physical
I/O. Frontend retirement is merged, but the independently deployed preparation
Function remains for older clients under the [#241 rollout hold](../web-only-perimeter-rollout.md).

## Idle Perimeter Clock (web venues)

The perimeter manager offers a venue-wide `Klukka í biðstöðu` toggle, persisted
as `states/{location}/perimeter/idleClock` through the audited
`perimeter.set-idle-clock` action. Only boolean `true` enables it; missing or
invalid values are disabled. While the desired perimeter state is `off`, each
logical strip shows one bundled Víkingur R crest followed by white Icelandic
24-hour `HH:mm` time on black. `perimeter/idleClock.ts` composes native-size
canvases, independently wrapping left-to-right once per 60 seconds per strip.
The runtime refreshes their base-channel textures at up to 30 fps through
`baseDynamic`; existing mapping handles physical splits. This presentation
never changes overlay commands or their off/on lifecycle, and never activates
for an empty ad deck while on. Disabling the toggle while off restores black.
Loading is cancelled on state/location/mapping changes; canvases are released
on exit. There are no operator-adjustable visual parameters.

**Night blackout (`Næturstilling`) applies to the whole perimeter display**:
`PerimeterDisplay` reuses the main scoreboard's blackout window
(`states/{location}/view` `blackoutStart`/`blackoutEnd`, edited in
`MatchActionSettings.tsx`) through `useNightBlackout` with the same semantics
— the window only applies while `controller.view` is `idle` (a match or the
control view keeps the screens live at night). While blacked out, the display
forces the effective power off and never loads the idle clock, so every strip
renders black: no clock, no ads, and no bands or overlays. No desired state
(`perimeter.state`, `idleClock`) is written by the display; content returns
automatically once the window passes, and a prepared ad revision stays
resident underneath.

The same two fields are also editable in the perimeter manager:
`NightBlackoutSection` in `PerimeterControl.tsx` (web venues only, rendered
directly below the `Klukka í biðstöðu` toggle) shows the two `type="time"`
inputs bound to the shared `view.blackoutStart`/`blackoutEnd` fields through
the existing `useView()` actions (`view.set-blackout-start`/`-end`, audited).
There is no separate perimeter blackout config; both editors always write the
same node, and styles live in `PerimeterControl.css`
(`.perimeter-blackout-inputs`).

## Perimeter Display Diagnostics (Skjáarvillur)

Web perimeter screens report renderer problems to the controller so an
operator at the admin page can see a stuck/erroring screen without standing at
the venue. Screens are unauthenticated and can write only to the presence
path, so diagnostics ride along on each screen's existing presence record —
no new writable path, no shared-state writes, and the display remains
read-only.

**Data**: `presence/{location}/{connectionId}` (one record per connected
screen, auto-removed by `onDisconnect().remove()`):

```json
{
  "connectedAt": 1723392000000,
  "displayKind": "perimeter",
  "label": "Skjár A7F3",
  "resolution": "3840x1080",
  "error": "Perimeter media column 1 is missing left.",
  "errorAt": 1723392100000,
  "lastHeartbeat": 1723392160000
}
```

- `label` is a stable, human-readable per-browser label from
  `getOrCreateDisplayLabel()` in `lib/displayIdentity.ts` (localStorage
  `clock_displayLabel`, e.g. "Skjár A7F3"), so multiple venue screens are
  distinguishable across reloads. `resolution` is `window.screen.width x
window.screen.height`.
- `error`/`errorAt` are written on every connect (so a reconnecting screen
  re-reports immediately) and merged into the live record whenever the error
  changes; a null error removes both fields (screen reports healthy). Error
  text is truncated to 300 chars.
- `lastHeartbeat` is a `serverTimestamp()` refreshed once per minute while
  connected; a stale heartbeat (>3 min) flags a wedged browser tab even when
  the presence record is still connected. A screen that disconnects
  (crash/power loss/network drop) simply disappears from the list.

**Display side** — `App.tsx` wraps the whole app tree in
`DisplayDiagnosticsProvider` (`contexts/DisplayDiagnosticsContext.tsx`), which
owns the `useScreenPresence` call (unauthenticated screens only) and exposes
`reportError()` via `useDisplayDiagnostics()`. `PerimeterDisplay` reports its
derived error state: `null` when healthy, the `rendererError` message on
failure, and `"Engin gild perimeter stilling tiltæk."` when no published web
mapping exists — gated on `ready` so the brief pre-subscription window cannot
publish a phantom missing-mapping error. Successful `prepareBase`/overlay
preparation now **clears** a previously set error so recovered decks never
leave a stale error on the display or in the controller.

**Renderer-internal errors are propagated too.**
`PerimeterWebGLRenderer` accepts `PerimeterRendererOptions.onError`; problems
only detectable inside the render loop (a source larger than the GPU's
`MAX_TEXTURE_SIZE`) are reported through it once per state change (joined
message across affected texture keys) and re-reported after any change, so a
successful `prepareBase` cannot hide a still-broken texture.
`PerimeterDisplay` keeps this in a separate `textureError` state and joins it
with `rendererError` for both the on-screen `<p>` below the canvas and the
`reportError()` payload. Oversized **images** are recovered automatically:
the renderer redraws them into an offscreen `<canvas>` scaled to fit
`MAX_TEXTURE_SIZE` before `texImage2D` (no error, no black region);
oversized **videos** cannot be downscaled per frame, so they keep
skip-and-report behavior with the "Re-export the asset at a smaller size"
message.

**Admin side** — `hooks/useScreenReports.ts` subscribes to
`presence/{listenPrefix}` and returns validated entries sorted by label.
`controller/PerimeterDisplayReports.tsx` renders the **Skjáarvillur (jaðarskjáir)**
panel at the top of the web-venue ad-layout board (standalone page and modal):
one row per connected perimeter screen with label, resolution, a status badge
(`Villa` red / `Ósvöruð` orange on stale heartbeat / `Í lagi` green), the error
text with its time, and a warning when **zero** perimeter screens are
connected (often the real cause of a stuck deck). Styles live in
`PerimeterControl.css` under `.perimeter-display-reports*`.

**Rules** (`firebase-rules.json`): presence writes stay `true` per connection;
explicit `.validate` rules were added for the optional fields (`displayKind`,
`label`, `resolution` ≤ 40 chars, `error` ≤ 300 chars, `errorAt` and
`lastHeartbeat` numbers). Child-level rules only apply when the child exists,
so clearing a field via a `null` update is allowed.

**Known tradeoff**: diagnostics persist only while the screen process is
alive and connected. True crash-surviving error history would need a trusted
writer (e.g. a Cloud Function DB trigger copying errors into
`perimeter/{location}/displayErrors`); that is deliberately out of scope.

## Web Perimeter Player & Substitution Band

The web perimeter mirrors the scoreboard's current asset on a dedicated
**band channel** layered above the base ad deck and below the overlay
channel. The band is **derived**, never commanded: `PerimeterDisplay` reads
the already-subscribed public `controller.currentAsset` and calls
`PerimeterRuntime.setPlayerBand()` — no new Firebase write path, command
token, or audit event is created by band behavior (regression e2e:
`e2e/perimeter-player-band.spec.ts` asserts the audit trail stays empty).

**Request derivation** (`perimeter/bandDerivation.ts`,
`deriveBandRequest(controller.currentAsset)`):

- `PLAYER` / `NO_IMAGE_PLAYER` / `MOTM` → `{ kind: "player", identity }`:
  bounded non-empty name (≤ 80 chars, `fullName` preferred over `name`),
  digit-only shirt number (`[0-9]{1,4}` after trimming), and a non-empty
  `teamName`; `imageRef` is the card's own `asset.key` (absent for
  `NO_IMAGE_PLAYER`). Assets flagged `isGoalCelebration` are skipped —
  their perimeter twin is the goal-scorer overlay itself. MOTM cards add
  `motm: true` so the presentation can lead with the sponsor loop (see
  **MOTM sponsor lead-in** below); the flag is part of `bandRequestKey`,
  so the same player shown as a plain card and as man of the match are
  distinct band requests.
- `SUB` → `{ kind: "substitution", off, on }` derived from `subOut`
  (off the pitch) and `subIn` (coming on) under the corrected field
  semantics (see **Shared Home-Team Player Actions**); **both sides must
  yield a valid identity**, otherwise no band renders.
- Any other type, `null` current asset, or any invalid identity drops the
  band and the base ad deck shows through.
- Structural validation (including both leaf SUB cards) uses the canonical
  current-asset parser shared with the controller subscription. Derivation
  adds the band's name/number/team presentation restrictions downstream.
  Invalid identities yield no band rather than throwing from the display.

**Image chain** (`perimeter/bandSource.ts`, `PlayerBandSourceLoader`): the
identity's own image reference (a download URL, fetched through the
persistent media cache's URL-keyed `getUrl`) → team logo resolved by the
asset's team name (club override `logoUrl` first via the display's
`clubOverrides` subscription, then the bundled `clubLogos` crest map —
works for away teams) → the existing venue-crest chain
(`{location}/crest.png`). Everything unusable retains the previous state
and reports through the Skjáarvillur path.

**One-second portrait alternation** (web venues only): when the card's image
is an identifier-shaped `{location}/players/{id}.png` or `{id}-fagn.png`
Firebase download URL in the active bucket, the loader derives its sibling
object path and independently resolves its metadata/download URL (never reuses
the first object's token). Both poses are decoded before activation and cached;
presentations alternate every 1000 ms, starting with the card's original pose.
This applies to player cards, the player phase of MOTM (after the sponsor hold),
both substitution sides, and the semantic goal-scorer overlay. The existing
30 fps animation loop supplies elapsed time — no extra timers, downloads per
swap, shared-state writes, or entrance restarts. Each portrait retains its
aspect ratio within a slot reserved for the wider pose, keeping text and drift
spacing steady. A missing/unreadable/undecodable pose leaves the usable portrait
on screen; if neither works, the existing crest chain applies. Arbitrary,
cross-bucket, and cross-venue card URLs do not get sibling lookups. Both decoded
portraits are released on clear/replacement, including superseded preparations.
Main-scoreboard cards and previously generated files are unchanged.

**Runtime channel** (`perimeter/runtime.ts`): `setPlayerBand(band | null,
now)` with scorer-style generation lifecycle (atomic activation, stale
request invalidation, release of superseded sources, failure reporting). A
new request **keeps the active band visible while the replacement
prepares** and hands the fully prepared band to the renderer in one
transition — the base ads never show through between two consecutive
bands (e.g. queued substitutions); a failed preparation drops the held
band to the base and reports through the band error path. Explicit clears
(`null`) drop the band immediately. A re-delivery of the active or
already-preparing request is a no-op — requests are deduplicated with the
shared `bandRequestKey()` from `bandDerivation.ts`. While an overlay
generation is active the renderer receives **no band sources** (the band
object stays resident so clearing the overlay restores it without
re-preparation). Style changes
(`setPlayerBandStyle`/`setSubstitutionBandStyle`) and mapping replacements
recompose the resident band while keeping current textures visible (and
preserve the timeline anchor); a replacement swap starts a fresh entrance.
The WebGL renderer composites `base < band < overlay` with an independent
`bandDynamic` flag, and `clearChannel` accepts `"band"`.

**MOTM sponsor lead-in** (web venues): the main screen's MOTM card cycles
"Maður leiksins í boði..." (2 s) → the Bombay sponsor logo (2 s) → the
player (MOTM.tsx `idxSeconds`), so a MOTM band must never show the player
before the main screen does. MOTM requests lead with a sponsor loop frame:
the bundled `images/bombay.png` repeated
`[logo][gap as wide as the logo]` across the flat near-black field
(logo contain-fitted to the band height — the rendered logo size on the
LED screens is unknown, so every measurement scales from the band height),
faded in like the band entrance and held static for
`MOTM_BOMBAY_HOLD_MS` (3000 ms = 1.5× the main screen's sponsor phase),
then the player band takes over with its entrance replaying and the loop
never returns. `PerimeterDisplay` decodes the bundled logo once and passes
a `MotmLead` (`{ image, holdMs }`) into `createPlayerBandPresentations`;
a failed decode skips the lead-in. Style/mapping recomposition preserves
the band's timeline anchor, so a recomposition after the hold draws the
player phase directly without replaying the loop.

Band preparation errors are tracked separately from renderer/base/overlay
and texture errors. A successful band replacement or removal clears only
the band error in the display and Skjáarvillur diagnostics; a superseded
preparation cannot overwrite the current band's error state.

**Presentations** (`perimeter/playerBandPresentation.ts`): the player band
repeats `[portrait | number | name]` units on a flat near-black field with
a 600 ms alpha fade-in, drifting right-to-left at ~1.5× the shared
reference drift speed (`plain`/`glow`) or ~2× (`streamer`). All sliding
presentations were doubled in speed (reference `height * 0.00024 px/ms`,
2× the original 0.00012 "procession" pace) after operators found the slide
too slow — the scorer `procession` style in `scorerPresentation.ts` uses
the same doubled constant. `glow` adds a
soft portrait glow pulse and `streamer` thin speed lines. The substitution
band repeats
`[off portrait | number | name] [gap] [on portrait | number | name]` with
**no directional marks** — the outgoing player's number and name render in
red (`SCORER_PRESENTATION_COLORS.accent`) and the incoming player's in
green (the main-screen substitution green `#00a651`), the only in/out
signal — with entrances per style (`static`: fade then hold, `relay`: fade
then drift at the player-band default speed, `flash`: impact flash +
scale-down pop). Speeds are defined per style; there is no separate knob.

Fade-in alpha and substitution text colors are passed explicitly through
the unit drawing helpers' motion arguments (`drawBandUnit` in
`scorerCompositor.ts` accepts an optional `textColor`; the static band
keeps its default white). Presentation tests record alpha and fillStyle at
the actual draw calls with save/restore semantics so a helper cannot
silently override the entrance opacity or palette.

**Style config** (parallel to `scorerCelebration`):

- `types.ts`: `PlayerBandStyle` ("plain" | "glow" | "streamer"),
  `DEFAULT_PLAYER_BAND_STYLE = "plain"`, `playerDisplayStyle` on
  `PerimeterState`; `SubstitutionBandStyle` ("static" | "relay" |
  "flash"), `DEFAULT_SUBSTITUTION_BAND_STYLE = "static"`,
  `substitutionStyle` on `PerimeterState`.
- `firebaseParsers.ts` strict-parses both fields (`parsePlayerDisplayStyle`,
  `parseSubstitutionStyle`); absent or invalid values fall back to the
  defaults in the display. `firebase-rules.json` validates both children
  under `states/$location/perimeter` with the same enum shape as
  `scorerCelebration`.
- `FirebaseStateContext.tsx`: `setPerimeterPlayerDisplayStyle` (audited
  `perimeter.set-player-display-style`) and `setPerimeterSubstitutionStyle`
  (audited `perimeter.set-substitution-style`), each writing only its own
  field, gated on write eligibility, and exposed via `usePerimeter()`.
- Admin UI: **Leikmannaborð** (Default/Glow/Streamer) and
  **Skiptingaborði** (Static/Relay/Flash) picker sections in the
  standalone perimeter manager (web venues only), adjacent to the
  Markasvör section, with the same pending-write disable pattern.
