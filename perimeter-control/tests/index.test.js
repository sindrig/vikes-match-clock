import assert from "node:assert/strict";
import test from "node:test";

import { PerimeterController, loadConfig } from "../index.js";
import {
  FakeDb,
  configuredEnv,
  fakeDevice,
  settle,
  waitFor,
} from "./helpers/gateway.js";

function makeController(env = {}) {
  return new PerimeterController(loadConfig(env));
}

test("loadConfig automatic brightness defaults", () => {
  const config = loadConfig({});
  assert.equal(config.autoBrightnessEnabled, false);
  assert.equal(
    config.autoBrightnessPath,
    "states/vikuti/perimeter/brightnessAuto",
  );
  assert.equal(
    config.brightnessCalibrationPath,
    "perimeter/vikuti/brightnessCalibration",
  );
  // Location defaults to the Fossvogur perimeter screen.
  assert.equal(config.autoBrightnessLat, 64.117);
  assert.equal(config.autoBrightnessLng, -21.91);
  assert.equal(config.autoTickMs, 60_000);
  assert.equal(config.autoWeatherPollMs, 900_000);
  assert.equal(config.autoMaxSlew, 15);
  assert.equal(config.autoSkipWhenOff, true);
  assert.equal(config.openMeteoUrl, "https://api.open-meteo.com/v1/forecast");
  assert.equal(config.autoTimezone, "Atlantic/Reykjavik");
});

test("loadConfig automatic brightness overrides", () => {
  const config = loadConfig({
    PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true",
    PERIMETER_AUTO_BRIGHTNESS_PATH: "states/x/perimeter/brightnessAuto",
    PERIMETER_BRIGHTNESS_CALIBRATION_PATH: "perimeter/x/brightnessCalibration",
    PERIMETER_LAT: "64.5",
    PERIMETER_LNG: "-22.5",
    PERIMETER_AUTO_TICK_SECONDS: "30",
    PERIMETER_AUTO_WEATHER_POLL_SECONDS: "60",
    PERIMETER_AUTO_MAX_SLEW: "10",
    PERIMETER_AUTO_SKIP_WHEN_OFF: "false",
    PERIMETER_OPEN_METEO_URL: "https://example.com/v1/forecast",
    PERIMETER_AUTO_TIMEZONE: "UTC",
  });
  assert.equal(config.autoBrightnessEnabled, true);
  assert.equal(config.autoBrightnessPath, "states/x/perimeter/brightnessAuto");
  assert.equal(
    config.brightnessCalibrationPath,
    "perimeter/x/brightnessCalibration",
  );
  assert.equal(config.autoBrightnessLat, 64.5);
  assert.equal(config.autoBrightnessLng, -22.5);
  assert.equal(config.autoTickMs, 30_000);
  assert.equal(config.autoWeatherPollMs, 60_000);
  assert.equal(config.autoMaxSlew, 10);
  assert.equal(config.autoSkipWhenOff, false);
  assert.equal(config.openMeteoUrl, "https://example.com/v1/forecast");
  assert.equal(config.autoTimezone, "UTC");
  // Blank and garbage location values fall back to the defaults instead of
  // silently becoming 0 (Number("") is 0, which would put the screen at the
  // equator).
  const fallback = loadConfig({ PERIMETER_LAT: "", PERIMETER_LNG: "x" });
  assert.equal(fallback.autoBrightnessLat, 64.117);
  assert.equal(fallback.autoBrightnessLng, -21.91);
});

test("automatic brightness wires a scheduler through the brightness controller", () => {
  const controller = makeController({
    PERIMETER_BRIGHTNESS_ENABLED: "true",
    PERIMETER_VNNOX_PERIMETER_GUID: "guid-1",
    PERIMETER_VNNOX_SN: "sn-1",
    PERIMETER_VNNOX_PASSWORD: "secret",
    PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true",
    PERIMETER_AUTO_TICK_SECONDS: "30",
    PERIMETER_AUTO_MAX_SLEW: "10",
    PERIMETER_LAT: "64.5",
  });
  assert.ok(controller._autoScheduler);
  assert.ok(controller._brightnessController._autoScheduler);
  assert.equal(controller._autoScheduler._lat, 64.5);
  assert.equal(controller._autoScheduler._tickMs, 30_000);
  assert.equal(controller._autoScheduler._maxSlew, 10);
  controller.shutdown();
});

