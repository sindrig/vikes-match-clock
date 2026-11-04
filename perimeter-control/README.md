# perimeter-control

Brightness gateway for the stadium perimeter LEDs. **All venues use browser
media playback; Resolume is unsupported.** This service retains manual and
automatic physical brightness through Vnnox/UCenter, Firebase status and
calibration, and the power-state gate for automatic writes.

**Hardware qualification: HOLD.** This retirement is verified with mocks and
temporary installation fixtures only. No gateway installation, live Firebase,
Vnnox, SSH, cloud cleanup or physical qualification is performed. The
[brightness checklist](BRIGHTNESS_SMOKE_TEST.md) and
[Windows/Chromium checklist](WEB_RENDERER_QUALIFICATION.md) require separately
authorized operator work.

## Runtime

1. Listen to the power state through the Firebase Admin SDK:
   `states/vikuti/perimeter/state` by default. Only exact `"on"` / `"off"`
   values feed the automatic-brightness gate; malformed values are inert.
2. Run the opted-in brightness worker and optional sun/weather scheduler.
   Requests still use snapshot → write → verify → restore. A missing command
   or disabled brightness feature stays inert.
3. Periodically reopen the power-state listener (300 s by default) and
   republish the cached brightness status, without replaying a hardware write.
4. On SIGTERM/SIGINT, detach listeners, stop scheduling new work, and await
   the brightness worker's in-flight verification/restoration. The existing
   process grace period is bounded at 30 s; repeated signals share one drain.

The JS Admin SDK uses RTDB's WebSocket transport, the same transport as the
clock apps. The listener refresh remains a safety net against delivery stalls.
Browser displays independently consume the existing desired power/media state.

No media executor is imported, constructed or contacted, including when an old
environment file still sets `PERIMETER_RESOLUME_ENABLED=true`. The old enable
flag and all preview, geometry, overlay, ad-layout, import, media SSH and cache
settings are ignored. Existing `adLayout`, `overlay`, `mediaPairs`, numeric
compatibility keys, Storage media and legacy telemetry records remain intact.
The daemon writes only brightness status/calibration and the retained automatic
brightness control paths; it never replaces or deletes the telemetry subtree.
Frontend/Functions retirement is separate work in #241.

## Prerequisites

1. **Node.js >= 22**, required by the retained Firebase Admin 14.2.0. Install
   a stable system executable outside protected home directories. The installer
   resolves and validates the exact Node executable it puts in systemd's
   `ExecStart`; an interactive shell's Node version is insufficient.
2. **Corepack with pnpm 12.16.1 available to the installing user**. The gateway
   pins pnpm in `package.json`; `pnpm-lock.yaml` is its sole authoritative
   dependency lock. Use `corepack pnpm` for local commands. A frozen install
   must succeed before installation changes begin.
