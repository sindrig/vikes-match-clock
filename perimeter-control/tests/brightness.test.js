import assert from "node:assert/strict";
import test from "node:test";

import { ServerValue } from "firebase-admin/database";

import { BrightnessController } from "../brightness.js";

const LOCATION = "vikuti";

class FakeSnapshot {
  constructor(value) {
    this._value = value;
  }
  val() {
    return this._value;
  }
}

class FakeRef {
  constructor(path) {
    this.path = path;
    this.handlers = new Map();
    this.setCalls = [];
    this.updateCalls = [];
    this.pushCalls = [];
    this.getValue = null;
  }
  on(event, callback) {
    this.handlers.set(event, callback);
  }
  off(event) {
    this.handlers.delete(event);
  }
  emit(value) {
    const callback = this.handlers.get("value");
    if (callback) callback(new FakeSnapshot(value));
  }
  set(value) {
    this.setCalls.push(value);
    return Promise.resolve();
  }
  update(value) {
    this.updateCalls.push(value);
    return Promise.resolve();
  }
  push(value) {
    this.pushCalls.push(value);
    return Promise.resolve();
  }
  get() {
    return Promise.resolve(new FakeSnapshot(this.getValue));
  }
}

class FakeDb {
  constructor() {
    this.refs = [];
  }
  ref(path) {
    const ref = new FakeRef(path);
    this.refs.push(ref);
    return ref;
  }
}

function makeConfig(overrides = {}) {
  return {
    brightnessEnabled: true,
    brightnessPath: `states/${LOCATION}/perimeter/brightness`,
    brightnessStatusPath: `perimeter/${LOCATION}/brightnessStatus`,
    vnnoxBaseUrl: "http://localhost:81",
    vnnoxIp: "10.182.45.40",
    vnnoxPort: "8088",
    vnnoxProtocol: "http",
    vnnoxSerial: "26126A000018457",
    vnnoxProjectId: "defaultProject-vx",
    vnnoxPerimeterGuid: "75f3072e-4940-4682-a91c-44edf697b1ca",
    vnnoxUsername: "admin",
    vnnoxPasswordSource: "env",
    vnnoxPassword: "123456",
    vnnoxPasswordFile: null,
    vnnoxTimeoutMs: 500,
    initialBackoffMs: 5,
    maxBackoffMs: 10,
    brightnessMaxRetries: 2,
    brightnessVerifyAttempts: 3,
    brightnessVerifyTolerance: 1,
    brightnessVerifyIntervalMs: 5,
    ...overrides,
  };
}

function makeController(config = makeConfig()) {
  const controller = new BrightnessController(config);
  const db = new FakeDb();
  controller.attach(db);
  return { controller, refs: db.refs };
}

// Config for the automatic brightness feature (sun + weather prediction).
function makeAutoConfig(overrides = {}) {
  return makeConfig({
    autoBrightnessEnabled: true,
    autoBrightnessPath: `states/${LOCATION}/perimeter/brightnessAuto`,
    brightnessCalibrationPath: `perimeter/${LOCATION}/brightnessCalibration`,
    autoBrightnessLat: 64.117,
    autoBrightnessLng: -21.91,
    ...overrides,
  });
}

// Override the client with a scripted double. `screenReads` is a queue of
// percentages for readScreenBrightness (first read is the snapshot, later ones
// are verification polls); the last value repeats.
function instrument(controller, options = {}) {
  const calls = { writes: [], restores: [], screenReads: [] };
  let successfulReads = 0;
  controller.client.readCabinets = async () => [];
  controller.client.readScreenBrightness = async () => {
    const readErr =
      typeof options.screenReadError === "function"
        ? options.screenReadError(calls.screenReads.length)
        : options.screenReadError;
    if (readErr) {
      calls.screenReads.push(null);
      throw readErr;
    }
    const queue = Array.isArray(options.screenReads)
      ? options.screenReads
      : [options.screenRead ?? 4.5];
    const idx = Math.min(successfulReads, queue.length - 1);
    successfulReads += 1;
    const percent = queue[idx];
    calls.screenReads.push(percent);
    return {
      percent,
      ratio: (percent * 10000) / 100,
      ratioScale: 10000,
      nitType: 0,
      nit: 0,
    };
  };
  controller.client.writeBrightness = async (percent) => {
    calls.writes.push(percent);
    const err =
      typeof options.writeError === "function"
        ? options.writeError()
        : options.writeError;
    if (err) throw err;
  };
  controller.client.restoreBrightness = async (snapshot) => {
    calls.restores.push(snapshot);
    if (options.restoreError) throw options.restoreError;
  };
  return calls;
}

