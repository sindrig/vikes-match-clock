# Perimeter brightness — snapshot, smoke test and exact restoration

**Physical gateway qualification: HOLD.** The reference commands below are
verified with local mock I/O only. They are not a production-qualified tool or
evidence of a live Firebase, Vnnox, systemd or screen test. Run on a gateway
only under separate host/service and hardware authorization. All venues use
browser media playback; keep the Vnnox/UCenter brightness route available.
Resolume is unsupported and is not a rollback target.

## Ownership and restoration contract

| Data                                                                | Owner and meaning                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `states/{location}/perimeter/brightness`                            | Controller/operator intent: integer 0–100; null/missing means no command. Invalid values are ignored by the worker.                              |
| `states/{location}/perimeter/brightnessAuto`                        | Controller parameters/mode. The worker also sets `enabled: false` on a new manual command while auto is on.                                      |
| `perimeter/{location}/brightnessStatus` and `brightnessCalibration` | Daemon-owned outcomes/predictions/calibration; clients can read with venue permission and cannot write. Never restore these as desired state.    |
| Vnnox screen brightness                                             | Hardware readback, independently snapshotted and verified. A Firebase acknowledgement or old `applied` status does not prove the hardware value. |

Automatic targets enter the serialized worker directly; they do **not** write
the manual Firebase command path. Manual intent invalidates undispatched auto
work synchronously. A dispatched write must finish verification or best-effort
restoration before shutdown or another request proceeds. See
[arbitration/startup semantics](../docs/brightness-arbitration.md).

A command of `6` means 6% and writes
`{ratio: 600, ratioScale: 10000, nit: 0, nitType: 0}`. A snapshot might instead
be 4.5% (`450/10000`), 12.34% (`1234/10000`), or have nonzero `nit`/`nitType`.
Never round it to an integer or convert it to `ratioScale: 1`. Even a snapshot
whose percentage is an integer can have a different scale or nit fields.
**Use the exact Vnnox restoration below for both integer and fractional
snapshots.** The controller is not an exact snapshot restoration interface.

The procedure is: stop/drain → snapshot → prepare manual intent → start/test
→ stop/drain → restore Firebase intent → restore/read back exact hardware.
It leaves the worker stopped. Restoring intent and restoring hardware are
separate steps so device restoration remains executable if Firebase is down
or access expires. Neither restoration relies on a disabled worker.

## 1. Select the environment and coordinate ownership

