# Perimeter media and semantic scorer commands

The published web mapping supplies geometry and compatibility lanes. Keep
version-1 files, version-2 scorers, named pairs and immutable Storage generations.
See [display lifecycle](perimeter-display.md), [mapping operations](perimeter-operations.md),
and the [retained Functions rollout hold](../web-only-perimeter-rollout.md).

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## Perimeter Overlay (Goal-Triggered Video Sequences)

When a **home goal** is scored, a Firebase-controlled perimeter overlay
sequence is triggered. The overlay plays paired video columns on the perimeter
LED screens above the existing `Efni` advertisements, then loops the final
column until explicitly cleared.

**Firebase path**: `states/${listenPrefix}/perimeter/overlay`

When the home goal button is pressed, the controller writes the
**operator-configured goal video** as a version-1 overlay command. The config
lives at `states/${listenPrefix}/perimeter/goalVideo` and is edited from the
standalone perimeter manager's **Markamyndband** section (one file per overlay
target, picked or uploaded from `{listenPrefix}/perimeter/` in Storage):

```json
{
  "files": {
    "2": {
      "name": "goal-48.mp4",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4",
      "generation": "1700000000000001"
    },
    "4": {
      "name": "goal-40.mp4",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-40.mp4"
    }
  }
}
```

- `parsePerimeterGoalVideo()` requires exactly the two overlay targets (`"2"`
  and `"4"`) with distinct names, bucket- and location-scoped like overlay
  columns; a malformed config is dropped and the legacy fallback applies.
- **Fallback**: with no (or an invalid) config, the controller uses the legacy
  `goal-48.mp4` + `goal-40.mp4` pair under `{location}/perimeter/` in the
  **active environment's bucket** (`FIREBASE_STORAGE_BUCKET`) — never the
  hardcoded production bucket, which the environment-scoped overlay parser
  would reject.

```json
{
  "version": 1,
  "id": "uuid",
  "columns": [
    {
      "durationMs": 10000,
      "files": {
        "2": {
          "name": "goal-48.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4"
        },
        "4": {
          "name": "goal-40.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-40.mp4"
        }
      }
    }
  ]
}
```

- `overlay: null` clears the overlay and reveals the existing base/band channels.
- Each file column retains the two protocol keys `"2"` and `"4"`. The
  published mapping's `compatibilityKeys.overlay` maps these to logical
  screens; the keys do not imply screen geometry.
- Earlier columns advance after `durationMs`; the final column loops until
  cleared. The base ad timeline continues independently beneath the overlay.
- A new command `id` prepares a replacement while the active overlay remains
  visible. A complete generation activates atomically; failure retains the
  current overlay (or base on cold start). Undecoded new video slots hold on
  the base instead of sampling the released generation's texture.
- Sources must belong to the active environment's bucket and the current
  venue's approved Storage prefix. Existing generated files remain valid
  version-1 media; no remote cleanup is part of this phase.

The web display renders the overlay command directly. Renderer problems are
reported through the existing presence diagnostics; the controller does not
read the retired daemon overlay-status path.

**Clearing**: The "Hreinsa virkt overlay" button in the controller UI clears
both the main screen overlay (`controller.currentAsset`) **and** the perimeter
overlay (`states/${listenPrefix}/perimeter/overlay`).

**Away goals** do not trigger a perimeter overlay — only home goals.

Types are defined in `types.ts`:

- `PerimeterOverlay` — discriminated union: `PerimeterFileOverlay` (version 1,
  timed file columns) or `GoalScorerOverlayCommand` (version 2, semantic web
  scorer — see **Web Goal Scorer Overlay (Browser Composition)** below)
- `PerimeterOverlayColumn` — a column with duration and paired files
- `PerimeterOverlayFile` — filename + GCS source

Parsing is in `firebaseParsers.ts`:

- `parsePerimeterOverlay()` — strict validation (discriminated union on
  version, id bound, column count, duration bounds, paired targets, filename
  safety, approved bucket only; version-2 scorer payload bounds; mixed shapes
  rejected).

Write actions are in `FirebaseStateContext.tsx`:

- `setPerimeterOverlay(overlay)` — writes overlay document
- `clearPerimeterOverlay()` — writes null to clear

These are exposed via `usePerimeter()` hook.

## Named Perimeter Media Pairs (Manual Overlay Library)