async function waitFor(cond, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("waitFor timed out");
}

const statusRef = (refs) => {
  const status = refs.find(
    (r) => r.path === `perimeter/${LOCATION}/brightnessStatus`,
  );
  assert.ok(status, "brightnessStatus ref attached");
  return status;
};

const commandRef = (refs) => {
  const command = refs.find(
    (r) => r.path === `states/${LOCATION}/perimeter/brightness`,
  );
  assert.ok(command, "brightness command ref attached");
  return command;
};

const autoRef = (refs) => {
  const ref = refs.find(
    (r) => r.path === `states/${LOCATION}/perimeter/brightnessAuto`,
  );
  assert.ok(ref, "brightnessAuto ref attached");
  return ref;
};

const calibrationRef = (refs) => {
  const ref = refs.find(
    (r) => r.path === `perimeter/${LOCATION}/brightnessCalibration`,
  );
  assert.ok(ref, "brightnessCalibration ref attached");
  return ref;
};

// -- attach paths ------------------------------------------------------------

test("BrightnessController attaches to command and status paths", () => {
  const { refs } = makeController();
  assert.ok(commandRef(refs).handlers.has("value"));
  assert.ok(statusRef(refs));
});

// -- successful verified application -----------------------------------------

test("applies a valid command and publishes pending then applied", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  await waitFor(() => calls.writes.length >= 1);

  const phases = statusRef(refs).setCalls.map((s) => s.phase);
  assert.deepEqual(phases, ["pending", "applied"]);

  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal(applied.requestedPercent, 50);
  assert.equal(applied.appliedPercent, 50);
  assert.equal(applied.error, null);
  // Firebase server timestamp sentinel on every status write.
  assert.deepEqual(applied.updatedAt, ServerValue.TIMESTAMP);
  assert.deepEqual(
    statusRef(refs).setCalls[0].updatedAt,
    ServerValue.TIMESTAMP,
  );

  // Exactly one scoped write, no restore.
  assert.deepEqual(calls.writes, [50]);
  assert.deepEqual(calls.restores, []);
  // Snapshot read plus one (or more) verification reads.
  assert.ok(calls.screenReads.length >= 2);
});

test("applies boundary values 0 and 100 without rounding surprises", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 0] });
  controller.startWorker();
  commandRef(refs).emit(0);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  assert.deepEqual(calls.writes, [0]);
  assert.equal(
    statusRef(refs).setCalls.find((s) => s.phase === "applied").appliedPercent,
    0,
  );
});

// -- invalid command rejection -----------------------------------------------

test("rejects a non-integer command without any hardware I/O", async () => {
  const { controller, refs } = makeController();
  const calls = instrument(controller);
  controller.startWorker();
  commandRef(refs).emit(4.5);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(calls.restores, []);
  assert.deepEqual(statusRef(refs).setCalls, []);
});

test("rejects an out-of-range command without any hardware I/O", async () => {
  const { controller, refs } = makeController();
  const calls = instrument(controller);
  controller.startWorker();
  for (const value of [101, -1, "50", null]) {
    commandRef(refs).emit(value);
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(statusRef(refs).setCalls, []);
});

// -- configuration failure ----------------------------------------------------

test("fails with a configuration cause and never touches hardware", async (t) => {
  const { controller, refs } = makeController(
    makeConfig({ vnnoxPerimeterGuid: null }),
  );
  const calls = instrument(controller);
  controller.startWorker();
  // The enabled-but-unconfigured feature publishes a config failure on attach.
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "failed"),
  );
  commandRef(refs).emit(30);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.requestedPercent === 30),
  );
  const failures = statusRef(refs).setCalls.filter((s) => s.phase === "failed");
  assert.ok(failures.every((f) => f.error.includes("not configured")));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(calls.restores, []);
});

test("a disabled brightness feature stays inert", async (t) => {
  const { controller, refs } = makeController(
    makeConfig({ brightnessEnabled: false }),
  );
  const calls = instrument(controller);
  controller.startWorker();
  commandRef(refs).emit(50);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(statusRef(refs).setCalls, []);
});

