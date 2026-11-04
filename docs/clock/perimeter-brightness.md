# Perimeter brightness controller

The [automatic-brightness design](../auto-brightness-design.md) is authoritative
for schema, model, vectors and rollout phases; [arbitration](../brightness-arbitration.md)
owns gateway admission/dispatch. [Gateway configuration](../../perimeter-control/README.md)
and the [smoke/restoration procedure](../../perimeter-control/BRIGHTNESS_SMOKE_TEST.md)
own operation and physical qualification. This reference owns React UI behavior.
Update it for UI changes and the linked contract for model/protocol changes;
use the [task index](../README.md).

## Perimeter Brightness (Vnnox LED brightness)

The controller writes **desired state**; the gateway applies Vnnox/UCenter
brightness, verifies the result and publishes its outcome. A Firebase write
acknowledgement is not proof of hardware success. The controller never contacts
Vnnox directly. The ownership/schema tables live in the
[gateway command contract](../../perimeter-control/README.md#command-and-status).

`parsePerimeterBrightnessStatus()` accepts `pending`, `applied`, `failed` and
`shadow`. `appliedPercent` appears only after verification. A null
`requestedPercent` is accepted only for configuration-caused failure or shadow
prediction, never pending/applied or a command-caused failure. The daemon-owned
status lives under `perimeter/{location}` and is client-read-only.

The `Bjartleiki jaðarskjás` section in
`clock/src/controller/PerimeterControl.tsx` is available for configured and
unconfigured web venues when `perimeter.enabled` is true. Physical effects still
require that venue's opted-in gateway. `VENUES_WITHOUT_BRIGHTNESS` (currently
`virkid`) excludes venues without a brightness controller; it is independent of
browser media rendering.

`usePerimeter` contains desired data and commands. `BrightnessSection` reads
daemon reports separately through `usePerimeterTelemetry`; hardware updates
do not context-invalidate match consumers. The telemetry owner attaches only
for an authenticated selected venue and remains outside public App readiness.
Venue/auth scope changes, disconnect and read errors clear the visible report;
old callbacks cannot restore it across a venue/auth A → B → A or read retry.
The panel offers read retry on unavailable/denied reports, independently of
match recovery. There is no inactivity timeout on an unchanged valid report.
An SDK delivery remains a report with the daemon's timestamp, not proof of a
new hardware verification, and an acknowledged desired write never fabricates
an applied percentage.

## Perimeter Automatic Brightness (sun + weather prediction)

The mode control (`Handvirkt %` / `Sjálfvirkt`) edits configuration; the gateway
owns actual prediction and writes. The controller uses the same pure model for
preview, including SunCalc v1 altitude in radians. Do not copy model formulas or
reference vectors here; update the [design and cross-runtime contract](../auto-brightness-design.md#cross-runtime-contract).

`usePerimeter()` exposes `brightnessAuto` (`null` means disabled) and
`setPerimeterBrightnessAuto(config)`. Saving validates the config and replaces
the whole node with an audited `updatedAt: serverTimestamp()`. Rejections
propagate so the editor can retain its draft/error. `parsePerimeterBrightnessAuto()`
strictly validates known fields; schema bounds belong in the design, validator
and rules together.

Status mode missing from older daemons, or unrecognized, falls back to manual.
The optional `predicted` readout carries lux, sun elevation, cloud cover, stale
flag, and optional target percentage/weather age. A malformed readout is dropped
without rejecting an otherwise valid status.

Operator behavior:

- Mode changes use subscription-settled drafts. Switching to Automatic saves
  current config (or documented defaults) with `enabled: true`; returning to
  Manual retains config with `enabled: false`. A new manual command also
  disables auto in the gateway: operator intent wins.
- Auto parameter sliders/input pairs (`Lágmark`, `Hámark`, `Ákeðni`,
  `Skýjaáhrif`) submit one whole-node save. Bounds keep min ≤ max; an empty or
  invalid draft blocks `Vista` rather than submitting a fabricated value.
- The live predicted readout shows `Gömul veðurgögn` when the gateway reports
  stale weather. Cache age and conservative fallback policy belong in the
  [weather contract](../../perimeter-control/README.md#automatic-brightness-sun--weather-prediction).
- `AutoBrightnessCurve` samples every 15 minutes over 24 hours at Fossvogur
  (64.117 N, −21.91 E; Iceland uses UTC year-round). Its Open-Meteo forecast is
  attributed as `Spá frá Open-Meteo.com`; fetch failure displays a clear-sky
  preview note. This preview never decides hardware writes. Browser/gateway
  model tests consume the same [fixed vectors](../fixtures/auto-brightness-contract.json).

## Manual percentage drafts

The panel shows the subscribed requested value, gateway phase, verified applied
value and safe failure text. `Vista` validates an integer 0–100. It stays disabled
while a submission awaits the matching `brightness` subscription or while the
gateway reports `pending`. No optimistic shared value is installed; subscription
settlement re-enables the next request instead of leaving the form stuck.

Keep the three local input states distinct: untouched (`null`, display the
subscribed value), explicitly cleared (`""`, display blank), and a numeric draft.
Cleared, non-integer or out-of-range input blocks submission, so blank cannot
silently become 0%. The accessible label is `Bjartleiki jaðarskjás`.

All saves retain current-session/original-command-origin eligibility and audit
behavior from the [command contract](../session-mutation-boundary.md). Software
model/continuity checks do not establish calibration or physical qualification;
the gateway's hardware HOLD remains separate.