test("the auto flag without the brightness worker stays unwired", () => {
  const controller = makeController({
    PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true",
  });
  assert.equal(controller._autoScheduler, null);
  assert.equal(controller._brightnessController, null);
  controller.shutdown();
});

test("loadConfig refresh of 0 disables the refresh", () => {
  const config = loadConfig({ PERIMETER_LISTENER_REFRESH_SECONDS: "0" });
  assert.equal(config.listenerRefreshMs, 0);
});

test("default gateway configuration keeps Firebase identity and brightness opt-ins", () => {
  const config = loadConfig({});
  assert.equal(
    config.databaseURL,
    "https://vikes-match-clock-firebase.firebaseio.com",
  );
  assert.equal(config.path, "states/vikuti/perimeter/state");
  assert.equal(
    config.serviceAccountFile,
    "/etc/perimeter-control/perimeter-service-account.json",
  );
  assert.equal(config.listenerRefreshMs, 300000);
  assert.equal(config.initialBackoffMs, 1000);
  assert.equal(config.maxBackoffMs, 60000);
  assert.equal(config.brightnessEnabled, false);
  assert.equal(config.brightnessPath, "states/vikuti/perimeter/brightness");
  assert.equal(
    config.brightnessStatusPath,
    "perimeter/vikuti/brightnessStatus",
  );
  assert.equal(config.vnnoxBaseUrl, "http://localhost:81");
  assert.equal(config.vnnoxTimeoutMs, 10000);
  assert.equal(config.brightnessMaxRetries, 3);
  assert.equal(config.brightnessVerifyAttempts, 6);
  assert.equal(config.brightnessVerifyTolerance, 1);
  assert.equal(config.brightnessVerifyIntervalMs, 1000);
});

test("retained configuration accepts venue paths, device identity and retry overrides", () => {
  const config = loadConfig({
    ...configuredEnv,
    PERIMETER_FIREBASE_DATABASE_URL: "https://fixture.invalid",
    PERIMETER_FIREBASE_PATH: "states/fixture/perimeter",
    PERIMETER_SERVICE_ACCOUNT_FILE: "/fixture/account.json",
    PERIMETER_LISTENER_REFRESH_SECONDS: "30",
    PERIMETER_BRIGHTNESS_PATH: "states/fixture/perimeter/brightness",
    PERIMETER_BRIGHTNESS_STATUS_PATH: "perimeter/fixture/brightnessStatus",
    PERIMETER_VNNOX_BASE_URL: "http://127.0.0.1:1234",
    PERIMETER_VNNOX_IP: "192.0.2.1",
    PERIMETER_VNNOX_PORT: "5678",
    PERIMETER_VNNOX_PROTOCOL: "https",
    PERIMETER_VNNOX_PROJECT_ID: "fixture-project",
    PERIMETER_VNNOX_USERNAME: "fixture-user",
    PERIMETER_VNNOX_PASSWORD_SOURCE: "file",
    PERIMETER_VNNOX_PASSWORD_FILE: "/fixture/password",
    PERIMETER_VNNOX_TIMEOUT: "4",
    PERIMETER_BRIGHTNESS_MAX_RETRIES: "5",
    PERIMETER_BRIGHTNESS_VERIFY_ATTEMPTS: "10",
    PERIMETER_BRIGHTNESS_VERIFY_TOLERANCE: "2",
  });
  assert.equal(config.databaseURL, "https://fixture.invalid");
  assert.equal(config.path, "states/fixture/perimeter");
  assert.equal(config.serviceAccountFile, "/fixture/account.json");
  assert.equal(config.listenerRefreshMs, 30000);
  assert.equal(config.brightnessPath, "states/fixture/perimeter/brightness");
  assert.equal(
    config.brightnessStatusPath,
    "perimeter/fixture/brightnessStatus",
  );
  assert.equal(config.vnnoxBaseUrl, "http://127.0.0.1:1234");
  assert.equal(config.vnnoxIp, "192.0.2.1");
  assert.equal(config.vnnoxPort, "5678");
  assert.equal(config.vnnoxProtocol, "https");
  assert.equal(config.vnnoxSerial, "fixture-serial");
  assert.equal(config.vnnoxPerimeterGuid, "fixture-perimeter-guid");
  assert.equal(config.vnnoxProjectId, "fixture-project");
  assert.equal(config.vnnoxUsername, "fixture-user");
  assert.equal(config.vnnoxPasswordSource, "file");
  assert.equal(config.vnnoxPasswordFile, "/fixture/password");
  assert.equal(config.vnnoxTimeoutMs, 4000);
  assert.equal(config.initialBackoffMs, 1);
  assert.equal(config.maxBackoffMs, 2);
  assert.equal(config.brightnessMaxRetries, 5);
  assert.equal(config.brightnessVerifyAttempts, 10);
  assert.equal(config.brightnessVerifyTolerance, 2);
  assert.equal(config.brightnessVerifyIntervalMs, 1);
});