// -- transient retry (snapshot stage only) ------------------------------------

test("retries a transient snapshot-stage failure with backoff, then applies", async (t) => {
  let failures = 0;
  const readError = new Error("connection reset");
  const { controller, refs } = makeController();
  const calls = instrument(controller, {
    screenReads: [4.5, 50],
    screenReadError: () => {
      failures += 1;
      return failures === 1 ? readError : null;
    },
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  // The snapshot read was retried once (failed, then succeeded); the write
  // itself is dispatched exactly once since it never entered the retry loop.
  assert.deepEqual(calls.writes, [50]);
  assert.equal(
    statusRef(refs).setCalls.find((s) => s.phase === "applied").appliedPercent,
    50,
  );
  assert.deepEqual(calls.restores, []);
});

test("fails after bounded snapshot retries without ever dispatching a write", async (t) => {
  const { controller, refs } = makeController({
    ...makeConfig(),
    brightnessMaxRetries: 1,
  });
  const calls = instrument(controller, {
    screenReadError: new Error("always down"),
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "failed"),
  );
  // maxRetries 1 => 2 snapshot attempts total, no write dispatched, no
  // restore needed (there is nothing to restore without a snapshot).
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(calls.restores, []);
  const failed = statusRef(refs).setCalls.find((s) => s.phase === "failed");
  assert.match(failed.error, /Brightness snapshot failed/);
});

// -- write-response failure (irreversible, not retried) -----------------------

test("a write-response failure restores the pre-write snapshot without retrying", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, {
    // Only the snapshot read ever succeeds; a write-call failure must not
    // loop back into a second snapshot/write attempt.
    screenReads: [4.5],
    writeError: new Error("socket hang up"),
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "failed"),
  );
  // Exactly one write attempt — an ambiguous write-call failure is never
  // retried, only restored.
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.restores.length, 1);
  assert.equal(calls.restores[0].ratio, 450);
  assert.equal(calls.restores[0].ratioScale, 10000);
  const failed = statusRef(refs).setCalls.find((s) => s.phase === "failed");
  assert.match(failed.error, /Brightness 50% failed/);
  assert.match(failed.error, /snapshot restored/);
});

// -- supersession ------------------------------------------------------------

test("a newer command supersedes an older request during a snapshot retry", async (t) => {
  let firstFailure = true;
  const { controller, refs } = makeController(
    makeConfig({ initialBackoffMs: 100, maxBackoffMs: 200 }),
  );
  const calls = instrument(controller, {
    screenReads: [4.5, 70],
    screenReadError: () => {
      if (firstFailure) {
        firstFailure = false;
        return new Error("transient");
      }
      return null;
    },
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() => calls.screenReads.length >= 1);
  // While the worker sleeps in backoff after the failed snapshot read, a
  // newer command arrives and must supersede 50 before any write happens.
  commandRef(refs).emit(70);
  await waitFor(() => calls.writes.includes(70));
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );

  assert.deepEqual(calls.writes, [70]);
  // 50 was superseded before any write started — no restore.
  assert.deepEqual(calls.restores, []);
  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal(applied.requestedPercent, 70);
});

test("a newer command does not supersede an irreversible verification", async (t) => {
  const { controller, refs } = makeController(
    makeConfig({ brightnessVerifyIntervalMs: 10 }),
  );
  const calls = instrument(controller, {
    // Snapshot then a verification that starts non-matching before settling.
    screenReads: [4.5, 40, 50, 50],
    brightnessVerifyAttempts: 3,
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() => calls.writes.length >= 1);
  // A command arrives while verification is polling — it must NOT cut off the
  // old read/write; the old request still verifies and reports applied.
  commandRef(refs).emit(70);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal(applied.requestedPercent, 50);
  // The newer 70 is then processed to completion.
  await waitFor(() => calls.writes.includes(70));
  assert.deepEqual(calls.writes, [50, 70]);
  assert.deepEqual(calls.restores, []);
});

// -- verification mismatch and restoration -----------------------------------

test("restores the snapshot after a verification mismatch and fails", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, {
    // Snapshot at 4.5%, but the screen never changes to 50%.
    screenReads: [4.5, 4.5, 4.5, 4.5],
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "failed"),
  );

  assert.deepEqual(calls.writes, [50]);
  assert.equal(calls.restores.length, 1);
  assert.equal(calls.restores[0].ratio, 450);
  assert.equal(calls.restores[0].ratioScale, 10000);
  const failed = statusRef(refs).setCalls.find((s) => s.phase === "failed");
  assert.match(failed.error, /verification mismatch/);
  assert.match(failed.error, /snapshot restored/);
});

