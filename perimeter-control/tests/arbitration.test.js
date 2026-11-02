import assert from "node:assert/strict";
import test from "node:test";

import { PerimeterController, loadConfig } from "../index.js";
import { FakeDb, configuredEnv, settle, waitFor } from "./helpers/gateway.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Pause one actual transport call. The worker and scheduler are never replaced.
// Cleanup releases every gate before draining, even when an assertion fails.
function holdNext(fixture, object, method) {
  const entered = deferred();
  const release = deferred();
  const original = object[method].bind(object);
  let first = true;
  object[method] = async (...args) => {
    if (first) {
      first = false;
      entered.resolve(args);
      await release.promise;
    }
    return original(...args);
  };
  fixture.releases.push(release.resolve);
  return { entered: entered.promise, release: release.resolve };
}

function fixture(
  t,
  { automatic = false, start = true, holdSeed = false } = {},
) {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected external I/O in arbitration regression");
  });
  const config = loadConfig({
    ...configuredEnv,
    ...(automatic ? { PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true" } : {}),
    PERIMETER_BRIGHTNESS_VERIFY_INTERVAL_SECONDS: "0.001",
  });
  const gateway = new PerimeterController(config);
  const worker = gateway._brightnessController;
  const scheduler = gateway._autoScheduler;
  const db = new FakeDb();
  const status = db.ref(config.brightnessStatusPath);
  status.value = { phase: "applied", appliedPercent: 50 };
  const initial = {
    percent: 12.34,
    ratio: 1234,
    ratioScale: 10000,
    nitType: 0,
    nit: 0,
  };
  let screen = { ...initial };
  const device = [];
  worker.client = {
    async readScreenBrightness() {
      device.push(["read", screen.percent]);
      return { ...screen };
    },
    async readCabinets() {
      device.push(["cabinets"]);
      return [];
    },
    async writeBrightness(percent) {
      device.push(["write", percent]);
      screen = { ...initial, percent, ratio: percent * 100 };
    },
    async restoreBrightness(snapshot) {
      device.push(["restore", snapshot]);
      screen = { ...snapshot };
    },
  };
  if (scheduler) {
    scheduler._clock = () => new Date("2026-09-22T12:00:00Z");
    scheduler._weather = {
      start() {},
      stop() {},
      snapshot: () => ({ cloudCover: 0, ageMs: 0, stale: false }),
    };
  }
  const f = {
    gateway,
    worker,
    scheduler,
    db,
    status,
    initial,
    device,
    releases: [],
    writes: () => device.filter(([op]) => op === "write").map(([, p]) => p),
    restores: () => device.filter(([op]) => op === "restore").map(([, s]) => s),
    calibration: () =>
      db.trace.filter(([op]) => op === "push").map(([, , e]) => e),
  };
  t.after(async () => {
    for (const release of f.releases) release();
    await gateway.shutdown();
    await settle();
    for (const ref of db.refs.values()) assert.equal(ref.handlers.size, 0);
  });
  if (holdSeed) {
    const entered = deferred();
    const release = deferred();
    const get = status.get.bind(status);
    status.get = async () => {
      const snapshot = await get();
      entered.resolve();
      await release.promise;
      return snapshot;
    };
    f.releases.push(release.resolve);
    f.seed = { entered: entered.promise, release: release.resolve };
  }
  gateway.attach(db);
  f.command = db.refs.get(config.brightnessPath);
  f.auto = db.refs.get(config.autoBrightnessPath);
  f.power = db.refs.get(config.path);
  if (start) gateway.startBrightness();
  return f;
}

test(
  "a newer manual command also supersedes a request awaiting pending status",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const pending = holdNext(f, f.status, "set");
    f.command.emit(60);
    await pending.entered;
    f.command.emit(20);
    pending.release();
    await applied(f, 20);
    assert.deepEqual(f.writes(), [20]);
    assert.equal(f.device.filter(([op]) => op === "cabinets").length, 1);
  },
);

async function initializeAuto(f) {
  // Deliver the retained values before issuing new operator intent. Startup
  // ordering itself is exercised separately below.
  f.command.emit(null);
  f.auto.emit({ enabled: false });
  f.power.emit("on");
  await settle();
}

