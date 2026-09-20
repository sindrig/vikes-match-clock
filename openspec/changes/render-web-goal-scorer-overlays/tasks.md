## 1. Overlay Protocol And Access Rules

- [x] 1.1 Replace the single file-overlay type with a discriminated version-1 file/version-2 goal-scorer union, add strict semantic-command parsing and serialization, and verify parser tests accept bounded valid scorer data, reject malformed or mixed shapes, and preserve every existing version-1 case.
- [x] 1.2 Add Realtime Database validation for both overlay command versions without weakening authenticated location writes, and verify emulator rule tests allow valid file/scorer commands and reject malformed, oversized, or unauthenticated writes.
- [x] 1.3 Permit anonymous reads only for `{location}/crest.png` and safe `{location}/players/*-fagn.png` objects while retaining authenticated-only writes, and verify Storage emulator tests allow both approved reads while denying unrelated player reads and all anonymous mutations.

## 2. Browser Scorer Composition

- [x] 2.1 Add a scorer-source loader that derives same-location celebration and crest paths, resolves immutable generations, uses the persistent media cache, and falls back only in the specified order; verify unit tests cover personalized success, missing/decode-failed portrait fallback, both-sources failure, and resource release.
- [x] 2.2 Implement the height-scaled 2D canvas repeat-band compositor with deterministic cover cropping, number/name layout, font readiness, name fitting, clipping, and full-width repetition; verify focused tests assert native canvas dimensions, draw order, repeated-unit coverage, and non-overlap for short and long names at representative mappings.
- [x] 2.3 Add test fixtures for the production scorer font and source-image combinations and verify the compositor produces stable personalized and crest-backed output snapshots without adding a DOM-rasterization dependency.

## 3. Web Perimeter Runtime

- [x] 3.1 Generalize prepared overlay generations so file media and composed canvas sources share atomic activation, stale-request invalidation, and release behavior while retaining timed version-1 multi-column playback; verify all existing runtime overlay tests continue to pass.
- [x] 3.2 Add semantic scorer preparation to the runtime using every configured overlay logical screen's native dimensions, and verify fake-loader/runtime tests cover atomic activation, stale replacement, failure retention, cold-start failure, clear, power off/on, base advancement, and mapping-revision recomposition.
- [x] 3.3 Wire the web display to provide location-scoped source metadata, font readiness, and compositor dependencies and to report safe preparation errors through existing display diagnostics; verify component tests cover successful recovery and ensure no renderer-side Firebase mutation is introduced.

## 4. Renderer-Aware Controller Behavior

- [x] 4.1 Make scorer selection inspect the venue's published renderer and emit a fresh version-2 semantic command for valid web players, retain version-1 prepared pairs for ready Resolume players, and leave the generic overlay unchanged for invalid/missing configurations; verify `GoalScorerDialog` tests cover each branch while preserving the main-screen reveal order.
- [x] 4.2 Gate automatic roster preparation, daemon geometry/status subscriptions, and explicit retry controls to Resolume venues so web rosters create no preparation request or generated output dependency; verify context and preparation-panel tests cover renderer changes, reloads, and unchanged Resolume behavior.
- [x] 4.3 Adjust scorer-selection readiness presentation so web players are not marked unavailable due to absent generated-media status while Resolume readiness labels remain unchanged; verify component tests cover both renderer modes and invalid player display data.
- [x] 4.4 Add an end-to-end web venue scenario with controlled portrait/crest fixtures that selects a scorer, observes a semantic command, renders the complete overlay, exercises fallback and clear, and confirms the base playlist continues advancing; verify the targeted Playwright test passes in the emulator environment.

## 5. Documentation And Release Verification

- [x] 5.1 Update `clock/AGENTS.md` and perimeter rollout documentation with the two overlay command forms, browser compositor lifecycle, scoped public source paths, Resolume compatibility boundary, deployment order, and rollback procedure; verify documented paths and schema examples match the implementation.
- [x] 5.2 Run Prettier, TypeScript/ESLint, clock unit/component tests, Firebase rule tests, and the targeted perimeter end-to-end suite; verify all commands pass without lint suppressions and record any environment-only qualification gap.
- [ ] 5.3 Qualify the deployed staging web display after a remote restart using personalized, crest fallback, unavailable-source, long-name, clear, power-cycle, and mapping-replacement cases; verify diagnostics remain healthy for successful cases and preserve/report failures as specified.
- [x] 5.4 Run `openspec validate render-web-goal-scorer-overlays --strict` and verify the completed implementation remains consistent with both delta specifications before rollout.