test("reports a restore failure but still publishes a failed status", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, {
    screenReads: [4.5, 4.5],
    restoreError: new Error("Vnnox unreachable for restore"),
  });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "failed"),
  );

  assert.equal(calls.restores.length, 1);
  const failed = statusRef(refs).setCalls.find((s) => s.phase === "failed");
  assert.match(failed.error, /restore failed/);
  assert.match(failed.error, /Vnnox unreachable for restore/);
});

// -- status publication and lifecycle ----------------------------------------

test("publishes a pending status before any hardware I/O", async (t) => {
  let releaseWrite;
  const gate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const { controller, refs } = makeController();
  const calls = instrument(controller, {
    screenReads: [4.5, 50],
    writeError: null,
  });
  controller.client.writeBrightness = async (percent) => {
    calls.writes.push(percent);
    await gate;
  };
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() => statusRef(refs).setCalls.length >= 1);
  assert.equal(statusRef(refs).setCalls[0].phase, "pending");
  assert.equal(statusRef(refs).setCalls[0].requestedPercent, 50);
  assert.equal(statusRef(refs).setCalls[0].error, null);
  if (releaseWrite) releaseWrite();
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
});

test("aborts a command before hardware I/O when the pending status cannot be persisted", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  const status = statusRef(refs);
  status.set = async () => {
    throw new Error("Firebase unavailable");
  };
  controller.startWorker();
  commandRef(refs).emit(50);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(calls.restores, []);
  assert.equal(calls.screenReads.length, 0);
});

test("republishStatus re-publishes the last status", async (t) => {
  const { controller, refs } = makeController();
  instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  await controller.republishStatus();
  const st = statusRef(refs);
  const last = st.setCalls[st.setCalls.length - 1];
  assert.equal(last.phase, "applied");
  assert.deepEqual(last.updatedAt, ServerValue.TIMESTAMP);
});

test("shutdown stops further processing", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  controller.shutdown();
  commandRef(refs).emit(50);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
});

test("shutdown returns a promise that resolves once the worker drains", async (t) => {
  const { controller } = makeController();
  instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  const result = controller.shutdown();
  assert.ok(
    result && typeof result.then === "function",
    "shutdown() returns the worker's promise",
  );
  await result;
});

test("shutdown lets an in-flight write finish verifying/restoring before draining", async (t) => {
  let releaseWrite;
  const gate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.client.writeBrightness = async (percent) => {
    calls.writes.push(percent);
    await gate;
  };
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() => calls.writes.length >= 1);
  // Shutdown is requested mid-write — the in-flight command must still reach
  // a terminal (applied/failed) status rather than being abandoned.
  const shutdownPromise = controller.shutdown();
  releaseWrite();
  await shutdownPromise;
  assert.ok(statusRef(refs).setCalls.some((s) => s.phase === "applied"));
});

// -- automatic brightness (sun + weather prediction) ---------------------------

test("automatic refs attach only when the auto feature is enabled", () => {
  const enabled = makeController(makeAutoConfig());
  assert.ok(autoRef(enabled.refs).handlers.has("value"));
  assert.ok(calibrationRef(enabled.refs));

  const disabled = makeController();
  assert.equal(
    disabled.refs.some(
      (r) => r.path === `states/${LOCATION}/perimeter/brightnessAuto`,
    ),
    false,
  );
  assert.equal(
    disabled.refs.some(
      (r) => r.path === `perimeter/${LOCATION}/brightnessCalibration`,
    ),
    false,
  );
});

test("the hysteresis baseline seeds from the published status", async () => {
  const { controller, refs } = makeController(makeAutoConfig());
  statusRef(refs).getValue = { appliedPercent: 42, phase: "applied" };
  await controller._seedLastApplied();
  assert.equal(controller.lastAppliedPercent, 42);
});

