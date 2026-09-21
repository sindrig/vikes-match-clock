## Why

The existing goal-scorer perimeter flow pre-renders and uploads target-specific PNG files because Resolume can only play media files. Web perimeter displays already own the output geometry and texture compositor, so requiring a Cloud Function preparation job adds avoidable latency, storage, status state, and match-day failure modes.

## What Changes

- Add a semantic goal-scorer overlay command containing the selected player's display data instead of generated target media; the web display resolves the approved celebration-image and crest paths from that data.
- Compose the repeating player image, shirt number, and name band in the web perimeter browser at each logical screen's native dimensions, then present the complete pair atomically through the existing overlay channel.
- Keep the generic goal overlay visible until the semantic scorer overlay has loaded its source image, fonts, and complete target textures; retain the previous overlay when replacement preparation fails.
- Select the overlay path by the venue's published renderer: web venues use browser composition, while Resolume venues retain the existing prepared-PNG workflow and daemon command format.
- Stop requesting roster-wide scorer-media preparation for web venues and remove web-venue dependence on daemon-published overlay geometry or generated perimeter-overlay objects.
- Preserve the existing clear action, base-playlist advancement, power behavior, and main-screen scorer reveal.

## Capabilities

### New Capabilities

- `web-goal-scorer-overlay`: Semantic scorer commands, browser-side repeat-band composition, atomic activation, fallback behavior, and read-only web display operation.

### Modified Capabilities

- `goal-scorer-perimeter-media`: Scope roster-wide file preparation and prepared-file selection to Resolume venues while routing web venues through semantic browser-rendered overlays.

## Impact

- Affects perimeter overlay types and parsers, Firebase rules, `FirebaseStateContext`, scorer selection, web perimeter runtime/media preparation, WebGL texture lifecycle, controller readiness UI, and related tests in `clock/`.
- The browser will read the existing player celebration image and crest objects through narrowly scoped anonymous Storage rules; no new generated-media prefix, upload flow, Cloud Function, daemon endpoint, or infrastructure service is required.
- The existing `functions/src/goalScorerPreparation.ts` function and `perimeter-control/` daemon behavior remain available for Resolume venues during migration.
- Depends on the web perimeter display and published output mapping introduced by `add-web-perimeter-display`.