Use Bash from `perimeter-control/` in this checkout with Node >= 22. No package
installation is needed for the reference helper; it imports only the
[device client module](vnnox.js), never the daemon, Admin SDK or a service-account file.
Read [the portable environment contract](../docs/environment.md#gateway-access)
for access retrieval. Do not source a systemd environment file as Bash.

Coordinate exclusive ownership of this venue with other controllers and
workers. Check the service's configured database URL and power-state path,
the brightness, auto, status and calibration paths, device routing headers,
serial, project and GUID against this selection. This helper uses the standard
paths in the
table; **stop if the gateway uses different path overrides**. There is no
production/staging default or automatic discovery. Verify the exact service
Node executable is >= 22 as described in the [gateway README](README.md).

Populate placeholders and inject credentials using the approved operator
loader for the **selected Firebase project and Vnnox device**. Keep shell
tracing off. Do not paste tokens/passwords into commands, logs, tickets or
captured HTTP responses. A Firebase **ID token** (not a service account or an
AWS token), its actual UID, and `auth/{uid}/{location} == true` are required.
Admin membership alone does not grant venue state writes. Refresh an expired
ID token through the approved login flow; do not weaken rules or retry writes
blindly after an ambiguous response.

```bash
set +x
export FIREBASE_DATABASE_URL="https://REPLACE_WITH_DATABASE_HOST"
export FIREBASE_LOCATION="REPLACE_WITH_VENUE_KEY"
export FIREBASE_UID="REPLACE_WITH_AUTHENTICATED_UID"
export BRIGHTNESS_SESSION_DIR="/REPLACE_WITH_PRIVATE_SESSION_DIRECTORY"
export SMOKE_PERCENT="REPLACE_WITH_APPROVED_INTEGER_0_TO_100"
export PERIMETER_VNNOX_BASE_URL="http://REPLACE_WITH_UCENTER_HOST_AND_PORT"
export PERIMETER_VNNOX_IP="REPLACE_WITH_DEVICE_IP"
export PERIMETER_VNNOX_PORT="REPLACE_WITH_DEVICE_PORT"
export PERIMETER_VNNOX_PROTOCOL="http"
export PERIMETER_VNNOX_SN="REPLACE_WITH_DEVICE_SERIAL"
export PERIMETER_VNNOX_PROJECT_ID="REPLACE_WITH_PROJECT_ID"
export PERIMETER_VNNOX_PERIMETER_GUID="REPLACE_WITH_PERIMETER_SCREEN_GUID"
export PERIMETER_VNNOX_USERNAME="REPLACE_WITH_RETRIEVED_DEVICE_USERNAME"
# These two exported secrets must already be supplied by the approved loader.
: "${FIREBASE_ID_TOKEN:?Load an operator ID token for the selected Firebase project securely.}"
: "${PERIMETER_VNNOX_PASSWORD:?Load the selected device password securely.}"
export FIREBASE_ID_TOKEN PERIMETER_VNNOX_PASSWORD
```

Use a fresh private session directory outside tracked files. `snapshot.json`
contains scope, original desired values (including absent/null), observational
status, exact hardware values and all non-target screen readbacks. Credentials
are not saved. Keep it until restoration is independently verified; do not
commit it. The helper refuses to overwrite a snapshot or reuse one under a
different database, venue, device route, serial, project or screen GUID.

Initialize this shell's stop helper. The variable is an operator declaration,
not a lock or proof of shutdown. Check that **all** processes targeting this
GUID have stopped and that no write is still finishing on the device.

<!-- brightness-session: shell -->

```bash
set -euo pipefail
set +x
umask 077
stop_brightness_worker() {
  sudo systemctl stop perimeter-control
  if sudo systemctl is-active --quiet perimeter-control; then
    echo "Worker is still active; stop before continuing." >&2
    return 1
  fi
  test "$(sudo systemctl show perimeter-control --property=MainPID --value)" = "0"
  export BRIGHTNESS_WORKER_STOPPED=true
}
```

## 2. Stop, drain and snapshot before changing state

<!-- brightness-session: stop-before-snapshot -->

```bash
stop_brightness_worker
```

Inspect the shutdown logs and device stability before proceeding. The daemon
has a bounded 30 s shutdown grace; an inactive unit/zero PID alone does not
prove the final device operation finished. If shutdown timed out, was forced,
or its result is uncertain, resolve that uncertainty and read stable hardware
before establishing the baseline. Do not claim an earlier snapshot restored.

<!-- brightness-session: snapshot -->

```bash
node tools/brightness-session.mjs snapshot
```

Confirm the target GUID appears as the perimeter screen in `normal-screen`,
with its raw `ratio`, positive `ratioScale`, `nit` and `nitType`. The helper
uses the client's zero defaults only when nit fields are absent in readback;
supplied numeric nit values are preserved and nonnumeric nit fields stop the
procedure before changes. Other screens may have `0/0` (e.g. MVR):
record those raw values without normalizing or targeting them. Every write
must have exactly `guidList: [configuredPerimeterGuid]`, `list: []`. Missing
GUID is an error, never a fallback to another screen or a device-wide write.

## 3. Prepare, run one integer command and verify

With the worker **still stopped**, clear the retained manual command and
disable auto, preserving all saved curve parameters. If the auto node was
absent it stays absent; creating only `{enabled:false}` would fail validation.

<!-- brightness-session: prepare -->

```bash
node tools/brightness-session.mjs prepare
```

The helper makes authenticated Firebase REST requests using the ID token in
the in-memory `auth` query parameter; it never prints the URL. Each mutation
is a **root `PATCH /.json?auth=<ID token>`**, containing leaf paths for just
these intent fields and one new `audit/{location}/{UUID}` record atomically.
The record contains the actual `uid`, a session UUID, action, `stateArea:
"perimeter"`, a Firebase server timestamp, and `changes: JSON.stringify(diff)`
including null deletions. This follows
[`writeAuditedState()`](../clock/src/firebaseDatabase.ts); it preserves sibling
state and append-only audit history. Server timestamp writes use
`{".sv":"timestamp"}`. Auto config writes must satisfy every required field,
range and unknown-field rule in [`firebase-rules.json`](../firebase-rules.json).

Current rules allow public desired-state reads, require venue authorization
for state writes and telemetry/audit reads, and deny client telemetry writes.
Audit creation requires the same venue permission and `uid == auth.uid`;
updates/deletes are denied. Rules do not require state/audit pairing. The
current brightness UI setters use direct `set()` rather than `writeAuditedState()`;
these REST commands deliberately provide the atomic audit record. They do
not claim that the UI or daemon's Admin writes are audited by those rules.

For the smoke test only, the installed service must already have correct
configuration and `PERIMETER_BRIGHTNESS_ENABLED=true`. Automatic predictions
additionally require `PERIMETER_AUTO_BRIGHTNESS_ENABLED=true`. Shell exports
do not change systemd's configuration. Do not install/reconfigure a service
as part of this reference procedure.

<!-- brightness-session: start -->

```bash
sudo systemctl start perimeter-control
sudo systemctl is-active --quiet perimeter-control
export BRIGHTNESS_WORKER_STOPPED=false
```

Check that the brightness listener is attached to the selected venue and no
configuration error is reported. Select a separately approved, low-risk whole
percentage; do not use the rounded snapshot as a substitute. The prepared
null command ensures a new value event even if this percentage was used
previously.

<!-- brightness-session: command -->

```bash
node tools/brightness-session.mjs command "$SMOKE_PERCENT"
```

Wait for pending → applied and the daemon's write/verification logs. Then:

<!-- brightness-session: verify-command -->

```bash
node tools/brightness-session.mjs verify-command
```

This independently checks fresh applied status, the exact command's hardware
fields, and every non-target screen against the snapshot. It is stricter than
the daemon's percentage tolerance. Status has no command ID; freshness alone
cannot attribute an outcome, so maintain exclusive ownership and perform the
independent readback. If pending, failed, mismatched, denied or unreachable,
stop the smoke test and proceed to restoration; never leave the test value
because verification failed. An ambiguous write is not permission to resend.

## 4. Restore intent and exact hardware; leave the worker stopped

On success **or any failure**, stop/drain first and resolve uncertain shutdown
as in step 2. Disabling only auto, hiding the UI with `perimeter.enabled`, or
setting the browser power state `off` does not stop manual hardware commands.
If a failing block exited the Bash shell under `set -e`, repeat the environment
and shell-helper setup in a new shell, reuse the saved session directory, and
run this section. Do not take a new snapshot over the pre-test baseline.

<!-- brightness-session: stop-before-restore -->

```bash
stop_brightness_worker
```

<!-- brightness-session: restore-intent -->

```bash
node tools/brightness-session.mjs restore-intent
```

This restores only the saved manual command and full auto config (including
the original `updatedAt`, or null deletion) with a new immutable audit event,
and checks Firebase readback. It never rewinds telemetry/calibration or audit
history. An originally enabled auto config is safe to store here **only
because the worker is stopped**.

<!-- brightness-session: restore-hardware -->

```bash
node tools/brightness-session.mjs restore-hardware
```

This calls `VnnoxClient.restoreBrightness(snapshot.hardware)` directly and
checks readback equality for **all four raw fields**, plus unchanged non-target
screens. It works with integer snapshots, fractional snapshots and nondefault
nit fields. It does not round, call `writeBrightness(percent)`, or depend on a
Firebase command/subscription. A successful Vnnox response alone is insufficient;
readback must match. The worker's own failure restoration is best-effort and
does not perform this additional exact restoration readback.

If `restore-intent` fails, still perform `restore-hardware` independently while
the worker is stopped. That command makes **no Firebase request** and does not
need `FIREBASE_ID_TOKEN`/`FIREBASE_UID`. Retain the snapshot and resolve Firebase
intent separately before any resume. If device restoration/readback fails,
keep the worker stopped, retain evidence, and obtain operator assistance;
do not mark rollback complete or automate retries of an ambiguous write.

For a feature-disable rollback, restore/read back hardware with this same
stopped-worker path, then leave the service stopped or separately configure
`PERIMETER_BRIGHTNESS_ENABLED=false` before a future restart. If the feature
was disabled already, skip prepare/start/command and use snapshot plus the
same direct restore path; a disabled worker has no brightness listener and
does not publish a new failed/applied result for a controller command.

## Resume is a separate ownership decision

Do not automatically restart after exact restoration. With auto enabled in
both the service and retained config, startup preserves auto and ignores the
retained manual percentage; a later prediction may change the hardware. In
manual mode a retained valid integer command is processed once at startup;
it may differ from the hardware snapshot, especially a fractional one. Missing
or invalid manual intent causes no startup write. Record the intended ongoing
mode and command and authorize that handoff before resuming. Exact restoration
is verified while the worker is stopped, not a promise that resumed control
will hold the snapshot indefinitely.

## Optional auto/controller and failure checks

Use a separate snapshotted session and the same restoration sequence for each
authorized scenario. In the UI, verify subscription-confirmed saves and manual
integer validation; a Firebase save does not establish physical application.
With auto service support on and desired auto disabled/missing, shadow ticks
publish predictions without auto dispatch. `brightnessStatus.mode` can remain
`"auto"` whenever daemon auto support is on; it is not the desired enabled
switch. Check `brightnessAuto.enabled`, prediction and actual worker activity.

When explicitly enabled with a complete validated config, automatic requests
use hysteresis, slew, clamp and the `state: "off"` gate from the
[design](../docs/auto-brightness-design.md). A new manual command invalidates
undispatched auto work and the worker attempts `enabled:false`; already
dispatched work drains. Inspect calibration only when prediction context was
available. Configuration errors with an enabled worker can publish failed
status; a stopped/feature-disabled worker produces no fresh result. Exercise
auth denial, unreachable endpoints and invalid commands with mocks, rather
than changing live credentials, firewall rules or malformed shared state.

## Reproducible local proof and physical record

From `perimeter-control/`, no credentials, dependencies or services required:

```bash
node --test --test-concurrency=1 tests/brightness-runbook.test.js
```

The test extracts and executes the marked Bash commands above, with the real
reference helper and Vnnox client. Synthetic authenticated REST/device and
systemctl doubles deny unexpected network requests. It checks integer and
fractional restoration, raw nit/scale preservation, scoped GUIDs, non-target
isolation, audit/null semantics, auth failures and stopped/disabled ordering.
This is mock evidence; rule-expression checks are not an emulator or deployed
rules qualification. See [the README](README.md#tests) for runtime regressions.

The physical record remains **HOLD / not executed** until an authorized
operator records gateway/version, environment/venue/GUID, initial raw snapshot,
command, fresh telemetry, independent target/non-target readbacks, shutdown
drain, exact restoration, restored intent and the decision to remain stopped
or hand control back. Exclude credentials, tokens and raw login captures.
