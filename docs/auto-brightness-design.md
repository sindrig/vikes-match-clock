# Automatic perimeter brightness — design (sun + weather prediction)

Design date: 2026-09-22
Status: scoped and agreed, not yet implemented

## Decisions made (scoping session)

- Calculation runs in the **perimeter-control daemon**. The controller UI only
  sets mode and parameters; the daemon writes brightness through the existing
  snapshot → write → verify → restore worker.
- Weather source: **Open-Meteo** (no API key, free for non-commercial use,
  open source, 15-min nowcast available). Attribution required:
  "Weather data by Open-Meteo.com".
- Model: **empirical curve** first (sun elevation + cloud multiplier + gamma),
  not full pvlib-style physics. Pure math, ~60 lines, unit-testable offline.
- Light-sensor route (closed-loop hardware measurement): **ruled out by live
  probe on 2026-09-22** — no sensor is attached, no lux reading exists in the
  API, and the UCenter 2.2.B1 firmware/SPA has no sensor support at all
  (evidence in `captures/vnnox-sensor-probe-2026-09-22.md`). Prediction is
  the only software route; if an NS060 sensor is ever fitted later, its lux
  value would replace the predicted one in the same curve.

## Goal

Replace 5–6 manual brightness changes per match with an `automatic` mode that
predicts the right percentage from:

1. the sun's position at the screen's location (exact, offline math), and
2. cloud cover at that location (forecast, polled).

The operator sets bounds (`min`/`max`) and feel (`aggressiveness`) once; the
daemon tracks the sky through dusk, passing clouds, and the night floor.

## Existing behavior we build on

From `perimeter-control` (`brightness.js`, `vnnox-brightness.md`):

- Commands are whole integers 0..100 at
  `states/{location}/perimeter/brightness`; invalid/missing values are inert.
- One serialized worker processes one request at a time; a newer request
  supersedes an older one before the write dispatch. Writes are snapshot-
  protected and verified, with automatic restore on failure.
- Status goes to `perimeter/{location}/brightnessStatus`
  (`pending`/`applied`/`failed` + `requestedPercent`/`appliedPercent`).
- Cabinet `ambientLightCompensation` is 0, so percent → actual brightness is
  1:1 today. The auto mode must document that this must stay 0 (if anyone
  enables Vnnox auto-compensation later, the mapping stops being 1:1).

## The model

### Step 1 — sun elevation (exact, no network)

Sun altitude `e` (degrees above horizon) from **SunCalc**
(`github.com/mourner/suncalc`, MIT, zero dependencies):

```js
const elev = (SunCalc.getPosition(date, LAT, LNG).altitude * 180) / Math.PI;
```

Accuracy is ~1 minute of sun motion — irrelevant for brightness. Iceland is
UTC year-round, so no DST edge cases. Location is a config value; the default
for Fossvogur is 64.117 N, −21.91 E. A ±1 km error is < 0.01° of elevation and
irrelevant.

### Step 2 — clear-sky illuminance (lux) from elevation

Piecewise approximation, tuned to typical clear-sky daylight values
(~100,000 lux at high sun; civil twilight ≈ tens of lux):

```js
function clearSkyLux(elevDeg) {
  if (elevDeg >= 0) return 120000 * Math.sin((elevDeg * Math.PI) / 180) ** 1.15;
  if (elevDeg >= -6) return 400 * ((elevDeg + 6) / 6); // civil twilight ramp
  return 0.5;                                          // night ambient floor
}
```

### Step 3 — cloud multiplier (Kasten & Czeplak 1980)

The classic published relation between cloud fraction `c ∈ [0,1]` and global
irradiance/illuminance relative to clear sky:

```
lux = clearSkyLux(e) · (1 − cloudWeight · 0.75 · c³)
```

Fully overcast (`c = 1`) ≈ 25% of clear-sky light; `cloudWeight` (0..1, default
1) is the operator knob for how much clouds should matter. Cubic on purpose:
thin high clouds barely dim, only solid decks do.

### Step 4 — lux → percent (perceptual mapping + all the knobs)

Human/LED visibility response is not linear in lux, so the mapping is a power
law between two anchor points:

```js
percent = min + (max − min) · clamp((lux − luxMin) / (luxMax − luxMin), 0, 1)^exponent
```

Defaults (Fossvogur, to be calibrated against manual overrides):

