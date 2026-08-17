# Perimeter brightness — gateway smoke-test checklist

Pre-deploy and post-deploy verification for the Vnnox brightness feature.
Follow this on the gateway (the host running `perimeter-control`) and in the
controller UI. **Never skip the rollback step** — the whole point of the
feature is that a brightness change is scoped, verified, and reversible.

Prereq: the daemon is built and deployed with this change, Vnnox handling is
**enabled** (`PERIMETER_BRIGHTNESS_ENABLED=true`), and the required Vnnox
configuration is present (see `perimeter-control.env.example`). Only the
perimeter screen GUID must ever be written.

## 1. Pre-checks on the gateway

- [ ] `journalctl -u perimeter-control -f` shows the daemon running with
      `Brightness control listening on: states/vikuti/perimeter/brightness`
      and **no** "Brightness not configured" failure status.
- [ ] Confirm the configured GUID matches the live perimeter screen
      (`PERIMETER_VNNOX_PERIMETER_GUID`). Source of truth: the device's
      `normal-screen` response lists the perimeter screen with GUID
      `75f3072e-4940-4682-a91c-44edf697b1ca` and the MVR screen separately.
      A mismatch would fail closed with "GUID not found" — never a fallback.
- [ ] Confirm the password source resolves (env var or file) and that a login
      succeeds: `PERIMETER_VNNOX_PASSWORD_SOURCE=env` requires
      `PERIMETER_VNNOX_PASSWORD`; `=file` requires the file on the gateway.

## 2. Snapshot the current brightness (before touching anything)

- [ ] From the gateway, read the live screen brightness through the UCenter
      API (or via the daemon log line `Brightness snapshot: X% (ratio/scale)`)
      and record the current percentage (expected ~4.5% at
      `ratio 450 / ratioScale 10000`).
- [ ] Note the value in the controller UI's `Jaðarskjár` modal: the
      `Bjartleiki jaðarskjás` section should show the Firebase-synchronized
      requested value if one exists, otherwise none.

## 3. Perform one low-risk change

- [ ] In the controller (`Jaðarskjár` → `Bjartleiki jaðarskjás`), enter a
      **low-risk** whole percentage (e.g. one step away from the current
      value, staying well within a visible-but-safe range) and click `Vista`.
- [ ] Confirm the `Vista` button disables immediately (no duplicate
      submission while the write is pending) and re-enables once the
      subscription reflects the submitted value.
- [ ] In the daemon logs confirm the sequence:
      1. `New brightness command: <pct>%`
      2. `Brightness: writing <pct>% to perimeter screen`
      3. `Brightness <pct>% applied and verified`
- [ ] Confirm the daemon status in Firebase
      (`perimeter/vikuti/brightnessStatus`) transitions `pending` →
      `applied` with `requestedPercent == appliedPercent` and a server
      `updatedAt`.

## 4. Verify published status and Vnnox readback

- [ ] In the controller UI the brightness section shows the daemon phase
      `Beitt` and `Staðfest: <pct>%`.
- [ ] Independently confirm the hardware: read the perimeter screen brightness
      via the UCenter `normal-screen` API (same call the daemon makes) and
      confirm `ratio * 100 / ratioScale` matches the requested percentage
      within the configured tolerance.
- [ ] Confirm the **MVR screen is untouched** (its readback is unchanged,
      `ratio 0 / ratioScale 0`).

## 5. Confirm rollback (reapply the snapshot)

- [ ] Re-issue the **snapshot percentage from step 2** through the controller
      and confirm it verifies `applied` with the original value.
- [ ] Confirm the Vnnox readback returns the original snapshot percentage.
- [ ] Confirm the controller UI shows `Beitt` / `Staðfest: <original>%`.

## 6. Failure-path checks (optional but recommended)

- [ ] With the daemon disabled or the Vnnox endpoint unreachable, submit a
      brightness value and confirm the status goes `failed` with a safe error
      and **no** hardware write is attempted.
- [ ] Submit an out-of-range value (e.g. `150`) and confirm the controller
      rejects it client-side without writing, and the daemon ignores any
      malformed value that reaches it.

## Rollback (if anything looks wrong)

1. Disable the feature flag: set `PERIMETER_BRIGHTNESS_ENABLED=false` and
   restart the daemon (brightness handling becomes inert).
2. Re-issue the snapshot percentage through the controller or the Vnnox UI.
3. Hide the controller brightness section by disabling the perimeter feature
   flag in Firebase if needed.
