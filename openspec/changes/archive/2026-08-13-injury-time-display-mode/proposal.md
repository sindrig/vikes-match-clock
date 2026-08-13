# Injury Time Display Mode

**Change ID:** `injury-time-display-mode`

## Proposal

Replace the boolean `showInjuryTime` match field with a typed
`injuryTimeDisplayMode` field so the clock can express three distinct
behaviors after a half-stop:

- `stop` — stop and buzz at the current half-stop (legacy `false`).
- `full` — continue showing elapsed minutes and seconds (legacy `true`).
- `minutes` — continue after the half-stop but render full elapsed minutes
  with `:00` seconds (e.g. `91:00`, `92:00`).

The mode applies after **every** half-stop, matching the existing
`showInjuryTime` behavior for both the 45:00 and 90:00 periods.

Legacy data migrates on first sync: a `showInjuryTime` value of `false`
becomes `stop`, `true` becomes `full`. Only the new field is persisted for
authenticated controllers; read-only displays derive the mode without
writing.