3. **Firebase service account**: obtain the approved JSON credential from the
   gateway/project maintainer through the existing credential store. The Admin
   SDK needs the gateway's Realtime Database access and bypasses client rules.
   Creating a replacement key is a separate authorized action. See
   [the environment contract](../docs/environment.md#gateway-access).
4. **Vnnox/UCenter connectivity and credentials** for physical brightness,
   including the device serial and exact perimeter screen GUID. Preserve the
   existing UCenter proxy/network route even if it shares a host with retired
   media infrastructure. Automatic brightness additionally uses Open-Meteo
   egress. No media-host SSH key, media proxy or asset cache is required.

## Installation and upgrade

Requires explicit host/service and hardware authorization. Installation starts
and restarts a service that can consume live desired state. Pass exactly one
credential file; no implicit SSH-key discovery or credential generation occurs:

```bash
sudo ./install.sh /path/to/firebase-service-account.json
```

Before changing the user, target directories or service, the installer checks
arguments, source files, required commands, the selected Node version, and the
pinned pnpm version, then prepares a frozen production dependency install in a
temporary directory. Both pnpm phases use one private absolute store and an
explicit isolated, project-local `node_modules/.pnpm` layout, overriding inherited
layout settings. It rebuilds the dependencies offline from that store, verifies
that every dependency link is relative and stays inside `node_modules`, and
imports the runtime with the validated Node executable. These checks finish
before any installation files change; a failed preparation leaves the old
runtime, dependencies, credentials, environment and unit untouched.
It then:

- Keeps the `perimeter-control` system user and service identity.
- Installs the retained gateway under `/opt/perimeter-control` and copies the
  verified offline dependency tree, replacing only the installer-managed
  `node_modules`. Dependencies remain readable by the service without the
  installer's home, temporary directory or cache, including when staging and
  the destination are on different filesystems.
- Removes **only** these obsolete installed JavaScript files:
  `overlay.js`, `ad-layout.js`, `resolume-import.js`,
  `resolume-preview.js`, `geometry.js`.
- Installs the supplied service account at
  `/etc/perimeter-control/perimeter-service-account.json` (0640, service group).
- Creates `/etc/perimeter-control/perimeter-control.env` from the example if
  absent; preserves an existing file byte-for-byte, including inert legacy
  media variables. Existing operator files, unused SSH keys, old media caches
  and any old unmanaged npm lockfile are left alone. Dependency files under
  `node_modules` remain managed by pnpm.
- Installs/enables/restarts `perimeter-control.service`. The unit no longer
  needs a writable media-cache directory.

The repository's competing gateway npm lock and direct Storage/JPEG/PNG media
dependencies are removed. Firebase Admin still depends on Storage transitively.
This completes the **gateway portion of #239**; Functions, global CLI setup and
GitHub workflows remain outside this change.

For authorized host verification, compare
`systemctl show perimeter-control --property=ExecStart --value` with the
installer-reported Node executable and run that exact executable with
`--version`. Confirm it is >= 22. This host check remains part of the hardware
qualification HOLD.

## Configuration

Edit `/etc/perimeter-control/perimeter-control.env`. systemd loads it through
`EnvironmentFile=`, using `NAME=value` syntax without `export`; it is not an
executable Bash script or an automatically loaded Node dotenv file. For an
authorized manual launch, export variables into that process's shell explicitly.
Do not start the daemon merely to check credential presence.

| Variable                             | Default                                                 | Purpose                                         |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------- |
| `PERIMETER_FIREBASE_DATABASE_URL`    | `https://vikes-match-clock-firebase.firebaseio.com`     | RTDB root                                       |
| `PERIMETER_FIREBASE_PATH`            | `states/vikuti/perimeter/state`                         | Power-state gate                                |
| `PERIMETER_SERVICE_ACCOUNT_FILE`     | `/etc/perimeter-control/perimeter-service-account.json` | Admin SDK credential                            |
| `PERIMETER_LISTENER_REFRESH_SECONDS` | `300`                                                   | Listener recovery/status republish (0 disables) |
| `PERIMETER_INITIAL_BACKOFF_SECONDS`  | `1`                                                     | Brightness pre-write retry backoff              |
| `PERIMETER_MAX_BACKOFF_SECONDS`      | `60`                                                    | Maximum brightness pre-write backoff            |

The [environment example](perimeter-control.env.example) documents all retained
brightness, automatic-mode, weather, location and Vnnox settings, including
per-venue path overrides. Existing brightness flags remain opt-in.

## Service lifecycle and logs

After an authorized environment change, restart the service:

```bash
sudo systemctl restart perimeter-control
sudo systemctl status perimeter-control
journalctl -u perimeter-control -f
# To stop or disable:
sudo systemctl stop perimeter-control
sudo systemctl disable --now perimeter-control
```

Weather timeout/cancellation fixes belong to #254 (open PR #270) and are **not
included in this base**. Cached/stale weather behavior below is retained; an
HTTP provider stall remains an existing limitation until that work is integrated.
This stack includes the #252 worker arbitration and #253 continuous brightness
curve; see [arbitration](../docs/brightness-arbitration.md) and the
[model](../docs/auto-brightness-design.md). Physical qualification remains HOLD.

## Perimeter brightness (Vnnox/UCenter LED brightness)

The daemon can set and verify the **brightness of the perimeter LED screen**
through the Nova Vnnox/UCenter service (`vnnox-brightness.md` documents the
protocol and its safety assessment). It is **disabled unless explicitly
enabled** — a missing command, missing configuration, or a disabled feature
never touches a live screen.

### Command and status

| Path                                     | Writer     | Purpose                                                                  |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `states/{location}/perimeter/brightness` | Controller | Requested brightness, an integer 0–100 (or absent)                       |
| `perimeter/{location}/brightnessStatus`  | Daemon     | `requestedPercent`, `appliedPercent`, `phase`, `error`, server timestamp |

- The command value is the requested **whole percentage** (0–100). `null` /
  missing / non-integer / out-of-range values are inert — a missing command
  must never affect a live screen.
- The status phase is `pending` (before hardware I/O), `applied` (the screen
  read verified the request within tolerance), or `failed` (with a safe error
  description); `appliedPercent` is present only when a value was verified.
- The status is daemon-owned and client-read-only; the database rules already
  deny client writes under `perimeter/{location}`.

### How it works

For each valid request the daemon:

1. publishes `pending`,
2. **snapshots** the current perimeter screen brightness and reads the
   cabinet metadata for diagnosis,
3. logs in to Vnnox (per-device token) and **writes the integer read-scale ratio
   only to the configured perimeter screen GUID** (`guidList` has exactly one
   entry) — the MVR screen is never targeted,
4. **polls the screen read** until it matches the request within an integer
   percentage tolerance, then publishes `applied`,
5. on any failure after the write has started, **best-effort restores the
   snapshot** (writing the exact pre-write ratio/ratioScale/nit/nitType back to
   the same screen) before publishing `failed`; restore failures are logged
   and appended to the safe error text. This best-effort restore does not
   independently verify the restored readback.

Requests are processed **one at a time** by a serialized worker that keeps the
newest pending request. A newer request supersedes an older one before a write
has started; once a write has started the sequence is irreversible and finishes
(verifies or restores) before the newer request is picked up. Pre-write
transient failures retry with bounded exponential backoff.

The worker owns request identity and automatic-source admission. It rechecks
supersession after awaited snapshots and immediately before dispatch; manual
intent invalidates suspended automatic ticks before awaiting the Firebase
disable update. With the auto feature enabled, retained automatic mode governs
startup after both initial subscriptions and the prior applied baseline settle.
See the [arbitration contract and local regression proof](../docs/brightness-arbitration.md)
for startup ordering and the irreversible dispatch boundary.

### Authenticated smoke test and exact rollback

Use the [single executable smoke/restoration procedure](BRIGHTNESS_SMOKE_TEST.md)
for both integer and fractional snapshots. Its reference helper has local mock
verification only; physical gateway qualification remains **HOLD**. Select the
database URL, venue, device route/serial/project and perimeter GUID explicitly;
provide the selected project's Firebase ID token and a venue-authorized UID
through the approved loader. The REST commands use an atomic root PATCH with
an append-only audit record and exact stringified changes, including nulls.
They never write daemon-owned status/calibration. Current brightness UI
setters use direct state writes; rules allow those but do not enforce audit
pairing. An unauthenticated production PATCH is not a supported example.

Snapshot raw `ratio`, `ratioScale`, `nit` and `nitType`, and all non-target
screen values, before changing anything. Integer commands 0–100 are distinct
from exact hardware restoration: rounding 4.5% to a command of 4 or 5 loses
the snapshot, and even an integer percentage may have nondefault nit fields.
Stop/drain the worker, restore saved Firebase intent, then directly restore
and read back all four Vnnox fields while the worker remains stopped. If
Firebase restoration fails, the direct hardware step is still executable
without Firebase access. Leave the worker stopped until ownership is decided;
resuming manual mode can replay retained intent and resuming auto can change
the hardware. Hiding the UI, setting power `off`, or disabling auto alone does
not stop manual writes. Never submit a command expecting a disabled worker
to restore the device or publish a new result.

### Configuration

See `perimeter-control.env.example` for the full list of environment
variables, including `PERIMETER_BRIGHTNESS_ENABLED`, `PERIMETER_BRIGHTNESS_PATH`,
`PERIMETER_BRIGHTNESS_STATUS_PATH`, `PERIMETER_VNNOX_*` (base URL, device
`ip`/`port`/`protocol`, serial, project ID, **perimeter screen GUID**, username,
password source, timeout), and the retry/verification knobs.

Required to enable: `PERIMETER_BRIGHTNESS_ENABLED=true` plus a device serial
(`PERIMETER_VNNOX_SN`) and the **perimeter screen GUID**
(`PERIMETER_VNNOX_PERIMETER_GUID`) — there is deliberately no default for the
GUID, so a name-based or all-screen selection is impossible. If the feature is
enabled but configuration is incomplete, requests fail with a
configuration-caused status instead of touching hardware. Retrieve the current
device username and password from the gateway maintainer's approved credential
store; do not assume a default login. `PERIMETER_VNNOX_PASSWORD_SOURCE=env` reads
`PERIMETER_VNNOX_PASSWORD`, `=file` reads the first line of
`PERIMETER_VNNOX_PASSWORD_FILE` on the gateway.

## Automatic brightness (sun + weather prediction)

The brightness feature can run an `automatic` mode that replaces the operator's
5–6 manual brightness changes per match with a prediction computed **in this
daemon**: the sun's altitude at the screen's location (exact, offline math via
SunCalc 1.9.0) and cloud cover at that location from **Open-Meteo**
(free for non-commercial use — attribution required: _"Weather data by
Open-Meteo.com"_). The controller UI only writes mode and parameters; predicted
values flow through the same snapshot → write → verify → restore worker as
manual commands. The model (empirical curve: clear-sky lux from elevation,
Kasten & Czeplak cloud multiplier, power-law lux→percent mapping) is documented
in [`docs/auto-brightness-design.md`](../docs/auto-brightness-design.md); the
reference test vectors in that doc are encoded in `tests/auto-brightness.test.js`.

### Paths

| Path                                         | Writer              | Purpose                                                                                                                                              |
| -------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `states/{location}/perimeter/brightnessAuto` | Controller          | Auto mode config: `{ enabled, min, max, exponent, cloudWeight, luxMin, luxMax, updatedAt }`                                                          |
| `perimeter/{location}/brightnessStatus`      | Daemon              | Extended with `mode` (`"auto"`) and a live `predicted` readout; a fresh daemon with no worker history publishes a `shadow`-phase prediction document |
| `perimeter/{location}/brightnessCalibration` | Daemon              | Append-only fit log: `{ ts, source: "auto"\|"manual", percent, lux, sunElevationDeg, cloudCover }`                                                   |
| `states/{location}/perimeter/brightness`     | Controller/operator | Manual integer intent only; automatic targets enter the shared worker directly                                                                       |

The `predicted` block is `{ lux, percent, sunElevationDeg, cloudCover,
weatherAgeMin, weatherStale }` — the live readout the controller shows. It is
published every tick (60 s default), both when auto is **enabled** (live
writes) and when it is disabled (shadow mode: predictions only, for comparing
against the operator's manual values during rollout).

### Safety rules

- **Hysteresis:** an auto write is only enqueued when the target differs from
  the last applied value by ≥ 2 percentage points.
- **Slew limit:** each auto write moves at most
  `PERIMETER_AUTO_MAX_SLEW` (default 15) points from the last applied value,
  and at most one auto-initiated write happens per tick — no visible jumps
  mid-match.
- **Clamp:** auto output stays inside `[max(min, 1), min(max, 99)]` — 0 and
  100 are manual-only (0 remains an explicit off).
- **Manual wins:** a manual command while auto is enabled disables auto
  (writes `enabled: false` into `brightnessAuto`) and applies the manual value.
- **Off gate:** auto writes are skipped while the perimeter state is `off`
  (avoiding pointless hardware writes on a dark screen); a transition to `on`
  recomputes immediately (`PERIMETER_AUTO_SKIP_WHEN_OFF=false` disables the
  gate).
- **Errors are contained:** any internal tick failure holds the last applied
  value; weather problems degrade to the last cached cloud fraction, and after
  **3 h stale** to a conservative fixed fraction of 0.8 with
  `weatherStale: true` in the status (dimming is safer than glaring over
  Reykjavík on an overcast day). The daemon never blocks or throws on weather
  problems.
- **Enabled but incomplete:** with the brightness worker and auto feature on,
  invalid `PERIMETER_LAT`/`PERIMETER_LNG` publishes a configuration-caused
  `failed` status. With `PERIMETER_BRIGHTNESS_ENABLED` false there is no
  brightness worker/listener and no fresh brightness outcome; a controller
  command cannot restore hardware through that disabled worker.

### Backward compatibility (regression safety)

- With `PERIMETER_AUTO_BRIGHTNESS_ENABLED` unset/false the daemon publishes
  **byte-identical** status documents to the pre-auto schema (no `mode`, no
  `predicted`, no new Firebase reads or writes) — a test pins the exact
  payload shapes, so manual-only operation cannot regress.
- With the flag on, worker status documents gain extra fields (`mode`,
  `predicted`) that older controllers ignore gracefully: the legacy parser
  builds its own object and only rejects unknown _phases_. The one
  not-parseable shape is the fresh-daemon `shadow` document (prediction
  published before any write); it is inert for manual operation and the
  updated controller renders it as the `Samanburður` badge. Enable the
  daemon flag together with the controller update that knows the `shadow`
  phase — both ship from this repository.

### Calibration loop

Every applied auto change and every manual override while auto is enabled is
appended to `perimeter/{location}/brightnessCalibration`. Offline regression on
those `(lux, percent − min)` pairs in log space fits the corrected `exponent`
and `luxMax` (see the design doc); update the two values in `brightnessAuto`
and defaults converge to house taste.

### Requirement: keep `ambientLightCompensation` at 0

Percent → actual brightness is 1:1 today because the cabinet's
`ambientLightCompensation` is **0** (re-confirmed by the 2026-09-22 probe).
If anyone enables Vnnox auto-compensation later, the mapping stops being 1:1
and the auto mode's predictions would be wrong — leave it off.

### Configuration

Set `PERIMETER_AUTO_BRIGHTNESS_ENABLED=true` (with
`PERIMETER_BRIGHTNESS_ENABLED=true`). Location defaults to Fossvogur
(`PERIMETER_LAT=64.117`, `PERIMETER_LNG=-21.91`; a ±1 km error is < 0.01° of
elevation and irrelevant). Tuning knobs — `PERIMETER_AUTO_TICK_SECONDS` (60),
`PERIMETER_AUTO_WEATHER_POLL_SECONDS` (900), `PERIMETER_AUTO_MAX_SLEW` (15),
`PERIMETER_AUTO_SKIP_WHEN_OFF` (true), `PERIMETER_OPEN_METEO_URL`,
`PERIMETER_AUTO_TIMEZONE` (`Atlantic/Reykjavik`), plus the path overrides
`PERIMETER_AUTO_BRIGHTNESS_PATH` and
`PERIMETER_BRIGHTNESS_CALIBRATION_PATH` — are documented in
`perimeter-control.env.example`. Venue egress to `api.open-meteo.com` must be
reachable from the gateway box.

Weather requests have a separate **10-second deadline** covering both response
headers and the complete JSON body (`OpenMeteoCloudCover`'s `requestTimeoutMs`
constructor option). A timeout preserves the cached value and its age, allowing
the next scheduled poll to try again. `stop()` aborts the active request and
prevents further polling until `start()`. Restarting polls immediately; late
results from an earlier request cannot update the cache or release the new
request's guard. Providers that ignore `AbortSignal` cannot hold up the poller,
but their underlying work cannot be forcibly terminated.

## Tests

From `perimeter-control/`, with Node >= 22 and Corepack:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test
```

Tests run one file at a time and use mocks/temporary installation fixtures.
The retained worker, auto model and Vnnox suites remain; the weather suite also
covers the separately reviewed deadline/cancellation fix.
Gateway integration scenarios cover power gating, manual and auto writes,
weather fallback, calibration, status recovery and irreversible-write drain.
Installer unit fixtures stub user/service/dependency operations; they never
install an actual systemd service. Hardware acceptance remains on HOLD.

For the documentation procedure alone, no dependency install is needed:

```bash
node --test --test-concurrency=1 tests/brightness-runbook.test.js
```

It executes the smoke guide's marked Bash commands with the actual reference
helper/Vnnox client and synthetic authenticated REST/device/systemctl doubles.
Unexpected network requests are denied. Integer/fractional and nondefault
scale/nit restoration, non-target GUID isolation, audited null deletion,
auth/rule-expression denial and stopped/feature-disabled ordering are mock
evidence only, separate from physical HOLD. No live credentials are consumed.

Weather-only tests need no dependency installation. From `perimeter-control/`:

```bash
node --test tests/weather.test.js
```

These cover healthy/cache/stale behavior, cancellation-ignoring providers,
stop/restart races, and real HTTP stalls on loopback with ephemeral ports.
They do not contact Open-Meteo, Firebase, or hardware.

The opt-in real-pnpm proof runs the installer against synthetic existing
installations, twice per successful layout. It checks same- and cross-filesystem
destinations, inherited global/PnP/custom layout settings, runtime imports after
staging cleanup, and frozen/offline preparation failures preserving the old
installation. Choose a writable directory on a different filesystem from
`TMPDIR` (or `/tmp`); allow about 100 MiB per fixture, rather than a small `/dev/shm`:

```bash
PNPM_TEST_CROSS_DEVICE_TMPDIR=/path/on/second/filesystem \
  node tests/install-pnpm.mjs
```

User/service commands remain doubles; only the pinned pnpm and file operations
are real. No gateway is started. Optional `PNPM_TEST_ARTIFACTS` saves logs and
JSON proof metadata. Setting `PNPM_TEST_INSTALLER_REF=a5e7ba0b` instead exercises
the original installer and asserts its two failures; that comparison needs a
cold automatically selected store on the destination filesystem. It does not
delete a caller store; the original installer may write to pnpm's automatically
selected cache. The repaired installer uses only its own temporary store.
pnpm/dependency versions are unchanged.

See [the retirement proof](../docs/brightness-gateway-retirement.md) for the
removal inventory and reproducible comparison with the reviewed baseline.

## Browser web perimeter

Browser playback, Firebase/Storage contracts, web CORS tooling and kiosk remain
supported. Use [mapping measurement](WEB_MAPPING_MEASUREMENT.md) and the
[physical qualification checklist](WEB_RENDERER_QUALIFICATION.md) for separately
authorized venue work. The published `locations/{location}/perimeterDisplay`
web mapping and immutable media generations select the browser output. Preserve
legacy numeric compatibility keys and existing media/overlay records; this
retirement performs no data migration, cache cleanup or Storage deletion.

The completed `vikuti-swap-to-web`, `vikuti-revert-to-resolume` and
`virkid-swap-to-web` scripts are retired. Resolume is no longer a rollback
target. Retain historical design/probe material as historical evidence rather
than installation instructions for an unsupported executor.