An operator-curated library of **named overlay pairs** that share the same
active overlay channel as the home-goal overlay. Each pair binds a required
name to exactly two perimeter files: one for the 48-screen target (layer `"2"`)
and one for the 40-screen target (layer `"4"`). Files may be images or videos.
An optional `mainScreenAsset` links an existing ordinary image/video from the
**Myndefni → Myndir** library, turning the pair into a three-screen set without
uploading the main-screen media again. Existing pairs remain perimeter-only.

**Firebase path**: `states/${listenPrefix}/perimeter/mediaPairs/{pairId}`

```json
{
  "name": "Sindri",
  "files": {
    "2": {
      "name": "48-1723392000000-sindri.mp4",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/48/48-1723392000000-sindri.mp4",
      "generation": "1700000000000000"
    },
    "4": {
      "name": "40-1723392000000-sindri.png",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/40/40-1723392000000-sindri.png",
      "generation": "1700000000000001"
    }
  }
}
```

- `pairId` is a UUID generated before upload and used as both the map key and
  the source-path segment.
- `name` is required, trimmed, non-empty, and bounded (≤ 80 chars).
- Each file record carries the object's immutable Storage `generation`, captured
  from the upload result when the pair is created. Legacy records that omit it
  are still playable: the web display backfills missing overlay generations
  from Storage metadata before loading (`backfillOverlayGenerations`, shared
  with the base-layout backfill).
- Each pair has exactly the two targets `"2"` and `"4"`. Layer `"2"` files must
  live under `{location}/perimeter-overlays/{pairId}/48/`; layer `"4"` files
  under `.../40/`. A path/layer mismatch is rejected.
- Filenames are generated and must satisfy the retained safe-basename parser
  contract; the two targets must have distinct filenames.
- Sources must use the approved Firebase bucket and the pair's own prefix, and
  the suffix after the target folder must be exactly one safe filename
  (no subdirectories and no `..`). These path constraints remain part of the
  media protocol after the daemon media executor's retirement.
- `mainScreenAsset`, when present, is a `MainScreenMediaAsset` with `key`,
  `name`, `url`, and `type` (`IMAGE` or `VIDEO` only). Video assets include
  `loop: true`, matching ordinary main-screen media playback. It is outside
  the perimeter `files` map and never reaches the daemon or perimeter renderer.

**Showing** a pair writes a fresh `PerimeterOverlay` to the existing command
path `states/${listenPrefix}/perimeter/overlay` with a new command `id` and a
single column (`durationMs: 10000`) holding the pair's two files. Because the
web runtime holds the final column until clear, the pair loops until cleared. The
overlay channel is single-writer: showing a pair replaces a home-goal overlay
and a subsequent home goal replaces the pair (last command wins).
If the entry has `mainScreenAsset`, the same **Sýna** click also calls the
existing controller `showItemNow` with stable library identity and a fresh
`currentAsset.occurrenceId`: the main-screen
queue stops, the image holds or video loops until cleared/replaced, and
re-selecting the entry restarts its main-screen media. These use the existing
audited main-screen and perimeter actions, not frame-synchronized playback.
Perimeter-only entries leave the main screen unchanged.

