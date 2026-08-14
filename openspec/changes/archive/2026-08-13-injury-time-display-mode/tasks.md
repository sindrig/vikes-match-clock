# Tasks: Injury Time Display Mode

## 1. Types

- [ ] Add `InjuryTimeDisplayMode` type in `clock/src/types.ts`
- [ ] Replace `showInjuryTime?: boolean` with
  `injuryTimeDisplayMode: InjuryTimeDisplayMode` on `Match`

## 2. Data Layer

- [ ] Update `defaultMatch` in `FirebaseStateContext.tsx`
- [ ] Parse `injuryTimeDisplayMode` in `firebaseParsers.ts` with legacy
  `showInjuryTime` migration
- [ ] Update `setHalfStops` to accept the mode and write only the new field
- [ ] Update `MatchStateContext` interface signature

## 3. Clock Behavior

- [ ] Update `Clock.tsx` to branch on `stop` / `full` / `minutes`
- [ ] Preserve countdown and half-stop buzz/pause behavior

## 4. Controller UI

- [ ] Replace the checkbox in `HalfStops.tsx` with a three-option selector
- [ ] Update `MatchActions.tsx` "Næsti hálfleikur" gating to `mode !== "stop"`

## 5. Tests & Fixtures

- [ ] `firebaseParsers.spec.ts` — mode parsing and legacy migration
- [ ] `FirebaseStateContext.spec.tsx` — `setHalfStops` writes mode
- [ ] `Clock.spec.tsx` (or equivalent) — stop/full/minutes display coverage
- [ ] `MatchActionSettings.spec.tsx` — controller selector coverage
- [ ] `e2e/fixtures/test-helpers.ts` — emulator fixture schema

## 6. Documentation

- [ ] Update `clock/AGENTS.md` — new field, migration, display modes

## 7. Verification

- [ ] Focused Vitest suites
- [ ] `pnpm lint`
- [ ] `pnpm format-check`
- [ ] `pnpm build`
