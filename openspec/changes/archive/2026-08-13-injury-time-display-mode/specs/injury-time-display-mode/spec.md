# Spec: Injury Time Display Mode

## Requirements

### R1: Typed Display Mode
`Match.injuryTimeDisplayMode` is one of `"stop" | "full" | "minutes"`.
The legacy boolean `showInjuryTime` is removed from the application state and
never written.

### R2: Mode Semantics at the Half-Stop
- `stop`: pause the match, force displayed seconds to `00`, and fire the
  buzzer once when the elapsed minutes reach the current half-stop.
- `full`: keep counting elapsed minutes and seconds past the half-stop.
- `minutes`: keep counting elapsed time past the half-stop, but render the
  full elapsed minutes with `:00` seconds.

### R3: Applies at Every Half-Stop
The mode applies after every football half-stop (`halfStops[0]`, which shifts
as periods complete). There is no per-period special-casing.

### R4: Legacy Migration
When a snapshot has no valid `injuryTimeDisplayMode`, the parser derives the
mode from `showInjuryTime`: `false → "stop"`, `true → "full"`. If neither is
valid, the default is `"full"`.

### R5: Migration Is Derivation-Only
Read-only displays derive the mode without writing. Authenticated controllers
persist only `injuryTimeDisplayMode`; the legacy field is not retained.

### R6: Controller Selector
`HalfStops.tsx` exposes a three-option selector for the mode. The
`setHalfStops` action accepts the mode and persists it.

### R7: MatchActions Gating
The "Næsti hálfleikur" button is shown whenever the mode is not `stop`.

### R8: Countdown Preservation
Countdown behavior is unchanged for all modes.

## Verification Claims

| Claim | Evidence |
|---|---|
| Parser derives `stop`/`full` from legacy booleans | `firebaseParsers.spec.ts` migration tests |
| Invalid mode falls back to default `full` | Parser default-coverage test |
| `setHalfStops` persists the mode and drops the legacy field | Context write test |
| Clock renders `00` seconds in `minutes` mode after the half-stop | Clock display test |
| Clock stops and buzzes in `stop` mode | Clock display test |
| Clock counts `mm:ss` past the half-stop in `full` mode | Clock display test |
| Controller shows a three-option selector | `MatchActionSettings.spec.tsx` |
| Emulator fixture uses the new field | `e2e/fixtures/test-helpers.ts` |
