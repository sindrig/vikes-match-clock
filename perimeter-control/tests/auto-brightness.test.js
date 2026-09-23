import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_HYSTERESIS_POINTS,
  AUTO_MAX_SLEW,
  AutoBrightnessScheduler,
  DEFAULT_AUTO_CONFIG,
  buildOpenMeteoUrl,
  calibrationEntry,
  clampAutoPercent,
  clearSkyLux,
  applyCloud,
  luxToPercent,
  nextAutoWrite,
  normalizeAutoConfig,
  predict,
  sunElevationDeg,
  validateAutoBrightnessConfig,
} from "../auto-brightness.js";

const LAT = 64.117;
const LNG = -21.91;

// -- sun elevation ------------------------------------------------------------

test("sun elevation matches validated reference positions", () => {
  // Solstice noons and the design doc's 2026-09-22 reference table values,
  // validated against suncalc 1.9.0 for Fossvogur.
  const at = (iso) => sunElevationDeg(new Date(iso), LAT, LNG);
  assert.equal(Math.round(at("2026-06-21T13:00:00Z") * 10) / 10, 49.0);
  assert.equal(Math.round(at("2026-09-22T12:00:00Z") * 10) / 10, 24.6);
  assert.equal(Math.round(at("2026-09-22T19:30:00Z") * 10) / 10, -0.8);
  assert.equal(Math.round(at("2026-09-22T21:00:00Z") * 10) / 10, -10.3);
});

// -- clear-sky illuminance ------------------------------------------------------

test("clearSkyLux covers high sun, civil twilight, and the night floor", () => {
  // The validated clear-sky value at the reference table's noon elevation
  // (24.5643…°, printed as 24.6 in the rounded table).
  const noonElev = sunElevationDeg(new Date("2026-09-22T12:00:00Z"), LAT, LNG);
  assert.equal(Math.round(clearSkyLux(noonElev)), 43721);
  // Linear civil-twilight ramp: elev -3 -> 400 * (3/6) = 200 lux.
  assert.equal(clearSkyLux(-3), 200);
  assert.equal(clearSkyLux(0), 0);
  assert.equal(clearSkyLux(-6), 0);
  assert.equal(clearSkyLux(-6.5), 0.5);
  assert.equal(clearSkyLux(-10.3), 0.5);
});

// -- cloud multiplier -----------------------------------------------------------

test("applyCloud follows the Kasten-Czeplak cubic with weight and clamps", () => {
  const clear = 10930;
  // Fully overcast ≈ 25% of clear-sky light.
  const overcast = applyCloud(clear, 1);
  assert.ok(Math.abs(overcast - clear * 0.25) < 1e-9);
  // cloudWeight 0 ignores clouds entirely; oversized weights clamp.
  assert.equal(applyCloud(clear, 1, 0), clear);
  assert.equal(applyCloud(clear, 1, 5), clear * 0.25);
  // A cloud fraction outside [0,1] clamps.
  assert.equal(applyCloud(clear, 1.5), applyCloud(clear, 1));
  assert.equal(applyCloud(clear, -1), clear);
  // The lux output never drops below the night ambient floor.
  assert.equal(applyCloud(0, 1), 0.5);
});

// -- lux→percent mapping ---------------------------------------------------------

test("luxToPercent anchors the power law at luxMin and luxMax", () => {
  const cfg = { ...DEFAULT_AUTO_CONFIG };
  assert.equal(luxToPercent(cfg.luxMin, cfg), cfg.min);
  assert.equal(luxToPercent(cfg.luxMax, cfg), cfg.max);
  assert.equal(luxToPercent(cfg.luxMax * 10, cfg), cfg.max);
  assert.equal(luxToPercent(0, cfg), cfg.min);
  // Monotonic between the anchors; the validated clear-noon anchor is 76%.
  const mid = luxToPercent(43721, cfg);
  assert.ok(mid > luxToPercent(10930, cfg));
  assert.ok(mid < cfg.max);
  assert.equal(luxToPercent(43721, cfg), 76);
});

