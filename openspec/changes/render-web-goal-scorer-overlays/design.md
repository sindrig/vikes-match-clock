## Context

See `proposal.md` for motivation and the delta specs for behavior. The current controller writes one version-1 file overlay document to `states/{location}/perimeter/overlay`; both the Resolume daemon and `PerimeterRuntime` consume its timed columns. Selecting a scorer can replace that generic goal overlay only after `prepareGoalScorerMedia` has rendered and uploaded a file pair using daemon-published geometry.

The web display already normalizes overlay lane keys to logical screens, downloads complete replacement media before activation, and renders texture sources through one packed WebGL canvas. It is anonymous and read-only for desired state. The output mapping, not CSS layout, defines the physical target dimensions and placement.

## Goals / Non-Goals

**Goals:**

- Represent a web goal scorer as validated semantic data in Firebase.
- Create deterministic static band textures in the display browser at each overlay logical screen's native dimensions.
- Preserve atomic replacement, stale-request rejection, clear, power, diagnostics, and base-playlist behavior.
- Keep version-1 file overlays and the complete Resolume preparation pipeline operational.
- Make composition logic deterministic and independently unit-testable without browser screenshots or live Firebase.

**Non-Goals:**

- Rendering arbitrary React DOM or CSS into the perimeter framebuffer.
- Adding animated scorer templates, a template editor, or operator-selectable styles.
- Converting named media pairs or generic goal videos to semantic overlays.
- Removing the Cloud Function, generated scorer files, daemon geometry, or preparation status while a Resolume venue still uses them.
- Sharing one frame clock across separate browser processes or computers.

## Decisions

### 1. Extend the overlay document as a discriminated command union

The existing version-1 file command remains unchanged. A scorer command uses a separate version and explicit kind:

```json
{
  "version": 2,
  "kind": "goal-scorer",
  "id": "uuid",
  "player": {
    "id": "123",
    "name": "Jón Jónsson",
    "number": "7"
  }
}
```

The parser returns a discriminated `PerimeterOverlay` union and rejects mixed shapes, extra missing discriminator data, empty or overlong text, unsafe player identifiers, and invalid shirt numbers. Firebase rules accept either the established version-1 shape or the bounded version-2 shape. Every scorer selection generates a new command ID, so selecting the same player again is still a new replacement request.

The command does not contain generated file references, download URLs, location, bucket, colors, dimensions, or layout values. The active subscription already scopes location; the deployment provides the bucket; and the published mapping provides dimensions. Keeping those values out prevents stale geometry, cross-location sources, tokenized URLs, and style drift in persisted state.

Alternatives considered:

- Reuse version 1 with synthetic columns and optional player fields. Rejected because file and semantic commands would be ambiguous and every existing consumer would need defensive field combinations.
- Add a sibling `goalScorerOverlay` state path. Rejected because independent commands could race, clear separately, or display simultaneously despite there being one physical overlay channel.
- Put a downloadable HTML or SVG document in Storage. Rejected because it recreates generation/upload lifecycle and introduces a larger untrusted rendering surface.

### 2. Select semantic versus prepared-file behavior at the controller boundary

The scorer dialog resolves the active venue's published renderer configuration before submitting the perimeter replacement:

- `web`: validate the selected player's id, name, and number and write a version-2 scorer command immediately.
- `resolume`: retain the current readiness lookup and write a version-1 prepared file pair only for `ready` or `fallback` results.
- missing or invalid mapping: leave the generic goal overlay unchanged.

The main-screen player reveal remains independent and is submitted first. Web venue roster effects do not request `goalScorerPreparation`, subscribe to preparation status for eligibility, or require daemon geometry. Preparation UI remains available only for Resolume venues.

Selecting the path at command creation keeps the daemon unchanged: it never receives a semantic command for a correctly configured Resolume venue. Parser support remains global so all controllers can observe and clear either command safely.

Alternative considered: always write the semantic command and have a trusted service translate it to files for Resolume. Rejected because it adds a new asynchronous bridge, changes daemon ownership, and does not simplify the existing reliable Resolume path.

### 3. Compose with a pure 2D canvas renderer, not DOM rasterization

A browser compositor accepts validated player data, one decoded image, a logical target width/height, and fixed style tokens. It returns an `HTMLCanvasElement` sized to that logical screen. The algorithm draws repeated units from left to right:

```text
[portrait or crest fitted to the band height] [shirt number] [fitted player name] [gap]
```

All measurements scale from target height. The image is always contained within the band height — the full source is drawn, never cropped top/bottom or sides, matching the server band renderer's contain resize. Number and name use bundled font families and weights; composition waits for the required fonts through the browser font-loading API. Name text is measured and reduced to a defined minimum size before truncation, ensuring one unit cannot overlap the next. Drawing stops after covering the target width, including a final clipped unit when necessary.

One static canvas is generated per configured overlay logical screen and is passed directly as a `TexImageSource` to the existing WebGL renderer. The compositor runs only when the command, mapping revision, source generation, or loaded font changes; it does not redraw on animation frames.

