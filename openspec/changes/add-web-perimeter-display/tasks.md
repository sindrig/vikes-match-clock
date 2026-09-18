## 1. Venue Configuration Model

- [x] 1.1 Add strict TypeScript types and Firebase parsers for versioned `perimeterDisplay` renderer mode, framebuffer, logical screens, compatibility keys, regions, transforms, and playback defaults; verify parser tests accept the captured Víkin configuration and reject malformed documents.
- [x] 1.2 Implement reusable mapping validation for integer geometry, source bounds and exact coverage, destination bounds, scaling, clipping, rotation, flips, and overlap ordering; verify focused unit tests cover valid identity/split mappings and every rejection category.
- [x] 1.3 Extend location/listener parsing to expose perimeter display configuration without changing existing scoreboard screen behavior; verify location parser and selector fixture tests cover venues with no config, `resolume`, and `web` modes.
- [x] 1.4 Update admin location parsing and saves to round-trip `perimeterDisplay` during unrelated edits; verify a regression test changes a scoreboard screen and preserves the complete perimeter document.

## 2. Perimeter Mapping Editor

- [x] 2.1 Add admin mapping-editor draft state and numeric controls for framebuffer, logical screens, regions, source/destination rectangles, rotation, flips, scaling, clipping, overlap, and z-order; verify component tests show edits remain local before Publish.
- [x] 2.2 Add linked source-strip and packed-output visualizations with selection, drag, and resize behavior; verify component tests keep visual and numeric edits synchronized.
- [x] 2.3 Add identity-mapping and horizontal-split templates plus calibration-pattern preview; verify unit/component tests assert the generated region coordinates and identifiable calibration labels.
- [x] 2.4 Add validation feedback and explicit whole-document Publish with a fresh revision ID; verify invalid drafts cannot write and a valid draft performs one complete Firebase write.
- [x] 2.5 Add the captured Víkin configuration as a validated `resolume` mapping fixture and document the process for measuring/publishing the second stadium's `web` mapping; verify both fixtures pass the shared validator.

## 3. Display Selection and Lifecycle

- [x] 3.1 Replace the separate persisted screen key with a typed local display target that supports scoreboard and perimeter modes, including migration of existing scoreboard localStorage; verify local-state tests cover migration, persistence, reload, and disconnect.
- [x] 3.2 Update the public selector to group scoreboard screens by venue and show one Perimeter action only for a valid `web` configuration; verify component tests cover web, Resolume, missing, and malformed configurations.
- [x] 3.3 Route anonymous perimeter targets to a dedicated display shell while retaining Firebase readiness, presence, disconnect, and `RefreshHandler`; verify App tests prove scoreboard rendering is unchanged and a refresh-token change reloads a persisted perimeter target.
- [x] 3.4 Distinguish perimeter and scoreboard installations in presence records without breaking aggregate connected-screen behavior; verify presence hook tests cover both display kinds and existing records.

## 4. Immutable Media and Persistent Cache

- [x] 4.1 Extend perimeter base-layout media records and upload/selection flows with Firebase Storage generation identity while retaining legacy numeric lane keys; verify parser and controller tests reject missing immutable identity for web playback but preserve Resolume compatibility.
- [x] 4.2 Add a metadata backfill/import operation for existing selected perimeter objects before a venue can be enabled for web rendering; verify it resolves generations, preserves layout order and IDs, and refuses activation when metadata is unavailable.
- [x] 4.3 Implement approved `gs://` reference resolution and a persistent Cache Storage layer keyed by bucket, object path, and generation; verify unit tests cover cache hit, cache miss, generation replacement, corruption removal, and failed download behavior.
- [x] 4.4 Add storage persistence and quota checks without a hard playlist-size limit, retaining the last complete revision when capacity is insufficient; verify mocked storage tests cover granted, denied, and insufficient-quota outcomes.
- [x] 4.5 Implement complete base-revision download and media metadata validation for image, video, and mixed pairs; verify tests prove playback readiness is withheld for partial downloads, decode failures, wrong dimensions, or incomplete pairs.