test("invalid timing configuration falls back and brightness requires exact true", () => {
  const config = loadConfig({
    PERIMETER_LISTENER_REFRESH_SECONDS: "invalid",
    PERIMETER_INITIAL_BACKOFF_SECONDS: "-1",
    PERIMETER_MAX_BACKOFF_SECONDS: "0",
    PERIMETER_BRIGHTNESS_VERIFY_ATTEMPTS: "1.5",
    PERIMETER_BRIGHTNESS_VERIFY_INTERVAL_SECONDS: "0",
  });
  assert.equal(config.listenerRefreshMs, 300000);
  assert.equal(config.initialBackoffMs, 1000);
  assert.equal(config.maxBackoffMs, 60000);
  assert.equal(config.brightnessVerifyAttempts, 6);
  assert.equal(config.brightnessVerifyIntervalMs, 1000);
  for (const flag of [undefined, "false", "TRUE", "1", ""]) {
    assert.equal(
      loadConfig({ PERIMETER_BRIGHTNESS_ENABLED: flag }).brightnessEnabled,
      false,
    );
  }
});

for (const flag of [undefined, "true", "false", "invalid"]) {
  test(`legacy media settings cannot construct controllers or create refs (flag ${flag})`, async (t) => {
    const network = t.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected network access");
    });
    const env = {
      ...configuredEnv,
      PERIMETER_RESOLUME_ENABLED: flag,
      PERIMETER_RESOLUME_BASE_URL: "http://127.0.0.1:1",
      PERIMETER_OVERLAY_ENABLED: "true",
      PERIMETER_AD_LAYOUT_ENABLED: "true",
      PERIMETER_IMPORT_ENABLED: "true",
      PERIMETER_PREVIEW_ENABLED: "true",
      // Old conflicting lanes must no longer block a brightness gateway.
      PERIMETER_AD_LANE_IDS: "2,4",
      PERIMETER_OVERLAY_LAYER_IDS: "2,4",
      PERIMETER_OVERLAY_CACHE_DIR: "/must-not-be-created",
      PERIMETER_OVERLAY_SSH_KEY: "/must-not-be-read",
    };
    const config = loadConfig(env);
    for (const field of Object.keys(config))
      assert.doesNotMatch(
        field,
        /resolume|preview|thumbnail|overlay|adLayout|adLane|import|clip|deck/i,
      );
    const controller = new PerimeterController(config);
    assert.deepEqual(
      Object.keys(controller).filter((key) =>
        /resolume|preview|overlay|adLayout|import|geometry|applicator/i.test(
          key,
        ),
      ),
      [],
    );
    const db = new FakeDb();
    controller.attach(db);
    controller.onDesiredState("off");
    controller.onDesiredState("on");
    controller.startBrightness();
    await controller.shutdown();
    assert.deepEqual(
      [...db.refs.keys()],
      [config.path, config.brightnessPath, config.brightnessStatusPath],
    );
    assert.equal(network.mock.callCount(), 0);
  });
}