**Clearing** is available both in the new "Jaðarefni" media tab ("Hreinsa
jaðarskjá") and via the existing global "Hreinsa virkt overlay" button. Both
write `overlay: null`; either clears whichever overlay is active and restores
the rotating base ad deck.
The tab additionally offers **Hreinsa alla skjái**, which clears the main-screen
asset (and stops its queue) as well as the perimeter overlay; **Hreinsa jaðarskjá**
remains perimeter-only.

Types in `types.ts`:

- `PerimeterMediaPair` — name + per-target `PerimeterOverlayFile` map and an
  optional `MainScreenMediaAsset`.

Parsing in `firebaseParsers.ts`:

- `parsePerimeterMediaPairs()` — validates the pair library (pair ID, name,
  exact `"2"`/`"4"` key set, safe distinct filenames, target-specific paths,
  pair-ID/source consistency, approved bucket + location).
- `parseMainScreenMediaAsset()` restricts the optional link to ordinary
  image/video assets with bounded non-empty key/name and an HTTP(S) URL,
  normalizes video looping, and strips unrelated fields. Malformed optional
  links are omitted without losing a valid perimeter pair.

Context in `FirebaseStateContext.tsx`:

- Subscribes to `states/{listenPrefix}/perimeter/mediaPairs` and exposes
  `mediaPairs` through `usePerimeter()`.
- `createPerimeterMediaPair(pairId, pair)` — writes the library record (the
  UI uploads both files first, then writes the record).
- `deletePerimeterMediaPair(pairId)` — removes only the library record;
  Firebase Storage assets are left in place.
- `setPerimeterMediaPairMainScreenAsset(pairId, asset | null)` — audited
  leaf-only update of an existing entry's optional main-screen link; never
  replaces the pair's name/files or deletes media. Ineligible writes and
  Firebase failures reject so the editor stays open with feedback.

UI in `controller/media/PerimeterMediaPairs.tsx` (fifth "Jaðarefni" tab):

- Text-only cards (name + both filenames + linked main-screen filename), no
  thumbnails and no Storage download-URL lookups.
- `Nýtt jaðarefni` modal: name + required 48/40 file pickers (`image/*,video/*`).
  Uploads both files (waiting for both to settle), then writes the library
  record; if an upload or the record write fails, any files that already
  landed in Storage are best-effort deleted so nothing is orphaned.
- The create modal includes an optional `MainScreenMediaPicker`; each existing
  card's **Stórskjár** action opens the same picker to attach, change, or detach
  the link without reuploading perimeter files. It reuses `ImageList` (selected
  assets now carry their filename), browses nested `images/` folders, preserves
  the `safamyri` → `fotbolti` library alias, and never offers deletion/upload.
  **Vista** saves the draft; cancel leaves the saved entry unchanged.
- Green **Sýna** action, red **Fjarlægja** (confirmation), tab-local
  **Hreinsa jaðarskjá** / **Hreinsa alla skjái**, and write-error feedback. Mutations are disabled while Firebase write
  eligibility is unavailable.

`e2e/perimeter-media-pairs.spec.ts` covers selecting existing media when creating
a triple, one-click main/perimeter commands, detaching without changing current
playback, perimeter-only behavior, and clearing all screens using the emulator.

This system is distinct from the rotating base ad-deck (`adLayout`) and never
becomes selectable base-ad content. The three perimeter systems are:

| System            | Storage                                          | Command path                           | Layers                                  |
| ----------------- | ------------------------------------------------ | -------------------------------------- | --------------------------------------- |
| Base ad deck      | `{location}/perimeter/`                          | `states/{location}/perimeter/adLayout` | published `compatibilityKeys.base`      |
| Home-goal overlay | `{location}/perimeter/`                          | `states/{location}/perimeter/overlay`  | protocol keys 2,4 via published mapping |
| Named media pairs | `{location}/perimeter-overlays/{pairId}/48\|40/` | `states/{location}/perimeter/overlay`  | protocol keys 2,4 via published mapping |

## Perimeter Ad Layout (Web Base Ads)

The controller writes the desired `PerimeterAdLayout` to
`states/{location}/perimeter/adLayout`. Each version-1 layout has an opaque
`revision` and ordered `columns`; each column has a stable `id` and a
`files` map keyed by the published mapping's `compatibilityKeys.base`.
Files hold a safe basename, a same-environment `gs://` source under the
venue's `perimeter/` prefix, and an optional immutable Storage `generation`.
An empty columns array clears the base deck. The web display backfills missing
generations before playback and applies the existing complete-revision and
cue-boundary behavior. Legacy file records remain readable; reads never
migrate persisted state.

`parsePerimeterAdLayout()` keeps version/revision, column-count (20), complete
lane-set, safe-name/source, and duplicate-id checks. `setPerimeterAdLayout()`
writes an audited complete desired layout; rejections propagate to the board.
`usePerimeter()` exposes `adLayout` and its write action. There is no applied
layout subscription, phase/revision comparison, or daemon freshness badge.

The board supports add, delete, and horizontal drag reorder. File selectors
browse/upload `{location}/perimeter/`, capture Storage generations, and save
only with a file for every published lane. Thumbnails resolve directly from
Storage through `PerimeterFileThumb.tsx` (cached download URLs, lazy images,
first-frame video, and an unavailable placeholder). Deleting a column removes
only references. Layout writes retain their existing serialization and
subscription-settling behavior; errors keep the board/dialog open.

The standalone header retains `Næsti dálkur` (new `skipCue` token, disabled
while off or empty) and `Endurræsa skjá` (new `refreshToken`). First deliveries
establish baselines; only changed tokens advance/reload the web displays.
These commands remain separate from global scoreboard refresh. No queue,
media lifecycle, or write-freshness protocol changes are part of Phase 1.

Types: `PerimeterAdLayout`, `PerimeterAdLayoutColumn`,
`PerimeterAdLayoutFile`, and `PerimeterAdLane`.

## Goal Scorer Selection

`GoalScorerDialog.tsx` validates the selected player and submits a fresh
version-2 browser scorer command only when the canonical venue has a valid
published web mapping. The main-screen reveal is submitted first. Missing or
invalid mappings, unsafe player identifiers, missing numbers, and empty names
never produce a perimeter scorer command; the independent main-screen reveal
continues through the existing player/portrait fallback path.

Scorer selection remains open until the main-screen and applicable perimeter
writes acknowledge success. A rejection keeps the current dialog open with an
error for explicit retry. Each selection owns its asynchronous continuation:
dismissal, unmounting, or a newer selection retires the old continuation, so
late media/write results cannot submit further commands, close a reopened
dialog, or replace its error. Already-submitted writes remain irrevocable.
Browser journeys must wait for the completed selection's dialog to disappear
before adding another goal, and use normal button actionability; a forced
click can hit the still-visible modal during its exit animation.

The dialog and shared `TeamPlayerSelectionModal` have no generated-media
readiness labels. There is no preparation panel, roster-signature effect,
retry action, request write, geometry/status subscriber, or callable trigger.
Version-1 files already referenced by goal videos, media pairs, or old overlays
remain supported, including files from previous generated-media jobs. Do not
remove these Storage objects as part of frontend retirement.

The independently deployed preparation Function remains unchanged for older
clients until rollout and the separate Phase 2 release described in
[the deployment hold](../web-only-perimeter-rollout.md).

## Web Goal Scorer Overlay (Browser Composition)

At a venue whose published mapping says `renderer: "web"`, the perimeter
browser composes the goal-scorer band locally from a semantic command — no
Cloud Function, generated files, daemon geometry, or preparation status are
involved.

**Command schema** (`states/{location}/perimeter/overlay`, version 2):

```json
{
  "version": 2,
  "kind": "goal-scorer",
  "id": "uuid",
  "player": { "id": "2492", "name": "Jón Jónsson", "number": "7" }
}
```

The active overlay channel is a **discriminated union**
(`PerimeterOverlay = PerimeterFileOverlay | GoalScorerOverlayCommand` in
`types.ts`):

- Version 1 (`PerimeterFileOverlay`) — unchanged: timed `columns` of paired
  overlay files (home-goal videos, named media pairs, previously generated
  scorer files).
- Version 2 (`GoalScorerOverlayCommand`): semantic player data for browser
  composition. `player.id` is a safe identifier (`[A-Za-z0-9_-]{1,64}`, also
  used to derive the approved celebration-image path), `name` is a bounded
  (≤ 80 chars) non-empty display name, and `number` is a digit-only string
  (≤ 4 digits). Every selection generates a new command `id`, so re-selecting
  the same player is still a new replacement request.

The command deliberately contains **no** generated file references, download
URLs, location, bucket, colors, dimensions, or layout values: the active
subscription scopes the location, the deployment provides the bucket, and the
published web mapping provides the logical-screen dimensions.

Parsing (`parsePerimeterOverlay`) and the RTDB rules
(`firebase-rules.json` → `states/$location/perimeter/overlay`) accept both
shapes and reject mixed documents (a version-2 command carrying `columns`, a
version-1 command carrying `kind`/`player`), unknown children, and
oversized/bounded violations. `buildGoalScorerOverlayCommand()` serializes a
validated selection; `goalScorerPlayerFromSelection()` validates roster
players for semantic submission.

**Browser composition** (`perimeter/scorerCompositor.ts`):

- `ScorerSourceLoader` derives the same-location approved paths
  `{location}/players/{playerId}-fagn.png` (celebration) and
  `{location}/crest.png` (fallback), resolves immutable Storage generation
  metadata, and loads through the persistent media cache. The celebration
  image and `{location}/players/{playerId}.png` regular portrait are preloaded
  together. With both usable, scorer presentations alternate between them
  every second, starting with the celebration pose; with only one usable,
  that portrait stays visible. The crest is used only when both portraits
  are missing, unreadable, or undecodable. When the Storage crest is also unusable, the loader falls
  back to the **bundled club crest** for the venue's home team (resolved via
  `match.homeTeam` → `images/clubLogos`), so the band always renders
  crest + number + name and a missing `crest.png` object never breaks the
  overlay. Only when every source is unusable does the previous overlay stay
  (or the base stay unobscured on cold start) and the error surface through
  the display diagnostics.
