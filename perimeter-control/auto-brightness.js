/**
 * Automatic perimeter brightness — sun + weather prediction model.
 *
 * Pure, offline-computable model per `docs/auto-brightness-design.md`
 * (in the vikin-gateway repository). The daemon ticks the scheduler below
 * every AUTO_TICK_MS and predicts the right perimeter brightness percentage
 * from:
 *
 *   1. the sun's altitude at the screen's location (exact, offline math via
 *      SunCalc — Iceland is UTC year-round so there are no DST edge cases,
 *      and a ±1 km location error is < 0.01° of elevation), and
 *   2. cloud cover at that location (Open-Meteo forecast, polled separately
 *      in `weather.js`).
 *
 * Pipeline: sun elevation → clear-sky illuminance (piecewise lux curve) →
 * Kasten & Czeplak cloud multiplier → power-law lux→percent mapping between
 * two anchors with min/max/exponent knobs. The reference test vectors and
 * the 2026-09-22 Fossvogur table in the design doc were validated against
 * SunCalc 1.9.0's radian-based altitude API, so this module pins that exact
 * version — the 2.x line changed the API (named exports, degree altitude)
 * and would silently shift the validated dusk values by a fraction of a
 * degree of refraction.
 *
 * Prediction is the only software route: the live probe on 2026-09-22 found
 * no light sensor attached and no lux reading in the API (see
 * `captures/vnnox-sensor-probe-2026-09-22.md`). If an NS060 sensor is ever
 * fitted, its lux value would replace the predicted one in the same curve.
 *
 * All functions are pure; only the AutoBrightnessScheduler touches timers
 * and Firebase.
 */

import SunCalc from "suncalc";

// Defaults for Fossvogur, to be calibrated against manual overrides (see the
// design doc's calibration loop). `exponent` is the "aggressiveness": lower
// is brighter earlier in the day. `min`/`max` bound the output; auto output
// is additionally clamped to [max(min, 1), min(max, 99)] so 0 and 100 stay
// manual-only (0 remains an explicit off).
export const DEFAULT_AUTO_CONFIG = Object.freeze({
  min: 3,
  max: 100,
  exponent: 0.35,
  cloudWeight: 1.0,
  luxMin: 5,
  luxMax: 100000,
});

// Hysteresis: only enqueue an auto write when the target differs from the
// last applied value by at least this many percentage points.
export const AUTO_HYSTERESIS_POINTS = 2;

// Slew limit: an auto write moves at most this many points from the last
// applied value (one auto-initiated write per scheduler tick), so the screen
// never visibly jumps mid-match.
export const AUTO_MAX_SLEW = 15;

// The sun's altitude above the horizon in degrees.
export function sunElevationDeg(date, lat, lng) {
  return (SunCalc.getPosition(date, lat, lng).altitude * 180) / Math.PI;
}

// Clear-sky illuminance (lux) from the sun's elevation, tuned to typical
// clear-sky daylight values (~100,000 lux at high sun; civil twilight ≈ tens
// of lux; a small night ambient floor below).
export function clearSkyLux(elevDeg) {
  if (elevDeg >= 0) return 120000 * Math.sin((elevDeg * Math.PI) / 180) ** 1.15;
  if (elevDeg >= -6) return 400 * ((elevDeg + 6) / 6); // civil twilight ramp
  return 0.5; // night ambient floor
}

// Kasten & Czeplak (1980): the relation between cloud fraction c ∈ [0,1] and
// illuminance relative to clear sky. Fully overcast (c = 1) ≈ 25% of
// clear-sky light. `cloudWeight` (0..1) is the operator knob for how much
// clouds should matter; the cubic shape means thin high clouds barely dim,
// only solid decks do.
export function applyCloud(lux, cloudFraction, cloudWeight = 1.0) {
  const c = Math.min(Math.max(cloudFraction, 0), 1);
  const weight = Math.min(Math.max(cloudWeight, 0), 1);
  return Math.max(lux * (1 - weight * 0.75 * c ** 3), 0.5);
}

// Power-law lux→percent mapping between two anchor points (luxMin maps to
// min, luxMax maps to max). Lower `exponent` is brighter earlier in the day.
export function luxToPercent(lux, cfg) {
  const x = (Math.max(lux, cfg.luxMin) - cfg.luxMin) / (cfg.luxMax - cfg.luxMin);
  const y = Math.min(Math.max(x, 0), 1) ** cfg.exponent;
  return Math.round(cfg.min + (cfg.max - cfg.min) * y);
}