test("disabled brightness listens only to power state and stays inert", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  controller.startBrightness();
  db.refs.get(controller.config.path).emit("on");
  assert.deepEqual([...db.refs.keys()], [controller.config.path]);
  assert.equal(controller._brightnessController, null);
  await controller.shutdown();
  assert.equal(db.refs.get(controller.config.path).handlers.size, 0);
});

test("power snapshots forward valid changes once, including whole-node payloads", async () => {
  const controller = makeController(configuredEnv);
  const changes = [];
  controller._brightnessController.onPerimeterState = (state) =>
    changes.push(state);
  const db = new FakeDb();
  controller.attach(db);
  const ref = db.refs.get(controller.config.path);
  for (const state of [
    null,
    undefined,
    false,
    1,
    "invalid",
    {},
    { state: "off" },
    "off",
    "on",
    "on",
    { state: "off" },
  ])
    ref.emit(state);
  assert.deepEqual(changes, ["off", "on", "off"]);
  await controller.shutdown();
});

test("refresh recovers subscription and republishes brightness status without another device write", async () => {
  const controller = makeController(configuredEnv);
  const db = new FakeDb();
  controller.attach(db);
  const calls = fakeDevice(controller._brightnessController);
  controller.startBrightness();
  db.refs.get(controller.config.brightnessPath).emit(31);
  await waitFor(
    () =>
      db.refs.get(controller.config.brightnessStatusPath).value?.phase ===
      "applied",
  );
  const before = structuredClone(calls);
  const status = structuredClone(
    db.refs.get(controller.config.brightnessStatusPath).value,
  );
  controller._reopenListener();
  await settle();
  assert.deepEqual(
    db.refs.get(controller.config.brightnessStatusPath).value,
    status,
  );
  assert.deepEqual(calls, before);
  assert.deepEqual(
    db.trace.slice(-3).map(([op]) => op),
    ["off", "on", "set"],
  );
  await controller.shutdown();
});

test("periodic recovery survives a listener error and stops on shutdown", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const controller = makeController({
    PERIMETER_LISTENER_REFRESH_SECONDS: "1",
  });
  const db = new FakeDb();
  controller.attach(db);
  const ref = db.refs.get(controller.config.path);
  const original = ref.off.bind(ref);
  let attempts = 0;
  ref.off = (...args) => {
    attempts += 1;
    if (attempts === 1) throw new Error("fixture listener interruption");
    original(...args);
  };
  controller.startRefreshLoop();
  t.mock.timers.tick(2000);
  assert.equal(attempts, 2);
  assert.equal(ref.handlers.size, 1);
  await controller.shutdown();
  t.mock.timers.tick(10000);
  assert.equal(attempts, 3);
  assert.equal(controller._refreshTimer, null);
  assert.equal(ref.handlers.size, 0);
});

test("zero refresh starts no timer; shutdown awaits the actual brightness drain", async () => {
  const controller = makeController({
    ...configuredEnv,
    PERIMETER_LISTENER_REFRESH_SECONDS: "0",
  });
  const db = new FakeDb();
  controller.attach(db);
  controller.startRefreshLoop();
  assert.equal(controller._refreshTimer, null);
  let release;
  controller._brightnessController.shutdown = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  let drained = false;
  const result = controller.shutdown().then(() => {
    drained = true;
  });
  await settle();
  assert.equal(drained, false);
  release();
  await result;
  assert.equal(drained, true);
});