Although this is a React application, the visual should not be a DOM component over the WebGL canvas. A DOM overlay cannot naturally follow source-region splits, destination rotations, clipping, or packed framebuffer mapping. DOM-to-canvas libraries also add a dependency, CORS/font inconsistencies, and per-frame expense. React continues to own subscription effects and diagnostics while the canvas compositor is a small pure rendering module that can also supply a controller preview later.

### 4. Derive and load only approved source candidates

For a validated player identifier, the display derives these same-bucket object paths:

```text
{location}/players/{playerId}-fagn.png
{location}/crest.png
```

It resolves immutable Storage generation metadata, downloads and decodes the celebration image first, then retries with the crest for missing, unreadable, or undecodable player media. The loaded source can use the existing generation-keyed persistent media cache, but generated canvases remain in memory because they are cheap to reproduce and tied to the current mapping revision.

Storage rules add anonymous read access only for the exact crest object and safe `*-fagn.png` player-image shape. Existing authenticated write behavior remains. Other player assets, directories, and operations stay private. This is preferable to persisting tokenized HTTPS URLs in public RTDB state, which would outlive command clearing and bypass path-scoped rule intent.

### 5. Generalize the runtime's prepared overlay source abstraction

`PerimeterRuntime.setOverlay` dispatches on the parsed command kind:

- File command: keep normalization, media loading, timed multi-column playback, and final-column looping.
- Scorer command: load the preferred/fallback image, await fonts, compose every overlay logical screen, and create one static source map held until clear or replacement.

Both branches prepare a disposable generation containing command ID, source map(s), and release callbacks. The runtime increments its existing overlay request generation before each asynchronous preparation. Only the latest request may atomically replace the active generation; stale or failed work releases its resources and leaves the active overlay untouched. Clear invalidates pending work before removing the complete active generation in one render.

The renderer continues receiving only `Record<logicalScreenId, TexImageSource>`. It therefore needs no scorer-specific WebGL shader or mapping logic. Reapplying a changed output configuration reruns scorer composition at the new logical dimensions before swapping textures.

Alternative considered: convert canvases to blobs and pass them back through the file loader. Rejected because serialization, object URLs, and persistent cache writes add work without improving static in-memory texture lifecycle.

### 6. Preserve display-side failure reporting

Source resolution, decode, font loading, composition, and texture failures surface through the existing perimeter display diagnostic channel. Messages remain bounded and avoid bucket URLs or authentication details. A failed scorer replacement does not clear a valid generic/file/scorer overlay already visible on that browser. On cold start with only a failing scorer command there is no previous overlay, so the base remains visible and diagnostics report the failure.

The controller does not optimistically claim that the anonymous display rendered the scorer. It only reflects that web players do not require server-side preparation; actual display failures remain visible through `Skjáarvillur`.

## Risks / Trade-offs

- [Anonymous reads expose celebration images and the crest] -> Restrict rules to the exact crest and safe `*-fagn.png` object shapes, retain authenticated-only writes, and add emulator allow/deny tests.
- [A stale browser bundle cannot parse version-2 commands] -> Deploy renderer/parser support before match use and remotely restart qualified web displays before enabling controller submission; Resolume commands remain version 1.
- [Browser font metrics differ from the existing server renderer] -> Use bundled fonts, await explicit font loads, define deterministic height-relative measurements, and maintain pixel-level compositor tests for representative names and dimensions.
- [Large source images exceed GPU texture limits] -> Decode the source once and draw it into target-height canvases before WebGL upload; only the bounded logical target canvases become textures.
- [Each web display independently chooses portrait versus crest] -> Use immutable generation metadata during one command preparation and retry only in the specified order; displays converge when Storage availability is consistent, while diagnostics expose local failures.
- [Mapping changes while a scorer is visible] -> Treat configuration replacement as a new overlay preparation and retain the current textures until all new-size textures are ready.
- [Two overlay formats increase parser/runtime complexity] -> Keep the union explicitly discriminated and isolate both preparation branches behind one prepared-generation interface.

## Migration Plan

1. Add and test the version-2 types, parser, Firebase validation, narrowly scoped Storage reads, canvas compositor, and runtime branch while the controller still emits only version-1 commands.
2. Deploy the web display support and remotely restart/qualify web perimeter browsers with personalized, crest fallback, missing-source, long-name, clear, power, and mapping-replacement cases.
3. Enable renderer-aware scorer command creation and disable roster-wide preparation/status UI for web venues. Keep Resolume preparation and version-1 commands unchanged.
4. Observe display diagnostics during staging and the first live match; generated web-venue scorer files from prior jobs may age out or be removed separately because no new command references them.

Rollback is to clear any active version-2 overlay, restore controller emission to version 1, and deploy the prior web display bundle. No semantic command migrates persisted roster or media data, and Resolume behavior is unchanged throughout.