// -- full prediction -------------------------------------------------------------

test("predict reproduces the design doc's validated test vectors", () => {
  const cfg = { ...DEFAULT_AUTO_CONFIG };
  const noon = predict(new Date("2026-09-22T12:00:00Z"), LAT, LNG, 0.0, cfg);
  assert.equal(Math.round(noon.lux), 43721);
  assert.equal(noon.percent, 76);

  const overcast = predict(new Date("2026-09-22T12:00:00Z"), LAT, LNG, 1.0, cfg);
  assert.equal(Math.round(overcast.lux), 10930);
  assert.equal(overcast.percent, 48);

  const dusk = predict(new Date("2026-09-22T19:30:00Z"), LAT, LNG, 0.5, cfg);
  assert.equal(Math.round(dusk.lux), 315);
  assert.equal(dusk.percent, 16);

  const night = predict(new Date("2026-09-22T21:00:00Z"), LAT, LNG, 1.0, cfg);
  assert.equal(night.percent, cfg.min);
});

// -- auto output clamping ---------------------------------------------------------

test("clampAutoPercent keeps auto output out of the manual-only extremes", () => {
  const cfg = { ...DEFAULT_AUTO_CONFIG };
  assert.equal(clampAutoPercent(0, cfg), Math.max(cfg.min, 1));
  assert.equal(clampAutoPercent(100, cfg), 99);
  assert.equal(clampAutoPercent(-5, cfg), Math.max(cfg.min, 1));
  assert.equal(clampAutoPercent(150, cfg), 99);
  assert.equal(clampAutoPercent(50.4, cfg), 50);
  // A lowered max clamps to the configured max.
  assert.equal(clampAutoPercent(100, { ...cfg, max: 40 }), 40);
  // A zero min still floors at 1.
  assert.equal(clampAutoPercent(0, { ...cfg, min: 0 }), 1);
});

// -- hysteresis + slew write policy ------------------------------------------------

test("nextAutoWrite applies hysteresis and slew limits", () => {
  const cfg = { ...DEFAULT_AUTO_CONFIG };
  // No baseline: the clamped target goes out directly.
  assert.deepEqual(nextAutoWrite(76, null, cfg), { write: true, percent: 76 });
  // Within the hysteresis band: inert.
  assert.equal(
    nextAutoWrite(50, 49, cfg, { hysteresis: AUTO_HYSTERESIS_POINTS }).write,
    false,
  );
  assert.equal(
    nextAutoWrite(49, 50, cfg, { hysteresis: AUTO_HYSTERESIS_POINTS }).write,
    false,
  );
  // Beyond it: a full step when inside the slew cap.
  assert.deepEqual(nextAutoWrite(60, 50, cfg), { write: true, percent: 60 });
  // Slew-capped steps toward the target.
  assert.deepEqual(nextAutoWrite(80, 50, cfg, { maxSlew: AUTO_MAX_SLEW }), {
    write: true,
    percent: 65,
  });
  assert.deepEqual(nextAutoWrite(10, 50, cfg, { maxSlew: AUTO_MAX_SLEW }), {
    write: true,
    percent: 35,
  });
  // Targets outside the auto range clamp first (0 -> 3 here).
  assert.deepEqual(nextAutoWrite(0, 30, cfg), { write: true, percent: 15 });
  assert.equal(nextAutoWrite(0, 3, cfg).write, false);
});

// -- config normalization ----------------------------------------------------------