async function applied(f, percent) {
  await waitFor(() => f.status.value?.appliedPercent === percent);
  await settle(); // Include calibration and worker completion, not just status.
}

for (const method of ["readScreenBrightness", "readCabinets"]) {
  test(
    `successful delayed ${method}: old 60% yields to newer manual 20%`,
    { timeout: 3000 },
    async (t) => {
      const f = fixture(t);
      const snapshot = holdNext(f, f.worker.client, method);
      f.command.emit(60);
      await snapshot.entered;
      f.command.emit(20);
      snapshot.release();
      await applied(f, 20);
      assert.deepEqual(f.writes(), [20]);
      assert.deepEqual(f.restores(), []);
      const terminals = f.db.trace.filter(
        ([op, path, value]) =>
          op === "set" && path === f.status.path && value.phase === "applied",
      );
      assert.deepEqual(
        terminals.map(([, , value]) => value.requestedPercent),
        [20],
      );
    },
  );
}

test(
  "suspended auto 65% tick cannot replace pending manual 20% before disable acknowledgment",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true, start: false });
    await initializeAuto(f);
    const publication = holdNext(f, f.status, "set");
    f.auto.emit({ enabled: true });
    const [prediction] = await publication.entered;
    assert.equal(prediction.predicted.percent, 76); // 50 + slew 15 => auto 65.
    f.command.emit(20);
    // FakeRef.update records the write but deliberately emits no subscription
    // echo: arbitration must be synchronous even with a delayed/failed round trip.
    assert.equal(f.auto.value.enabled, false);
    publication.release();
    await settle();
    f.worker.startWorker();
    await waitFor(() => f.status.value?.phase === "applied");
    await settle();
    assert.deepEqual(f.writes(), [20]);
    assert.deepEqual(
      f.calibration().map(({ source, percent }) => [source, percent]),
      [["manual", 20]],
    );
  },
);

test(
  "manual intent wins when prediction publication and the auto-disable update reject",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true, start: false });
    await initializeAuto(f);
    const set = f.status.set.bind(f.status);
    let predictionRejected = false;
    f.status.set = async (value) => {
      if (!predictionRejected) {
        predictionRejected = true;
        throw new Error("fixture prediction publication rejected");
      }
      return set(value);
    };
    const publication = holdNext(f, f.status, "set");
    const disable = deferred();
    f.releases.push(disable.resolve);
    f.auto.update = async () => {
      await disable.promise;
      throw new Error("fixture disable rejected");
    };
    f.auto.emit({ enabled: true });
    await publication.entered;
    f.command.emit(20);
    publication.release();
    await settle();
    // Even a fresh tick must hold while the disable update is unresolved.
    await f.scheduler.tick();
    disable.resolve();
    await settle();
    await f.scheduler.tick();
    f.worker.startWorker();
    await applied(f, 20);
    assert.deepEqual(f.writes(), [20]);
    assert.equal(f.worker.autoConfig.enabled, false);
    assert.equal(predictionRejected, true);
  },
);

test(
  "equal-valued manual intent replaces auto identity and calibration before dispatch",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true });
    await initializeAuto(f);
    const snapshot = holdNext(f, f.worker.client, "readCabinets");
    f.auto.emit({ enabled: true });
    await snapshot.entered;
    f.command.emit(65);
    snapshot.release();
    await applied(f, 65);
    assert.deepEqual(f.writes(), [65]);
    assert.deepEqual(
      f.calibration().map(({ source, percent }) => [source, percent]),
      [["manual", 65]],
    );
  },
);

