## Context

See `proposal.md` and `specs/perimeter-brightness-control/spec.md`. The React
controller uses Firebase as the shared state authority. The Node
`perimeter-control` daemon subscribes to desired commands and publishes
daemon-owned results below `perimeter/{location}`. Vnnox is reachable only on
the gateway and uses incompatible read and write scales: reads use
`ratio / ratioScale`; writes require a 0--1 fraction.

The documented Vnnox device exposes both the live perimeter and an MVR screen.
The perimeter screen GUID must remain an explicit runtime configuration, never
a name-based or all-screen selection.

## Goals / Non-Goals

**Goals:**

- Retain Firebase desired-state commands and daemon-owned status publication.
- Keep Vnnox authentication, conversion, snapshot, write, verification, and
  restoration inside the gateway daemon.
- Scope every hardware write to the configured perimeter screen and expose its
  asynchronous outcome to all controllers.

**Non-Goals:**

- Control the MVR screen, cabinet-level calibration, ambient compensation, or
  any Vnnox setting other than brightness.
- Add browser-to-Vnnox access, a cloud API, or client write access to published
  daemon status.
- Change existing perimeter on/off or Resolume behavior.

## Decisions

### Firebase command and status split

The requested integer percentage will live at
`states/{location}/perimeter/brightness`. The daemon will publish
`perimeter/{location}/brightnessStatus` with `requestedPercent`,
`appliedPercent`, `phase`, `error`, and a server timestamp. The controller
subscribes to both through the existing perimeter context and never treats a
Firebase write confirmation as a hardware result.

This preserves existing client write and daemon-only status permissions, lets
multiple controllers observe a result, and explicitly applies last-write-wins.
A direct controller request to the gateway was rejected because it would expose
local hardware credentials and bypass recovery handling.

### Serialized, supersedable daemon worker

The daemon will subscribe to the brightness command independently of on/off
state, accept only finite whole percentages from 0 through 100, and process one
valid request at a time. It retains the newest pending request and checks for a
newer request before retries and irreversible stages. A newer request supersedes
the older one.

This follows the existing bounded-backoff perimeter applicator. Polling Firebase
or assigning a default brightness for a missing command was rejected because a
missing command must never affect a live screen.

### Dedicated Vnnox client and explicit targeting

A dedicated module will handle login, authenticated requests, response
validation, screen reads, and writes. Runtime configuration includes an enable
flag, base URL, device `ip`/`port`/`protocol`, serial number, project ID,
perimeter GUID, timeouts, retry limits, and password source. Production
credentials will have no tracked default.

The client converts writes as `percent / 100` with `ratioScale: 1`, and reads
as `ratio * 100 / ratioScale`; invalid or zero read scales fail safely. Every
write provides exactly the configured GUID in `guidList`. Name discovery and
device-wide writes were rejected because they can affect MVR.

### Snapshot, verification, and restoration

Each request logs in, reads screen and cabinet metadata, snapshots the existing
perimeter brightness, writes the scoped value, then polls until the screen read
matches the requested percentage within a documented small integer tolerance.
It publishes `pending` before I/O and `applied` only after verification.

After a write has started, any terminal failure triggers a best-effort restore
to the screen snapshot before publishing `error`. Restoration failures are
logged and appended to the safe error message. Cabinet metadata supports
diagnosis, while restoration uses the documented screen-scoped write API.

### Controller interaction

The existing perimeter settings modal will expose a labeled percentage input or
slider, explicit apply action, requested value, daemon phase, verified result,
and safe error. It remains hidden with the perimeter feature flag. Strict parser
and context patterns preserve Firebase as the only source of displayed state.

## Risks / Trade-offs

- [Vnnox has intermittent connection and malformed-response failures] -> Use
  timeouts, `Connection: close`, bounded retries, and newest-request
  supersession.
- [A scale conversion defect can over-brighten the screen] -> Keep conversion in
  one tested boundary, accept only 0--100 integers, and assert write payloads.
- [Partial hardware application can make cabinets inconsistent] -> Snapshot,
  verify, attempt restore, and report failure rather than false success.
- [Configuration can target MVR] -> Require a GUID and test that multi-screen
  responses never cause writes outside the configured perimeter GUID.
- [Controller and daemon deploy at different times] -> Keep Vnnox handling
  disabled by default; absent commands and status remain inert.

## Migration Plan

1. Deploy controller and daemon support with Vnnox handling disabled; existing
   perimeter behavior remains unchanged.
2. Configure the gateway environment with reviewed endpoint, device identity,
   perimeter GUID, and secret password source, then restart the daemon.
3. Enable the feature and validate a low-risk brightness change using published
   status and daemon logs.
4. Roll back by disabling the daemon and controller feature flags. The prior
   verified percentage can be re-issued through the controller or Vnnox UI.

## Open Questions

- Confirm the Icelandic operator label and whether the UI uses a stepped slider,
  numeric input, or both; this does not alter the command protocol.