test("normalizeAutoConfig falls back to defaults per field", () => {
  // Absent/malformed documents are inert auto with default parameters.
  assert.deepEqual(normalizeAutoConfig(null), {
    enabled: false,
    ...DEFAULT_AUTO_CONFIG,
  });
  assert.deepEqual(normalizeAutoConfig("garbage"), {
    enabled: false,
    ...DEFAULT_AUTO_CONFIG,
  });
  // Auto is on only for an exact boolean true.
  assert.equal(normalizeAutoConfig({ enabled: true }).enabled, true);
  assert.equal(normalizeAutoConfig({ enabled: 1 }).enabled, false);
  assert.equal(normalizeAutoConfig({}).enabled, false);
  // Invalid numerics fall back per field.
  assert.equal(normalizeAutoConfig({ exponent: 99 }).exponent, 2);
  assert.equal(
    normalizeAutoConfig({ cloudWeight: "heavy" }).cloudWeight,
    DEFAULT_AUTO_CONFIG.cloudWeight,
  );
  // An inverted min/max pair resets both to the defaults.
  const inverted = normalizeAutoConfig({ min: 80, max: 20 });
  assert.equal(inverted.min, DEFAULT_AUTO_CONFIG.min);
  assert.equal(inverted.max, DEFAULT_AUTO_CONFIG.max);
  // A valid pair passes through.
  const valid = normalizeAutoConfig({ min: 10, max: 90 });
  assert.equal(valid.min, 10);
  assert.equal(valid.max, 90);
});

test("validateAutoBrightnessConfig reports location problems", () => {
  assert.equal(
    validateAutoBrightnessConfig({
      autoBrightnessLat: LAT,
      autoBrightnessLng: LNG,
    }),
    null,
  );
  assert.match(
    validateAutoBrightnessConfig({
      autoBrightnessLat: undefined,
      autoBrightnessLng: LNG,
    }),
    /PERIMETER_LAT/,
  );
  assert.match(
    validateAutoBrightnessConfig({
      autoBrightnessLat: LAT,
      autoBrightnessLng: "x",
    }),
    /PERIMETER_LNG/,
  );
});

// -- Open-Meteo URL + calibration entries -------------------------------------------

test("buildOpenMeteoUrl matches the documented request", () => {
  const url = buildOpenMeteoUrl(
    "https://api.open-meteo.com/v1/forecast",
    64.117,
    -21.91,
  );
  assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
  assert.match(url, /latitude=64\.117/);
  assert.match(url, /longitude=-21\.91/);
  assert.match(url, /current=cloud_cover/);
  assert.match(url, /hourly=cloud_cover/);
  assert.match(url, /forecast_days=2/);
  assert.match(url, /timezone=Atlantic%2FReykjavik/);
});

test("calibrationEntry captures the predicted context", () => {
  const context = { lux: 10929.6, sunElevationDeg: 24.56, cloudCover: 1.0 };
  const auto = calibrationEntry("auto", 48, context, 123);
  assert.deepEqual(auto, {
    ts: 123,
    source: "auto",
    percent: 48,
    lux: 10930,
    sunElevationDeg: 24.6,
    cloudCover: 1.0,
  });
  // Without context (never predicted) the entry omits the lux fields.
  assert.deepEqual(calibrationEntry("manual", 50, null, 456), {
    ts: 456,
    source: "manual",
    percent: 50,
  });
});

// -- AutoBrightnessScheduler -------------------------------------------------------