for (const stage of ["prediction", "snapshot"]) {
  for (const change of ["disable", "config", "disable-enable"]) {
    test(
      `${change} invalidates auto work suspended at ${stage}`,
      { timeout: 3000 },
      async (t) => {
        const f = fixture(t, { automatic: true });
        await initializeAuto(f);
        const gate =
          stage === "prediction"
            ? holdNext(f, f.status, "set")
            : holdNext(f, f.worker.client, "readCabinets");
        f.auto.emit({ enabled: true });
        await gate.entered;
        if (change !== "config") f.auto.emit({ enabled: false });
        if (change !== "disable") f.auto.emit({ enabled: true, exponent: 2 });
        gate.release();
        if (change === "disable") {
          await settle();
          assert.deepEqual(f.writes(), []);
        } else {
          // The unchanged model targets below 35%; the unchanged slew limit
          // moves the seeded 50% down by 15, rather than up to stale auto 65%.
          await applied(f, 35);
          assert.deepEqual(f.writes(), [35]);
          assert.deepEqual(
            f.calibration().map(({ percent }) => percent),
            [35],
          );
        }
      },
    );
  }
}

test(
  "automatic admission cannot displace a manual request even after explicit re-enable",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true });
    await initializeAuto(f);
    const snapshot = holdNext(f, f.worker.client, "readCabinets");
    f.command.emit(20);
    await snapshot.entered;
    f.auto.emit({ enabled: true });
    await settle();
    snapshot.release();
    await applied(f, 20);
    assert.deepEqual(f.writes(), [20]);
    // Explicit re-enable is honored by a fresh tick after manual completion.
    await f.scheduler.tick();
    await applied(f, 35);
    assert.deepEqual(f.writes(), [20, 35]);
  },
);

test(
  "equivalent config echoes and invalid brightness values leave a valid suspended tick intact",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true });
    await initializeAuto(f);
    const publication = holdNext(f, f.status, "set");
    f.auto.emit({ enabled: true });
    await publication.entered;
    f.auto.emit({ enabled: true, updatedAt: 123 });
    for (const value of [null, "20", 20.5, -1, 101]) f.command.emit(value);
    publication.release();
    await applied(f, 65);
    assert.deepEqual(f.writes(), [65]);
    assert.equal(f.auto.value.enabled, true);
    assert.equal(f.calibration().length, 1);
  },
);

test(
  "config refreshes coalesce into one non-overlapping prediction using the latest config",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true });
    await initializeAuto(f);
    let predictions = 0;
    const weather = f.scheduler._weather.snapshot;
    f.scheduler._weather.snapshot = () => {
      predictions += 1;
      return weather();
    };
    const publication = holdNext(f, f.status, "set");
    f.auto.emit({ enabled: true });
    await publication.entered;
    for (const exponent of [0.5, 1, 2])
      f.auto.emit({ enabled: true, exponent });
    assert.equal(predictions, 1, "refreshes cannot overlap the suspended tick");
    publication.release();
    await applied(f, 35);
    assert.equal(
      predictions,
      2,
      "one fresh prediction follows the obsolete one",
    );
    assert.deepEqual(f.writes(), [35]);
  },
);

for (const stop of ["scheduler", "gateway"]) {
  test(
    `${stop} stop invalidates a suspended prediction without dispatch`,
    { timeout: 3000 },
    async (t) => {
      const f = fixture(t, { automatic: true });
      await initializeAuto(f);
      const publication = holdNext(f, f.status, "set");
      f.auto.emit({ enabled: true });
      await publication.entered;
      // Queue a concurrent refresh too: stop must suppress its follow-up tick.
      f.scheduler.refresh();
      if (stop === "scheduler") f.scheduler.stop();
      else await f.gateway.shutdown();
      publication.release();
      await settle();
      await f.scheduler.tick();
      assert.deepEqual(f.writes(), []);
      assert.deepEqual(f.restores(), []);
    },
  );
}

for (const order of ["command-first", "config-first"]) {
  for (const enabled of [false, true]) {
    test(
      `startup ${order}, auto ${enabled}: retained mode decides initial brightness`,
      { timeout: 3000 },
      async (t) => {
        const f = fixture(t, { automatic: true });
        f.power.emit("on");
        if (order === "command-first") f.command.emit(20);
        else f.auto.emit({ enabled });
        await settle();
        assert.deepEqual(f.writes(), [], "wait for both retained snapshots");
        if (order === "command-first") f.auto.emit({ enabled });
        else f.command.emit(20);
        await applied(f, enabled ? 65 : 20);
        assert.deepEqual(f.writes(), [enabled ? 65 : 20]);
        assert.equal(f.auto.value.enabled, enabled);
        assert.equal(
          f.db.trace.some(([op]) => op === "update"),
          false,
        );
      },
    );
  }
}