// Full prediction for one instant: percent target plus the model context
// published to `perimeter/{location}/brightnessStatus.predicted`.
export function predict(date, lat, lng, cloudFraction, cfg) {
  const elevation = sunElevationDeg(date, lat, lng);
  const lux = applyCloud(
    clearSkyLux(elevation),
    cloudFraction,
    cfg.cloudWeight,
  );
  return {
    lux,
    percent: luxToPercent(lux, cfg),
    sunElevationDeg: elevation,
  };
}

// Clamp an auto-computed target into the auto-safe range: manual-only
// extremes 0 and 100 are excluded (0 stays an explicit off; 99 is the auto
// ceiling so a stuck prediction can never blast full brightness).
export function clampAutoPercent(percent, cfg) {
  const lo = Math.max(Math.round(cfg.min), 1);
  const hi = Math.min(Math.round(cfg.max), 99);
  return Math.min(hi, Math.max(lo, Math.round(percent)));
}

// The auto-initiated write decision for one tick. Hysteresis suppresses
// writes within AUTO_HYSTERESIS_POINTS of the last applied value; the slew
// limit bounds each write to `maxSlew` points toward the target. The first
// decision with no known last applied value writes the clamped target
// directly (it is already inside the safe range).
export function nextAutoWrite(
  targetPercent,
  lastAppliedPercent,
  cfg,
  { maxSlew = AUTO_MAX_SLEW, hysteresis = AUTO_HYSTERESIS_POINTS } = {},
) {
  const target = clampAutoPercent(targetPercent, cfg);
  if (
    typeof lastAppliedPercent !== "number" ||
    !Number.isFinite(lastAppliedPercent)
  ) {
    return { write: true, percent: target };
  }
  const delta = target - lastAppliedPercent;
  if (Math.abs(delta) < hysteresis) {
    return { write: false, percent: null };
  }
  const percent =
    lastAppliedPercent + Math.sign(delta) * Math.min(Math.abs(delta), maxSlew);
  return { write: true, percent };
}

function boundedNumber(value, lo, hi, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}

// Normalize a `states/{location}/perimeter/brightnessAuto` document into a
// complete configuration. Auto is off unless `enabled` is exactly true.
// Field values outside their sane range fall back to the documented
// defaults (never reject the whole document — an operator typo must not
// brick the auto mode), except that an inverted min/max or luxMin/luxMax
// pair resets both fields to their defaults so the mapping stays ordered.
export function normalizeAutoConfig(raw) {
  const defaults = { ...DEFAULT_AUTO_CONFIG };
  if (raw === null || typeof raw !== "object") {
    return { enabled: false, ...DEFAULT_AUTO_CONFIG };
  }
  const enabled = raw.enabled === true;
  let min = boundedNumber(raw.min, 0, 99, DEFAULT_AUTO_CONFIG.min);
  let max = boundedNumber(raw.max, 1, 100, DEFAULT_AUTO_CONFIG.max);
  if (min > max) {
    min = DEFAULT_AUTO_CONFIG.min;
    max = DEFAULT_AUTO_CONFIG.max;
  }
  let luxMin = boundedNumber(raw.luxMin, 0, 1e6, DEFAULT_AUTO_CONFIG.luxMin);
  let luxMax = boundedNumber(raw.luxMax, 10, 1e7, DEFAULT_AUTO_CONFIG.luxMax);
  if (luxMin >= luxMax) {
    luxMin = DEFAULT_AUTO_CONFIG.luxMin;
    luxMax = DEFAULT_AUTO_CONFIG.luxMax;
  }
  return {
    enabled,
    min,
    max,
    exponent: boundedNumber(
      raw.exponent,
      0.05,
      2,
      DEFAULT_AUTO_CONFIG.exponent,
    ),
    cloudWeight: boundedNumber(
      raw.cloudWeight,
      0,
      1,
      DEFAULT_AUTO_CONFIG.cloudWeight,
    ),
    luxMin,
    luxMax,
  };
}

