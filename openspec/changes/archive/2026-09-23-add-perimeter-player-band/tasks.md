# Tasks: Perimeter Player Band

## 1. Rules and types

- [x] 1.1 Extend `storage.rules`: allow anonymous reads of
      `^[A-Za-z0-9_-]{1,64}(-fagn)?[.]png$` under `{location}/players/` and add
      public-read-only `{location}/club-logos/{allPaths=**}` block; writes stay
      authenticated-only. Verify with the existing rules validation workflow
      (deploy to emulator or run `firebase deploy --only storage --dry-run`
      equivalent) and by confirming unrelated object names are still denied.
- [x] 1.2 Add `playerDisplayStyle` validate rule under
      `states/$location/perimeter` in `firebase-rules.json` mirroring the
      `scorerCelebration` enum shape. Verify JSON validity and that the rule
      accepts null and each style value, rejects anything else.
- [x] 1.3 Add `PlayerBandStyle` ("plain" | "glow" | "streamer"),
      `DEFAULT_PLAYER_BAND_STYLE`, and `playerDisplayStyle?: PlayerBandStyle`
      on `PerimeterState` in `clock/src/types.ts`. Verify typecheck passes.
- [x] 1.4 Add strict parsing of `playerDisplayStyle` in
      `firebaseParsers.ts` (mirror `scorerCelebration`; absent/invalid →
      `undefined`) and extend `parsePerimeterState` tests covering absent,
      valid, and invalid values. Verify `pnpm test` for parser specs passes.
- [x] 1.5 Add `SubstitutionBandStyle` ("static" | "relay" | "flash"),
      `DEFAULT_SUBSTITUTION_BAND_STYLE`, and
      `substitutionStyle?: SubstitutionBandStyle` on `PerimeterState` in
      `clock/src/types.ts`. Verify typecheck passes.
- [x] 1.6 Add strict parsing of `substitutionStyle` in `firebaseParsers.ts`
      (mirror `playerDisplayStyle`; absent/invalid → `undefined`) and extend
      `parsePerimeterState` tests for absent, valid, and invalid values.
      Verify parser specs pass.
- [x] 1.7 Add the `substitutionStyle` validate rule under
      `states/$location/perimeter` in `firebase-rules.json` mirroring the
      `playerDisplayStyle` enum shape. Verify JSON validity and enum
      acceptance/rejection.

## 2. Band presentation

- [x] 2.1 Create `clock/src/perimeter/playerBandPresentation.ts` with the three
      style variants (flat near-black field, alpha fade-in entrance, shared
      unit layout via `drawBandUnit`, drift at ~1.5× procession for
      `plain`/`glow` and ~2× for `streamer`, glow pulse and speed lines per
      style). Reuse `ScorerPresentation` types and timeline anchoring;
      verify `pnpm test` passes new presentation unit specs.
- [x] 2.2 Add snapshot specs for the band presentation at native logical-screen
      sizes (compare against the scorer snapshot harness in
      `scorerCompositorSnapshots.spec.ts` style). Verify snapshots generate and
      pass.
- [x] 2.3 Create the substitution presentation code (sibling of the player
      band presentation): two-player unit `[red ▼ | off portrait | number |
      name] [swap arrow] [green ▲ | on portrait | number | name]` matching
      the scoreboard's off-left / on-right layout, repeated across the
      screen width; vector-triangle arrows (red reusing
      `SCORER_PRESENTATION_COLORS.accent`, green mirroring the main-screen
      green); entrance per style (`static`: fade then hold, `relay`: fade
      then drift right-to-left at the player-band default speed, `flash`:
      impact flash + scale-down pop with the swap arrow stamping last, then
      hold). Verify `pnpm test` passes new presentation unit specs.
- [x] 2.4 Add substitution presentation snapshot specs at native logical-screen
      sizes covering all three styles and the settled unit layout. Verify
      snapshots generate and pass.

## 3. Source loading

- [x] 3.1 Add the band source loader (extend `ScorerSourceLoader` or new
      `PlayerBandSourceLoader`): first hop = provided download URL via the
      persistent media cache (URL-keyed), fallback = team logo resolved by
      `asset.teamName` (club override `logoUrl` first, then bundled
      `clubLogos` map), final fallback = existing venue-crest chain. Include a
      per-team bundled-crest resolver replacing the home-team-only closure.
      Verify unit specs cover photo success, photo failure → team logo,
      override-team logo, away-team bundled crest, and full-failure → venue
      crest. The loader API must support the substitution use case: two
      independent per-side resolutions for one band request.
- [x] 3.2 Wire the loader into `PerimeterDisplay`'s runtime dependencies
      (mirroring the `scorer` dependency wiring), passing the per-team crest
      resolver and club-override lookup. Verify `PerimeterDisplay.spec.tsx`
      mocks extend cleanly and typecheck passes.

## 4. Runtime channel