test("requestAuto dispatches through the worker with auto mode and calibration", async (t) => {
  const { controller, refs } = makeController(makeAutoConfig());
  const calls = instrument(controller, { screenReads: [4.5, 65] });
  controller.startWorker();
  await controller.publishPrediction({
    lux: 43721,
    percent: 76,
    sunElevationDeg: 24.6,
    cloudCover: 0,
    weatherStale: false,
  });
  const accepted = controller.requestAuto(65, {
    lux: 43721,
    percent: 76,
    sunElevationDeg: 24.6,
    cloudCover: 0,
    weatherStale: false,
  });
  assert.equal(accepted, true);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  // Same worker path as manual commands: one scoped write, no restore.
  assert.deepEqual(calls.writes, [65]);
  assert.deepEqual(calls.restores, []);

  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal(applied.requestedPercent, 65);
  assert.equal(applied.appliedPercent, 65);
  assert.equal(applied.mode, "auto");
  assert.deepEqual(applied.predicted, {
    lux: 43721,
    percent: 76,
    sunElevationDeg: 24.6,
    cloudCover: 0,
    weatherStale: false,
  });

  // One calibration entry for the applied auto change.
  const pushes = calibrationRef(refs).pushCalls;
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].source, "auto");
  assert.equal(pushes[0].percent, 65);
  assert.equal(pushes[0].lux, 43721);
  assert.deepEqual(pushes[0].ts, ServerValue.TIMESTAMP);
  assert.equal(controller.lastAppliedPercent, 65);
});

test("an invalid auto request is rejected without any worker activity", async () => {
  const { controller, refs } = makeController(makeAutoConfig());
  const calls = instrument(controller);
  controller.startWorker();
  assert.equal(controller.requestAuto(4.5, null), false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(statusRef(refs).setCalls, []);
});

test("publishPrediction writes a shadow document before any worker status", async () => {
  const { controller, refs } = makeController(makeAutoConfig());
  instrument(controller);
  const prediction = {
    lux: 10930,
    percent: 48,
    sunElevationDeg: 24.6,
    cloudCover: 1,
    weatherAgeMin: 3,
    weatherStale: false,
  };
  await controller.publishPrediction(prediction);
  const st = statusRef(refs);
  assert.deepEqual(st.setCalls[0], {
    phase: "shadow",
    requestedPercent: null,
    error: null,
    mode: "auto",
    predicted: prediction,
    updatedAt: ServerValue.TIMESTAMP,
  });
  // The cached status survives a listener-refresh republish.
  await controller.republishStatus();
  const last = st.setCalls[st.setCalls.length - 1];
  assert.equal(last.phase, "shadow");
  assert.deepEqual(last.predicted, prediction);
});

test("legacy (auto off) statuses carry no mode or predicted blocks", async (t) => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal("mode" in applied, false);
  assert.equal("predicted" in applied, false);
});

test("auto-off status payloads are byte-identical to the pre-auto schema", async (t) => {
  // A deployed daemon without the auto feature must produce exactly the same
  // status documents as before (old controllers must keep parsing them).
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  assert.deepEqual(statusRef(refs).setCalls, [
    {
      requestedPercent: 50,
      phase: "pending",
      error: null,
      updatedAt: ServerValue.TIMESTAMP,
    },
    {
      requestedPercent: 50,
      phase: "applied",
      appliedPercent: 50,
      error: null,
      updatedAt: ServerValue.TIMESTAMP,
    },
  ]);
  // And the worker path is untouched: one write, no restore.
  assert.deepEqual(calls.writes, [50]);
  assert.deepEqual(calls.restores, []);
});

test("auto-off publishPrediction stays inert (no scheduler exists)", async () => {
  const { controller, refs } = makeController();
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  // Nothing in the daemon calls this without the auto feature, but a stray
  // call must not publish a prediction-only or shadow document either.
  await controller.publishPrediction({
    lux: 10930,
    percent: 48,
    sunElevationDeg: 24.6,
    cloudCover: 1,
    weatherAgeMin: 3,
    weatherStale: false,
  });
  const st = statusRef(refs);
  const last = st.setCalls[st.setCalls.length - 1];
  assert.equal(last.phase, "applied");
  assert.equal("predicted" in last, false);
  assert.equal("mode" in last, false);
});