test(
  "a new manual event before the initial auto config wins over retained enabled state",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true });
    f.power.emit("on");
    f.command.emit(60); // Retained command, awaiting retained config.
    await settle();
    assert.deepEqual(f.writes(), []);
    f.command.emit(20); // Subsequent event is new intent, not retained state.
    await applied(f, 20);
    f.auto.emit({ enabled: true });
    await settle();
    assert.deepEqual(f.writes(), [20]);
    assert.equal(f.worker.autoConfig.enabled, false);
    assert.equal(f.auto.value.enabled, false);
  },
);

test(
  "initial enabled auto waits for its retained applied baseline",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true, holdSeed: true });
    await f.seed.entered;
    f.power.emit("on");
    f.command.emit(20);
    f.auto.emit({ enabled: true });
    await settle();
    assert.deepEqual(f.writes(), []);
    f.seed.release();
    await applied(f, 65);
    assert.deepEqual(f.writes(), [65]);
  },
);

test(
  "a late startup baseline cannot replace a newly verified manual value",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { automatic: true, holdSeed: true });
    await f.seed.entered;
    await initializeAuto(f);
    f.command.emit(20);
    await applied(f, 20);
    f.seed.release();
    await settle();
    f.auto.emit({ enabled: true });
    await applied(f, 35);
    assert.deepEqual(f.writes(), [20, 35]);
  },
);

for (const stop of [false, true]) {
  test(
    `a rejected in-flight snapshot ${stop ? "stops" : "yields to manual intent"} without restore or obsolete failure`,
    { timeout: 3000 },
    async (t) => {
      const f = fixture(t);
      const entered = deferred();
      const response = deferred();
      f.releases.push(response.resolve);
      const read = f.worker.client.readScreenBrightness;
      let first = true;
      f.worker.client.readScreenBrightness = async () => {
        if (first) {
          first = false;
          entered.resolve();
          await response.promise;
        }
        return read();
      };
      f.command.emit(60);
      await entered.promise;
      f.command.emit(20);
      const drain = stop ? f.gateway.shutdown() : null;
      response.reject(new Error("fixture delayed snapshot rejected"));
      if (stop) await drain;
      else await applied(f, 20);
      assert.deepEqual(f.writes(), stop ? [] : [20]);
      assert.deepEqual(f.restores(), []);
      assert.equal(
        f.db.trace.some(
          ([op, path, value]) =>
            op === "set" && path === f.status.path && value.phase === "failed",
        ),
        false,
      );
    },
  );

  test(
    `a successful in-flight snapshot ${stop ? "stops" : "yields"} before dispatch`,
    { timeout: 3000 },
    async (t) => {
      const f = fixture(t);
      const snapshot = holdNext(f, f.worker.client, "readCabinets");
      f.command.emit(60);
      await snapshot.entered;
      if (!stop) f.command.emit(20);
      const drain = stop ? f.gateway.shutdown() : null;
      snapshot.release();
      if (stop) await drain;
      else await applied(f, 20);
      assert.deepEqual(f.writes(), stop ? [] : [20]);
      assert.deepEqual(f.restores(), []);
    },
  );
}