- `composeScorerBand()` draws one static 2D-canvas band at each configured
  overlay logical screen's native dimensions, repeating
  `[portrait-or-crest fitted to the band height (contain, never cropped) | shirt number | fitted name | gap]`
  left to right until the width is covered (final repetition clipped). All
  measurements scale from the band height with the same multipliers as the
  server renderer (gap 0.45, number font 0.55, name font 0.28, name area
  3.0×height), text uses the bundled GT America bold, and the name shrinks
  toward a defined minimum before truncation so repeated units never overlap.
  Fonts are awaited through the font-loading API before measuring; composition
  is a pure, independently unit-testable module (see
  `perimeter/scorerCompositor.spec.ts` and the snapshot specs) and never a DOM
  component over the WebGL canvas.
- `PerimeterRuntime` dispatches on the command version: file commands keep
  timed multi-column playback; scorer commands load the source, await fonts,
  create one animated presentation per overlay logical screen
  (`perimeter/scorerPresentation.ts`), and hold those presentations until
  clear or replacement. Both branches share the prepared-generation
  lifecycle: atomic activation, stale-request invalidation (only the latest
  command wins), and release of superseded resources. A replacement command
  retains the active generation while the new band prepares, then swaps
  atomically; an unsuccessful preparation leaves it intact. At activation,
  cleared renderer slots prevent an undecoded overlay video from sampling
  the released generation's texture; its region holds on the base instead. Replacing the published
  mapping while a scorer is visible reruns composition at the new logical
  dimensions before swapping textures; a recomposition failure retains the
  current textures.