test("a manual command while auto is enabled disables auto and logs the override", async (t) => {
  const { controller, refs } = makeController(makeAutoConfig());
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  // A prediction must exist so the override is logged with model context.
  await controller.publishPrediction({
    lux: 10930,
    percent: 48,
    sunElevationDeg: 24.6,
    cloudCover: 1,
    weatherAgeMin: 3,
    weatherStale: false,
  });
  // Auto is on in Firebase.
  autoRef(refs).emit({ enabled: true, min: 3, max: 100 });
  assert.equal(controller.autoConfig.enabled, true);

  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  // The daemon disabled auto in Firebase (operator intent wins).
  assert.deepEqual(autoRef(refs).updateCalls, [
    { enabled: false, updatedAt: ServerValue.TIMESTAMP },
  ]);
  assert.deepEqual(calls.writes, [50]);

  // The applied manual override is logged for the calibration loop.
  const pushes = calibrationRef(refs).pushCalls;
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].source, "manual");
  assert.equal(pushes[0].percent, 50);
  assert.equal(pushes[0].lux, 10930);
  assert.deepEqual(pushes[0].ts, ServerValue.TIMESTAMP);
});

test("a manual command with auto disabled logs no calibration entry", async () => {
  const { controller, refs } = makeController(makeAutoConfig());
  const calls = instrument(controller, { screenReads: [4.5, 50] });
  controller.startWorker();
  await controller.publishPrediction({
    lux: 10930,
    percent: 48,
    sunElevationDeg: 24.6,
    cloudCover: 1,
    weatherAgeMin: 3,
    weatherStale: false,
  });
  // Auto stays off in Firebase.
  autoRef(refs).emit({ enabled: false });
  commandRef(refs).emit(50);
  await waitFor(() =>
    statusRef(refs).setCalls.some((s) => s.phase === "applied"),
  );
  assert.deepEqual(calls.writes, [50]);
  assert.deepEqual(calibrationRef(refs).pushCalls, []);
});

test("a superseded auto write never reaches the calibration log", async (t) => {
  const { controller, refs } = makeController(
    makeAutoConfig({ initialBackoffMs: 50, maxBackoffMs: 100 }),
  );
  let firstFailure = true;
  const calls = instrument(controller, {
    screenReads: [4.5, 30],
    screenReadError: () => {
      if (firstFailure) {
        firstFailure = false;
        return new Error("transient");
      }
      return null;
    },
  });
  controller.startWorker();
  controller.requestAuto(65, {
    lux: 43721,
    percent: 76,
    sunElevationDeg: 24.6,
    cloudCover: 0,
    weatherStale: false,
  });
  await waitFor(() => calls.screenReads.length >= 1);
  // A manual command supersedes the auto request before the write dispatch.
  commandRef(refs).emit(30);
  await waitFor(() => calls.writes.includes(30));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const pushes = calibrationRef(refs).pushCalls;
  assert.equal(pushes.length, 0);
  const applied = statusRef(refs).setCalls.find((s) => s.phase === "applied");
  assert.equal(applied.requestedPercent, 30);
});

test("onPerimeterState recomputes immediately on off -> on", () => {
  const { controller } = makeController(makeAutoConfig());
  let refreshes = 0;
  controller.attachAutoScheduler({
    refresh: () => {
      refreshes += 1;
    },
    stop: () => {},
  });
  controller.onPerimeterState("off");
  assert.equal(refreshes, 0);
  controller.onPerimeterState("on");
  assert.equal(refreshes, 1);
  controller.onPerimeterState("on");
  assert.equal(refreshes, 1);
});

test("shutdown stops the attached scheduler", () => {
  const { controller } = makeController(makeAutoConfig());
  let stopped = false;
  controller.attachAutoScheduler({
    refresh: () => {},
    stop: () => {
      stopped = true;
    },
  });
  controller.shutdown();
  assert.equal(stopped, true);
});

test("auto config failures publish a configuration-caused failed status", async () => {
  const { controller, refs } = makeController(
    makeAutoConfig({ autoBrightnessLat: undefined }),
  );
  controller.startWorker();
  await waitFor(() =>
    statusRef(refs).setCalls.some(
      (s) => s.phase === "failed" && s.error.includes("Auto brightness not configured"),
    ),
  );
});