| Parameter    | Default   | Meaning                                                        |
|--------------|-----------|----------------------------------------------------------------|
| `min`        | 3         | night floor (matches today's 3%)                               |
| `max`        | 100       | ceiling; auto never exceeds it                                 |
| `exponent`   | 0.35      | **"aggressiveness"**: lower = brighter earlier in the day      |
| `cloudWeight`| 1.0       | 0 ignores clouds entirely, 1 is full Kasten-Czeplak            |
| `luxMin`     | 5         | lux that maps onto `min` (night anchor)                        |
| `luxMax`     | 100000    | lux that maps onto `max` (clear high-sun anchor)               |

### Computed reference table (2026-09-22, Fossvogur)

Produced by the reference implementation (validated against known sun
positions: solstice noons +49.0°/+2.2°, tonight's sunset ≈ 19:35 UTC):

| Time (UTC) | Sun elev | lux clear | lux c=0.5 | lux c=1.0 | % clear | % overcast |
|------------|----------|-----------|-----------|-----------|---------|------------|
| 06:00      | −8.2°    | night     | night     | night     | 3       | 3          |
| 09:00      | +10.9°   | 17,742    | 16,079    | 4,436     | 56      | 36         |
| 12:00      | +24.6°   | 43,721    | 39,622    | 10,930    | 76      | 48         |
| 18:00      | +8.9°    | 14,066    | 12,747    | 3,516     | 52      | 33         |
| 19:30      | −0.8°    | 348       | 315       | 87        | 16      | 11         |
| 21:00      | −10.3°   | night     | night     | night     | 3       | 3          |

Shape sanity: clear noon ≈ 76%, solidly overcast noon ≈ 48%, dusk ≈ 11–16%,
night floor 3%. The dusk ramp (18:00 → 21:00) is the exact part of the day —
no weather needed to get it right.

## Weather integration

Request (poll every 15 min):

```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=64.117&longitude=-21.91
    &current=cloud_cover&hourly=cloud_cover
    &forecast_days=2&timezone=Atlantic%2FReykjavik
```

- `current.cloud_cover` (0–100) is the primary input; the hourly array covers
  interpolation and short outages.
- Cache the last good response. On fetch failure: keep the last value and
  expose its age. After **3 h stale**, fall back to `c = 0.8` (conservative —
  dimming is safer than glaring over Reykjavík on an overcast day) and flag
  `weatherStale: true` in status.
- The daemon never blocks or throws on weather problems: worst case is
  clear-sky-quality prediction, best case is current cloud data.
- License: free for non-commercial use (a sports club qualifies); self-hosting
  Open-Meteo (AGPL) is possible if that ever changes.

## Firebase schema

```jsonc
// states/{location}/perimeter/brightnessAuto   — controller writes, daemon reads
{
  "enabled": false,          // auto mode master switch
  "min": 3, "max": 100,
  "exponent": 0.35,          // aggressiveness
  "cloudWeight": 1.0,
  "luxMin": 5, "luxMax": 100000,
  "updatedAt": "<server timestamp>"
}

// perimeter/{location}/brightnessStatus       — daemon writes (existing path, extended)
{
  "phase": "applied", "requestedPercent": 48, "appliedPercent": 48,
  "mode": "auto",              // "auto" | "manual"
  "predicted": {               // present when mode === "auto"
    "lux": 10930, "sunElevationDeg": 24.6, "cloudCover": 1.0,
    "weatherAgeMin": 7, "weatherStale": false
  },
  "updatedAt": "<server timestamp>"
}

// perimeter/{location}/brightnessCalibration — daemon appends, controller reads
// one entry per applied auto change AND per manual override while auto is on:
// { ts, source: "auto"|"manual", percent, lux, sunElevationDeg, cloudCover }
```

Auto changes are dispatched as ordinary integer commands into the existing
`states/{location}/perimeter/brightness` path, so the worker, status phases,
snapshot/verify/restore, and supersession logic remain untouched.

## Daemon integration points (`brightness.js`)

- New `AutoBrightnessScheduler` (separate module, e.g. `auto-brightness.js`):
  - tick every `AUTO_TICK_MS` (default 60 s);
  - compute `predict(now, lat, lng, cloudCover, cfg)`;
  - **hysteresis**: only enqueue a write when
    `|target − lastApplied| ≥ 2` percentage points;
  - **slew limit**: at most `AUTO_MAX_SLEW` points per write (default 15) and
    at most one auto-initiated write per tick — no visible jumps mid-match;
  - enqueue through the same worker the manual command listener feeds.
- Feature flag `PERIMETER_AUTO_BRIGHTNESS_ENABLED=true` plus
  `PERIMETER_LAT` / `PERIMETER_LNG` (defaults above). Disabled → feature
  inert, publishes a configuration-caused `failed` status if enabled but
  incomplete (same pattern as `_notifyConfigurationIssue`).
- Safety rules:
  - auto output is clamped to `[max(min, 1), min(max, 99)]` — 0 and 100 are
    manual-only (0 stays an explicit off);
  - on any internal error: hold the last applied value, never snap to an
    extreme;
  - a manual command while auto is on **disables auto** (sets `enabled:false`
    in `brightnessAuto`) and applies the manual value — operator intent wins;
  - optional gate: skip auto writes while the perimeter state is `off`
    (avoid pointless hardware writes on a dark screen), and recompute
    immediately on `off → on`.

## Controller UI changes

- Brightness card gains a mode control: `Manual %` / `Automatic`.
- In automatic mode: sliders for `min`/`max`, `aggressiveness` (exponent),
  `cloudWeight`; a live readout of predicted lux + target % + weather age.
- Show the auto target curve for the next 24 h (sun-position part is exact
  math, so the preview is honest; the cloud part is the forecast).

## Calibration loop

Every manual override is logged with the model's predicted context. Fit
offline (spreadsheet is enough):

- `pct = min + (max − min) · (lux/luxMax)^p` is linear in log space:
  `log(pct − min) = p · log(lux) + const` → the slope of a regression on the
  logged pairs is the corrected `exponent`, and the intercept corrects
  `luxMax`. Update the two values in `brightnessAuto`, done.

A few weeks of matches should converge the defaults to house taste with no
further manual changes.

## Limits and unknowns

- Cloud-cover forecast error is the dominant term (hourly model data,
  ±15–30% illuminance at mid-day). The 15-min nowcast mitigates within-match
  drift. This is why `exponent` and `cloudWeight` exist — and why manual
  overrides remain possible at all times.
- The lux→percent curve is a guess until calibration data exists; the initial
  defaults aim for "no worse than what the operator would pick by eye".
- Percent→nits is assumed 1:1 (documented Vnnox behavior while
  `brightnessOverdrive` is off and `ambientLightCompensation` is 0).
  Re-confirmed by the 2026-09-22 probe: `ambientLightCompensation` is 0 at
  both screen EOTF and cabinet level, overdrive/peak override/dynamic booster
  off.
- Exact pitch coordinates unconfirmed (±1 km is irrelevant); venue reachability
  of api.open-meteo.com unverified (needs egress from the venue LAN/Tailscale
  box; the gateway box had external DNS in earlier sessions).

## Rollout

1. **Phase 0 — shadow mode:** compute + publish `predicted` only (no writes)
   during a few matches; compare against the operator's manual values.
   Tune defaults. This needs only the pure module + weather fetcher.
2. **Phase 1 — live auto:** `enabled` flag honored; writes through the
   existing worker with hysteresis + slew + clamps; calibration logging on.
3. **Phase 2 — UI:** Auto/Manual toggle, parameter editors, live readout.
4. **Phase 3 — fit tool:** regression over `brightnessCalibration` logs →
   suggested `exponent`/`luxMax`, one-click apply.

Testing follows the repo's existing pattern (pure-module unit tests for the
model, fixture-based tests for the weather fetcher, and a smoke test like
`BRIGHTNESS_SMOKE_TEST.md` for the write path — auto writes are just commands
into that same path).

## Appendix — reference implementation (JS, for `perimeter-control`)

```js
import SunCalc from "suncalc";

export function sunElevationDeg(date, lat, lng) {
  return (SunCalc.getPosition(date, lat, lng).altitude * 180) / Math.PI;
}

export function clearSkyLux(elevDeg) {
  if (elevDeg >= 0) return 120000 * Math.sin((elevDeg * Math.PI) / 180) ** 1.15;
  if (elevDeg >= -6) return 400 * ((elevDeg + 6) / 6);
  return 0.5;
}

export function applyCloud(lux, cloudFraction, cloudWeight = 1.0) {
  const c = Math.min(Math.max(cloudFraction, 0), 1);
  return Math.max(lux * (1 - cloudWeight * 0.75 * c ** 3), 0.5);
}

export function luxToPercent(lux, cfg) {
  const x = (Math.max(lux, cfg.luxMin) - cfg.luxMin) / (cfg.luxMax - cfg.luxMin);
  const y = Math.min(Math.max(x, 0), 1) ** cfg.exponent;
  return Math.round(cfg.min + (cfg.max - cfg.min) * y);
}

export function predict(date, lat, lng, cloudFraction, cfg) {
  const lux = applyCloud(clearSkyLux(sunElevationDeg(date, lat, lng)), cloudFraction, cfg.cloudWeight);
  return { lux, percent: luxToPercent(lux, cfg) };
}
```

Test vectors (same inputs as the reference table, defaults above):

```
2026-09-22T12:00Z, c=0.0 → lux 43721, percent 76
2026-09-22T12:00Z, c=1.0 → lux 10930, percent 48
2026-09-22T19:30Z, c=0.5 → lux 315,   percent 16
2026-09-22T21:00Z, any   → night,     percent 3 (min clamp)
```