class FakeWeather {
  constructor(snapshot, options = {}) {
    this._snapshot = snapshot;
    this._options = options;
    this.started = false;
    this.stopped = false;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  snapshot() {
    if (this._options.throwOnSnapshot) {
      throw new Error("weather exploded");
    }
    return this._snapshot;
  }
}

class FakeAutoController {
  constructor(config) {
    this._config = config;
    this.predictions = [];
    this.autoRequests = [];
    this._state = "on";
  }
  get autoConfig() {
    return this._config;
  }
  get lastAppliedPercent() {
    return 50;
  }
  get perimeterState() {
    return this._state;
  }
  async publishPrediction(prediction) {
    this.predictions.push(prediction);
  }
  requestAuto(percent, prediction) {
    this.autoRequests.push({ percent, prediction });
    return true;
  }
}

// A scheduler over a fake controller; defaults clock to clear-sky noon.
function makeScheduler({ enabled = false, state = "on", skipWhenOff = true } = {}, weather) {
  const controller = new FakeAutoController({
    enabled,
    ...DEFAULT_AUTO_CONFIG,
  });
  const scheduler = new AutoBrightnessScheduler({
    controller,
    weather,
    lat: LAT,
    lng: LNG,
    maxSlew: AUTO_MAX_SLEW,
    skipWhenOff,
    clock: () => new Date("2026-09-22T12:00:00Z"),
  });
  controller._state = state;
  return { controller, scheduler };
}

test("scheduler tick publishes the predicted readout without writes in shadow mode", async () => {
  const weather = new FakeWeather({
    cloudCover: 1.0,
    ageMs: 7 * 60_000,
    stale: false,
  });
  const { controller, scheduler } = makeScheduler({ enabled: false }, weather);
  await scheduler.tick();
  assert.equal(controller.predictions.length, 1);
  const block = controller.predictions[0];
  assert.equal(block.lux, 10930);
  assert.equal(block.percent, 48);
  assert.equal(block.sunElevationDeg, 24.6);
  assert.equal(block.cloudCover, 1.0);
  assert.equal(block.weatherAgeMin, 7);
  assert.equal(block.weatherStale, false);
  // Shadow mode: predictions published, no writes.
  assert.deepEqual(controller.autoRequests, []);
});

test("enabled auto enqueues one hysteresis/slew-bounded write per tick", async () => {
  const weather = new FakeWeather({ cloudCover: 0.0, ageMs: 60_000, stale: false });
  // lastAppliedPercent is 50; clear noon targets 76 (delta 16 > slew 15).
  const { controller, scheduler } = makeScheduler({ enabled: true }, weather);
  await scheduler.tick();
  assert.equal(controller.autoRequests.length, 1);
  assert.deepEqual(controller.autoRequests[0], {
    percent: 65,
    prediction: controller.predictions[0],
  });
});

test("auto writes are skipped while the perimeter state is off", async () => {
  const weather = new FakeWeather({ cloudCover: 0.0, ageMs: 60_000, stale: false });
  const { controller, scheduler } = makeScheduler(
    { enabled: true, state: "off" },
    weather,
  );
  await scheduler.tick();
  assert.equal(controller.predictions.length, 1);
  assert.deepEqual(controller.autoRequests, []);
});

test("skipWhenOff=false allows auto writes while the perimeter is off", async () => {
  const weather = new FakeWeather({ cloudCover: 0.0, ageMs: 60_000, stale: false });
  const { controller, scheduler } = makeScheduler(
    { enabled: true, state: "off", skipWhenOff: false },
    weather,
  );
  await scheduler.tick();
  assert.equal(controller.autoRequests.length, 1);
});

test("stale weather flags the prediction and omits the age", async () => {
  const weather = new FakeWeather({ cloudCover: 0.8, ageMs: null, stale: true });
  const { controller, scheduler } = makeScheduler({ enabled: false }, weather);
  await scheduler.tick();
  const block = controller.predictions[0];
  assert.equal(block.weatherStale, true);
  assert.equal("weatherAgeMin" in block, false);
  assert.equal(block.cloudCover, 0.8);
});

test("a weather failure is contained and holds the last applied value", async () => {
  const weather = new FakeWeather(null, { throwOnSnapshot: true });
  const { controller, scheduler } = makeScheduler({ enabled: true }, weather);
  // The tick must swallow the error and enqueue nothing.
  await scheduler.tick();
  assert.deepEqual(controller.autoRequests, []);
});

test("start/stop drive the weather loop and stop halts ticks", async () => {
  const weather = new FakeWeather({ cloudCover: 0.5, ageMs: 0, stale: false });
  const { controller, scheduler } = makeScheduler({ enabled: false }, weather);
  scheduler.start();
  assert.equal(weather.started, true);
  scheduler.stop();
  assert.equal(weather.stopped, true);
  // A stopped scheduler never runs another tick.
  await scheduler.tick();
  assert.equal(controller.predictions.length, 0);
});