for (const outcome of [
  "verified",
  "write-error",
  "verify-read-error",
  "mismatch",
  "restore-error",
]) {
  for (const stop of [false, true]) {
    test(
      `dispatched auto 65%, ${outcome}: ${stop ? "shutdown drains" : "manual 20% waits"} through verification/restoration`,
      { timeout: 3000 },
      async (t) => {
        const f = fixture(t, { automatic: true });
        await initializeAuto(f);
        const entered = deferred();
        const response = deferred();
        f.releases.push(response.resolve);
        const write = f.worker.client.writeBrightness;
        const read = f.worker.client.readScreenBrightness;
        const restore = f.worker.client.restoreBrightness;
        let first = true;
        let verifyingFirst = false;
        f.worker.client.writeBrightness = async (percent) => {
          await write(percent); // The simulated irreversible device write happened.
          if (first) {
            first = false;
            verifyingFirst = true;
            entered.resolve();
            await response.promise;
            if (outcome === "write-error" || outcome === "restore-error") {
              throw new Error("fixture write response lost after dispatch");
            }
          }
        };
        f.worker.client.readScreenBrightness = async () => {
          if (verifyingFirst && outcome === "verify-read-error") {
            f.device.push(["read-error"]);
            throw new Error("fixture verification read rejected");
          }
          if (verifyingFirst && outcome === "mismatch") {
            f.device.push(["read-mismatch", f.initial.percent]);
            return { ...f.initial };
          }
          return read();
        };
        f.worker.client.restoreBrightness = async (snapshot) => {
          verifyingFirst = false;
          await restore(snapshot);
          if (outcome === "restore-error") {
            throw new Error("fixture restore response lost");
          }
        };
        f.auto.emit({ enabled: true });
        await entered.promise;
        f.command.emit(20);
        f.auto.emit({ enabled: false });
        let drained = false;
        const drain = stop
          ? f.gateway.shutdown().then(() => {
              drained = true;
            })
          : null;
        await settle();
        assert.deepEqual(f.writes(), [65]);
        assert.equal(drained, false);
        response.resolve();
        if (stop) await drain;
        else await applied(f, 20);
        assert.deepEqual(
          f.writes(),
          stop ? [65] : [65, 20],
          "dispatch is never retried",
        );
        assert.deepEqual(
          f.restores(),
          outcome === "verified" ? [] : [f.initial],
        );
        const terminals = f.db.trace.filter(
          ([op, path, value]) =>
            op === "set" &&
            path === f.status.path &&
            ["applied", "failed"].includes(value.phase),
        );
        assert.deepEqual(
          terminals.map(([, , { requestedPercent, phase }]) => [
            requestedPercent,
            phase,
          ]),
          [
            [65, outcome === "verified" ? "applied" : "failed"],
            ...(stop ? [] : [[20, "applied"]]),
          ],
        );
        if (outcome === "verified") {
          assert.ok(
            f.device.some(([op, percent]) => op === "read" && percent === 65),
          );
          assert.equal(f.calibration()[0].source, "auto");
        } else {
          assert.equal(
            f.calibration().some(({ source }) => source === "auto"),
            false,
          );
          assert.match(
            terminals[0][2].error,
            outcome === "restore-error"
              ? /snapshot restore failed/
              : /prior snapshot restored/,
          );
          if (outcome === "mismatch") {
            assert.equal(
              f.device.filter(([op]) => op === "read-mismatch").length,
              2,
            );
          }
          if (!stop) {
            const restoreIndex = f.device.findIndex(([op]) => op === "restore");
            const manualIndex = f.device.findIndex(
              ([op, p]) => op === "write" && p === 20,
            );
            assert.ok(
              restoreIndex < manualIndex,
              "restoration precedes the next request",
            );
          }
        }
      },
    );
  }
}

test(
  "shutdown also drains an already-running restoration before publishing failure",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const restore = holdNext(f, f.worker.client, "restoreBrightness");
    const write = f.worker.client.writeBrightness;
    f.worker.client.writeBrightness = async (percent) => {
      await write(percent);
      throw new Error("fixture response lost");
    };
    f.command.emit(60);
    const [snapshot] = await restore.entered;
    assert.deepEqual(snapshot, f.initial);
    f.command.emit(20);
    let drained = false;
    const drain = f.gateway.shutdown().then(() => {
      drained = true;
    });
    await settle();
    assert.equal(drained, false);
    assert.equal(f.status.value.phase, "pending");
    restore.release();
    await drain;
    assert.deepEqual(f.writes(), [60]);
    assert.deepEqual(f.restores(), [f.initial]);
    assert.equal(f.status.value.phase, "failed");
    assert.match(f.status.value.error, /prior snapshot restored/);
  },
);
