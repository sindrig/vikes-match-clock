// Shared, deterministic scenarios for the current gateway and the preserved
// pre-retirement PERIMETER_RESOLUME_ENABLED=false entry point. Only Firebase,
// weather HTTP and the device transport are doubled; the worker/model are real.
import assert from "node:assert/strict";
import {
  FakeDb,
  configuredEnv,
  fakeDevice,
  settle,
  waitFor,
} from "./gateway.js";

export const SCENARIOS = [
  "manual",
  "pre-write-retry",
  "pending-status-rejected",
  "write-error-restore",
  "verify-mismatch-restore",
  "drain-verify",
  "drain-restore",
  "automatic-weather-calibration",
];

export async function runScenario(entrypoint, scenario) {
  const automatic = scenario === "automatic-weather-calibration";
  const config = entrypoint.loadConfig({
    ...configuredEnv,
    PERIMETER_RESOLUME_ENABLED: "false",
    ...(automatic ? { PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true" } : {}),
  });
  const controller = new entrypoint.PerimeterController(config);
  const db = new FakeDb();
  const worker = controller._brightnessController;
  const device = fakeDevice(worker, {
    writeError: scenario === "write-error-restore",
    mismatch:
      scenario === "verify-mismatch-restore" || scenario === "drain-restore",
  });
  let now = Date.parse("2026-09-22T12:00:00Z");
  let weather;
  if (automatic) {
    const scheduler = controller._autoScheduler;
    weather = scheduler._weather;
    scheduler._clock = () => new Date("2026-09-22T12:00:00Z");
    weather._now = () => now;
    weather._fetch = async () => ({
      ok: true,
      json: async () => ({ current: { cloud_cover: 100 } }),
    });
  }
  controller.attach(db);
  const command = db.refs.get(config.brightnessPath);
  const status = db.refs.get(config.brightnessStatusPath);
  const power = db.refs.get(config.path);
  const calibration = () => db.trace.filter(([op]) => op === "push");
  const writes = () => device.filter(([op]) => op === "write");
  try {
    if (scenario === "pre-write-retry") {
      const read = worker.client.readScreenBrightness;
      let failed = false;
      worker.client.readScreenBrightness = async () => {
        if (!failed) {
          failed = true;
          device.push(["read-error"]);
          throw new Error("fixture snapshot interrupted");
        }
        return read();
      };
    }
    if (scenario === "pending-status-rejected") {
      const set = status.set.bind(status);
      status.set = async (value) => {
        if (value.phase === "pending") {
          db.trace.push(["rejected-set", status.path, value]);
          throw new Error("fixture status permission failure");
        }
        return set(value);
      };
    }
    let release;
    if (scenario.startsWith("drain-")) {
      const write = worker.client.writeBrightness;
      worker.client.writeBrightness = async (percent) => {
        device.push(["write-start", percent]);
        await new Promise((resolve) => {
          release = resolve;
        });
        return write(percent);
      };
    }
    // Match both entry points' startup order. These two old hooks are inert
    // in the baseline's brightness-only mode and absent in the new gateway.
    controller.startApplicator?.();
    controller.startBrightness();
    controller.startRefreshLoop();
    controller.startPreview?.();
    if (automatic) {
      await settle(); // Startup weather poll + status seed.
      power.emit("off");
      const auto = db.refs.get(config.autoBrightnessPath);
      auto.emit({ enabled: true });
      await settle();
      assert.equal(
        writes().length,
        0,
        "power-off gates automatic device writes",
      );
      assert.equal(status.value.phase, "shadow");
      assert.equal(status.value.predicted.percent, 48);
      power.emit({ state: "on" });
      await waitFor(() => status.value?.phase === "applied");
      assert.equal(status.value.appliedPercent, 48);
      assert.equal(calibration().at(-1)[2].source, "auto");
      await controller._autoScheduler.tick();
      await settle();
      assert.equal(
        writes().length,
        1,
        "hysteresis suppresses an unchanged target",
      );
      weather._fetch = async () => ({
        ok: true,
        json: async () => ({ current: { cloud_cover: 0 } }),
      });
      await weather.poll();
      await controller._autoScheduler.tick();
      await waitFor(() => status.value.appliedPercent === 63);
      assert.equal(
        writes().at(-1)[1],
        63,
        "slew limits the change to 15 points",
      );
      power.emit("off");
      now += 3 * 60 * 60_000 + 1;
      weather._fetch = async () => {
        throw new Error("fixture weather offline");
      };
      await weather.poll();
      await controller._autoScheduler.tick();
      assert.equal(status.value.predicted.weatherStale, true);
      assert.equal(status.value.predicted.cloudCover, 0.8);
      assert.equal(writes().length, 2);
      command.emit(27); // Manual is still authoritative while power is off.
      await waitFor(() => status.value.appliedPercent === 27);
      assert.equal(auto.value.enabled, false);
      auto.emit(auto.value); // Firebase's authoritative subscription round trip.
      assert.equal(calibration().at(-1)[2].source, "manual");
    } else {
      for (const value of [null, false, "31", -1, 101, 1.2])
        command.emit(value);
      await settle();
      assert.deepEqual(device, [], "invalid commands stay inert");
      // Newest pending command wins before the worker starts hardware I/O.
      command.emit(20);
      command.emit(31);
      if (scenario.startsWith("drain-")) {
        await waitFor(() => typeof release === "function");
        command.emit(70); // Queued after the irreversible write began.
        let drained = false;
        const drain = controller.shutdown().then(() => {
          drained = true;
        });
        await settle();
        assert.equal(drained, false, "shutdown waits for irreversible I/O");
        release();
        await drain;
        assert.equal(
          writes().length,
          1,
          "shutdown drops the pending next request",
        );
      } else if (scenario === "pending-status-rejected") {
        await waitFor(
          () =>
            db.trace.some(([op]) => op === "rejected-set") &&
            worker._current === null,
        );
      } else {
        await waitFor(() =>
          ["applied", "failed"].includes(status.value?.phase),
        );
      }
      if (scenario === "pending-status-rejected") {
        assert.deepEqual(
          device,
          [],
          "pending status persistence precedes device I/O",
        );
        assert.equal(
          status.value,
          null,
          "the rejected status did not reach Firebase",
        );
      } else if (scenario.includes("restore")) {
        assert.equal(status.value.phase, "failed");
        const restored = device.find(([op]) => op === "restore");
        assert.deepEqual(restored?.[1], {
          percent: 12.5,
          ratio: 1250,
          ratioScale: 10000,
        });
      } else {
        assert.equal(status.value.phase, "applied");
        assert.equal(status.value.appliedPercent, 31);
      }
      assert.equal(
        "mode" in (status.value ?? {}),
        false,
        "manual-only status schema is unchanged",
      );
    }
    const before = structuredClone(device);
    controller._reopenListener();
    await settle();
    assert.deepEqual(
      device,
      before,
      "recovery republishes status without hardware replay",
    );
  } finally {
    await controller.shutdown();
  }
  for (const ref of db.refs.values()) assert.equal(ref.handlers.size, 0);
  assert.equal(controller._refreshTimer, null);
  if (automatic) {
    assert.equal(controller._autoScheduler._timer, null);
    assert.equal(weather._pollTimer, null);
  }
  return { firebase: db.trace, device };
}