- [x] 4.1 Extend `PerimeterRuntime` with the band channel:
      `setPlayerBand(band | null, now)` taking the discriminated request
      (`kind: "player"` single identity / `kind: "substitution"` with `off`
      and `on` identities) with scorer-style generation lifecycle (atomic
      activation, stale-request invalidation, release of superseded
      resources, failure reporting through the existing error path),
      suppression while an overlay generation is active, and `clearChannel`
      "band" support. Verify new runtime specs cover activate, replace
      (drop-then-restore), player↔substitution transitions, overlay
      precedence, and clear.
- [x] 4.2 Extend `PerimeterRenderSources` and the WebGL renderer to composite
      base < band < overlay with an independent band dynamic flag; add the
      "band" case to texture-channel clearing. Verify
      `webglRenderer.spec.ts` additions pass and no base/overlay behavior
      changes (existing specs green).

## 5. Display derivation and context

- [x] 5.1 Add the identity-derivation helper (from `controller.currentAsset`):
      accepted types `PLAYER`/`NO_IMAGE_PLAYER`/`MOTM`, skip
      `isGoalCelebration` assets, validate name/number bounds, digit
      normalization; `SUB` assets derive the discriminated substitution
      request from `subOut` (off) and `subIn` (on) with the both-players-valid
      rule; invalid identities and all other types yield no band. Unit specs
      for each accepted and rejected type. Verify helper specs pass.
- [x] 5.2 In `PerimeterDisplay.tsx`, derive the band request from the already
      subscribed controller state, forward both style fields (defaulted)
      before the band effects, and call `setPlayerBand` on identity/style/
      configuration changes with read-only behavior preserved. Verify
      `PerimeterDisplay.spec.tsx` covers lineup card → band shown, ad asset →
      band dropped, valid SUB → substitution band, invalid SUB → no band,
      reconnect mid-item, and that no Firebase writes occur.
- [x] 5.3 Expose `setPerimeterPlayerDisplayStyle` and
      `setPerimeterSubstitutionStyle` from `FirebaseStateContext.tsx` (audited
      `perimeter.set-player-display-style` / `perimeter.set-substitution-style`,
      each writing only its own field, gate writes on authentication) and
      surface both styles through `usePerimeter()`. Verify context spec covers
      the writes, the audit records, and the unauthenticated read-only path.

## 6. Admin UI

- [x] 6.1 Add the band style picker section (Default / Glow / Streamer) to
      the standalone perimeter manager for web venues, adjacent to the scorer
      celebration control, with pending-write disable pattern matching that
      control. Verify component specs cover selection, audited write call,
      disabled state while pending, and absence on non-web venues.
- [x] 6.2 Add the substitution style picker section (Static / Relay / Flash)
      to the standalone perimeter manager for web venues, adjacent to the
      band style picker, with the same pending-write disable pattern. Verify
      component specs cover selection, audited write call, disabled state
      while pending, and absence on non-web venues.

## 7. Naming fix (prerequisite for 5.1)

- [x] 7.1 Fix the inverted `subIn`/`subOut` semantics in
      `useHomeTeamQuickActions.ts`: build `subIn` from the incoming player
      and `subOut` from the outgoing player. Verify the created asset's
      `fullName` pairings follow the corrected fields and unit specs pass.
- [x] 7.2 Re-pair the consumers without changing the main-screen visuals:
      `Asset.tsx` `renderSub()` emits `[subOut, subIn]` (outgoing player
      stays left), `SubstitutionInfo.tsx` labels read "Af velli: subOut"
      (off the pitch) / "Inn á: subIn" (on the pitch), and `Substitution.css`
      nth-of-type rules keep red on the left cluster and green on the right.
      Verify
      `SubstitutionInfo.spec.tsx`, `Asset.spec.tsx`, and `SubstitutionInfo`
      rendering specs pass unchanged in their visual assertions.
- [x] 7.3 Update e2e/unit fixtures that seed SUB assets to the corrected
      shape, and note in the design-follow-up docs that SUB assets already
      persisted in queues are discarded, not migrated. Verify affected specs
      pass.

## 8. Verification

- [x] 8.1 Extend the emulator e2e perimeter coverage: play a lineup queue and
      assert the perimeter canvas derives the band, a goal overlay covers it,
      clearing restores it, and stopping the queue restores the base deck.
      Verify `pnpm e2e` for the new scenario passes.
- [x] 8.2 Add the emulator e2e substitution scenario: step the substitutions
      queue ("Skiptingar") to a valid substitution and assert the substitution
      band derives,
      a goal overlay covers it and returns on clear, an invalid-identity sub
      shows no band, and advancing past the sub restores the base deck.
      Verify `pnpm e2e` for the new scenario passes.
- [x] 8.3 Run `pnpm lint`, `pnpm test`, `pnpm exec prettier --write` on touched
      files, and typecheck; fix all findings without eslint-disable comments.
- [x] 8.4 Update `clock/AGENTS.md` (web perimeter section: band channel +
      substitution band, both style configs, storage/public-read additions,
      corrected subIn/subOut semantics in the multi-controller/quick-actions
      docs) and verify the docs diff reads coherently.