// The daemon-side auto feature needs the screen's location. Returns a human
// error string or null when the configuration is complete.
export function validateAutoBrightnessConfig(config) {
  if (!Number.isFinite(config.autoBrightnessLat)) {
    return "PERIMETER_LAT is not a valid number";
  }
  if (!Number.isFinite(config.autoBrightnessLng)) {
    return "PERIMETER_LNG is not a valid number";
  }
  return null;
}

// Build the Open-Meteo forecast request URL (matches the design doc's
// request: current + hourly cloud cover, 2 forecast days, Reykjavík time).
export function buildOpenMeteoUrl(
  baseUrl,
  lat,
  lng,
  timezone = "Atlantic/Reykjavik",
) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "cloud_cover",
    hourly: "cloud_cover",
    forecast_days: "2",
    timezone,
  });
  return `${baseUrl}?${params.toString()}`;
}

// One entry per applied auto change and per manual override while auto is
// on, appended to `perimeter/{location}/brightnessCalibration`. Offline
// regression on these pairs fits the corrected `exponent`/`luxMax`.
export function calibrationEntry(source, percent, prediction, ts) {
  const entry = {
    ts,
    source,
    percent,
  };
  if (prediction) {
    entry.lux = Math.round(prediction.lux);
    entry.sunElevationDeg = Math.round(prediction.sunElevationDeg * 10) / 10;
    entry.cloudCover = prediction.cloudCover;
  }
  return entry;
}

// -- AutoBrightnessScheduler ---------------------------------------------------

// The daemon-side scheduler: ticks every `tickMs`, computes the prediction
// for the current instant, publishes it to the brightness status (shadow
// mode — no writes while `brightnessAuto.enabled` is false), and enqueues at
// most one hysteresis/slew-bounded write per tick into the serialized
// brightness worker when auto is enabled. Never throws: any internal error
// holds the last applied value instead of snapping to an extreme.
export class AutoBrightnessScheduler {
  constructor({
    controller,
    weather,
    lat,
    lng,
    tickMs = 60_000,
    maxSlew = AUTO_MAX_SLEW,
    skipWhenOff = true,
    clock = () => new Date(),
  }) {
    this._controller = controller;
    this._weather = weather;
    this._lat = lat;
    this._lng = lng;
    this._tickMs = tickMs;
    this._maxSlew = maxSlew;
    this._skipWhenOff = skipWhenOff;
    this._clock = clock;
    this._timer = null;
    this._stopping = false;
    this._ticking = false;
  }

  // Starts the weather polling loop and the tick timer. Safe to call once.
  start() {
    if (this._timer) return;
    this._weather.start();
    this._timer = setInterval(() => void this.tick(), this._tickMs);
  }

  stop() {
    this._stopping = true;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._weather.stop();
  }

  // Immediate recompute (used when the perimeter turns on and when the
  // operator enables auto). Serialized with the interval tick so ticks can
  // never overlap; a skipped concurrent tick waits for the next one.
  refresh() {
    void this.tick();
  }

  async tick() {
    if (this._stopping || this._ticking) return;
    this._ticking = true;
    try {
      await this._runTick();
    } catch (err) {
      // Weather/model/scheduling problems must never take the worker down:
      // hold the last applied value and keep the sky tracked next tick.
      console.error(
        `Auto brightness tick failed (holding last applied value): ${err.message}`,
      );
    } finally {
      this._ticking = false;
    }
  }

  async _runTick() {
    const cfg = this._controller.autoConfig;
    const weather = this._weather.snapshot();
    const prediction = predict(
      this._clock(),
      this._lat,
      this._lng,
      weather.cloudCover,
      cfg,
    );
    const predictionBlock = {
      lux: Math.round(prediction.lux),
      percent: prediction.percent,
      sunElevationDeg: Math.round(prediction.sunElevationDeg * 10) / 10,
      cloudCover: weather.cloudCover,
      weatherStale: weather.stale,
      ...(weather.ageMs !== null
        ? { weatherAgeMin: Math.round(weather.ageMs / 60_000) }
        : {}),
    };
    await this._controller.publishPrediction(predictionBlock);

    if (!cfg.enabled) return; // shadow mode: predict + publish only
    if (this._skipWhenOff && this._controller.perimeterState !== "on") {
      return;
    }
    const next = nextAutoWrite(
      prediction.percent,
      this._controller.lastAppliedPercent,
      cfg,
      { maxSlew: this._maxSlew },
    );
    if (next.write) {
      this._controller.requestAuto(next.percent, predictionBlock);
    }
  }
}