## 5. Exact Output Renderer

- [x] 5.1 Build the single-surface WebGL renderer with exact backing framebuffer dimensions, black clearing, logical textures, source UVs, destination vertices, transforms, clipping, and z-order; verify pixel tests cover identity mapping, Víkin's three captured regions, black remainder, and the permitted negative two-pixel edge.
- [x] 5.2 Add image bitmap and video-frame texture sources with cleanup on revision replacement; verify renderer tests cover image/image, video/video, and mixed pairs without leaking obsolete resources.
- [x] 5.3 Add runtime mapping revision validation and atomic surface replacement while retaining the last valid mapping on failure; verify tests show malformed updates never replace valid output.

## 6. Base Playlist Playback

- [x] 6.1 Implement the monotonic 20-second base timeline with ordered looping and elapsed-time cue derivation; verify fake-clock tests cover normal boundaries, final-to-first looping, delayed callbacks, and empty playlists.
- [x] 6.2 Implement two decoded pair slots so the next complete pair is frame-ready before one-frame atomic visibility changes; verify playback tests assert no blank or half-pair frame appears at boundaries.
- [x] 6.3 Implement shared paired-video start/seek behavior and supported native playback-rate fitting, with natural-rate loop/cut fallback; verify media tests cover short, exact, long, unsupported-rate, and mixed-media cues.
- [x] 6.4 Stage new base revisions in isolation and activate a complete revision from cue zero at a cue boundary; verify tests show the prior revision continues through download/validation failure and successful replacement is atomic.

## 7. Overlay and Power Channels

- [x] 7.1 Normalize existing numeric overlay keys to logical screens and implement an independent WebGL overlay channel above base content; verify tests prove base timing continues while the overlay is visible.
- [x] 7.2 Implement complete-pair overlay preparation, double-buffered replacement, atomic clear, declared intermediate-column durations, and final-column looping; verify fake-clock tests cover set, replace, clear, multi-column progression, and failed replacement.
- [x] 7.3 Implement perimeter power behavior that preloads while off, renders black while off, and starts base cue zero on each off-to-on transition; verify state-transition tests cover startup-off, startup-on, repeated toggles, and overlay state while powered off.

## 8. Security, Compatibility, and Operational Verification

- [ ] 8.1 Restrict public Firebase Storage reads to approved perimeter base and overlay directories while retaining authenticated writes; verify emulator rules tests allow anonymous approved reads and deny anonymous writes and unrelated reads.
- [x] 8.2 Adapt the perimeter ad-layout controller to derive lanes from published logical screens for web venues while preserving daemon-applied layout behavior for Resolume venues; verify controller tests cover both modes without fabricating applied status.
- [ ] 8.3 Add end-to-end coverage for public web-perimeter selection, complete startup preload, 20-second cycling, power toggles, overlay layering, playlist replacement, disconnect, and remote restart recovery; verify the Playwright suite passes with controlled Firebase and media fixtures.
- [ ] 8.4 Test the production Windows/Chromium target with calibration patterns, all intended codecs, a near-2-GB cache, offline restart, repeated remote restarts, and long-running paired-video playback; record framebuffer accuracy, texture limit, storage persistence, drift, and decoder results in deployment documentation.
- [x] 8.5 Update `clock/AGENTS.md` and operator documentation with the display-target model, Firebase ownership, cache guarantees, accepted media constraints, mapping publication, web/Resolume coexistence, and rollback procedure; verify documented paths and commands match the implemented system.
- [ ] 8.6 Run `pnpm format`, `pnpm lint`, `pnpm test`, the relevant Firebase emulator rules tests, `pnpm build`, and perimeter Playwright tests from `clock/`; verify all checks pass before enabling the second stadium's `web` configuration.