- Scorer failures report through the existing **Skjáarvillur** diagnostics
  channel with bounded, safe messages (no bucket URLs or auth details). The
  renderer stays read-only: nothing in the web display writes Firebase state.

**Goal-scorer celebration presentations** (`perimeter/scorerPresentation.ts`):

- The scorer band is animated by the display browser. Each logical screen
  gets a `ScorerPresentation` — a canvas plus `draw(elapsedMs)` — that the
  runtime advances at a maximum of 30 fps while the scorer command is active.
  The elapsed time is anchored at the first visible render after activation,
  so the entrance always plays from the moment the scorer appears. Because
  the canvas identity never changes, the renderer receives
  `overlayDynamic: true` only when that capped animation frame advances;
  intervening display refreshes reuse the existing WebGL texture while base
  videos continue updating at the browser's render rate.
- Every style shares one entrance language (constants in
  `SCORER_PRESENTATION_TIMELINE`): a ~140 ms white impact flash, a red wipe
  edge crossing the band, and a left-to-right foreground reveal ending
  ~800 ms in, followed by a slow ambient loop. The foreground unit layout
  (portrait contain-fit, shirt number, fitted name) is unchanged from the
  static band; `drawBandUnit` in `scorerCompositor.ts` accepts optional
  motion (portrait scale/alpha, text slide/alpha, unit alpha) that only the
  presentations use, so `composeScorerBand()` geometry and snapshots are
  unchanged.
- The five styles selectable in the perimeter admin view
  (`states/{location}/perimeter/scorerCelebration`, default `ribbon`):
  - `ribbon` — "Sjálfgefið": black-to-red kinetic field, racing diagonal
    streaks, ambient glow sweep every 4 s.
  - `tunnel` — giant low-contrast `MARK` typography scrolling
    right-to-left behind the band plus thin speed lines.
  - `wave` — red radial energy breathing from every portrait center with a
    bright pulse travelling along the band.
  - `procession` — the repeated units themselves drift slowly
    right-to-left (height-relative speed, seamless unit wrap).
  - `cutout` — portrait scale-down pop with a pulsing glow while the
    number and name slide in slightly later.
- The style lives in the parsed `PerimeterState`
  (`perimeter.scorerCelebration`), written by
  `setPerimeterScorerCelebration()` (audited as
  `perimeter.set-scorer-celebration`) from the **Markasvör** section in the
  standalone perimeter manager at configured web venues. Absent or invalid
  values fall back to `DEFAULT_SCORER_CELEBRATION_STYLE`. The display applies
  the style before the overlay effect runs, and a style change while a scorer is
  visible recomposes the active command's presentations; failures retain
  the current textures.

## Public Storage read boundary

[Storage rules](../../storage.rules) also permit public reads below the venue's
`perimeter/` and `perimeter-overlays/` prefixes. For scorer/player fallbacks, anonymous reads are permitted only
for the exact `{location}/crest.png` object, `{location}/players/{id}-fagn.png`
celebration objects, identifier-shaped `{location}/players/{id}.png` card
photos (`[A-Za-z0-9_-]{1,64}(-fagn)?[.]png`), and `{location}/club-logos/**`
override logos; writes stay authenticated-only, and all other player media
remains private.
