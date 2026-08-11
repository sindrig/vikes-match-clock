import assert from "node:assert/strict";
import test from "node:test";

import {
  PerimeterController,
  ResolumeClient,
  loadConfig,
} from "../index.js";

// -- config ---------------------------------------------------------------

test("loadConfig defaults", () => {
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
  assert.equal(config.resolumeBaseUrl, "http://localhost:80/api/v1");
  assert.equal(config.resolumeColumn, 1);
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.equal(config.listenerRefreshMs, 300_000);
  assert.equal(config.initialBackoffMs, 1_000);
  assert.equal(config.maxBackoffMs, 60_000);
});

test("loadConfig overrides", () => {
  const config = loadConfig({
    PERIMETER_FIREBASE_DATABASE_URL: "https://example.com",
    PERIMETER_FIREBASE_PATH: "states/x/perimeter",
    PERIMETER_SERVICE_ACCOUNT_FILE: "/tmp/sa.json",
    PERIMETER_RESOLUME_BASE_URL: "http://h:80/api/v1",
    PERIMETER_RESOLUME_COLUMN: "2",
    PERIMETER_REQUEST_TIMEOUT: "5",
    PERIMETER_LISTENER_REFRESH_SECONDS: "60",
    PERIMETER_INITIAL_BACKOFF_SECONDS: "0.01",
    PERIMETER_MAX_BACKOFF_SECONDS: "30",
  });
  assert.equal(config.databaseURL, "https://example.com");
  assert.equal(config.path, "states/x/perimeter");
  assert.equal(config.serviceAccountFile, "/tmp/sa.json");
  assert.equal(config.resolumeBaseUrl, "http://h:80/api/v1");
  assert.equal(config.resolumeColumn, 2);
  assert.equal(config.requestTimeoutMs, 5_000);
  assert.equal(config.listenerRefreshMs, 60_000);
  assert.equal(config.initialBackoffMs, 10);
  assert.equal(config.maxBackoffMs, 30_000);
});

test("loadConfig invalid numerics fall back to defaults", () => {
  const config = loadConfig({
    PERIMETER_REQUEST_TIMEOUT: "abc",
    PERIMETER_RESOLUME_COLUMN: "abc",
    PERIMETER_LISTENER_REFRESH_SECONDS: "abc",
  });
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.equal(config.resolumeColumn, 1);
  assert.equal(config.listenerRefreshMs, 300_000);
});

test("loadConfig refresh of 0 disables the refresh", () => {
  const config = loadConfig({ PERIMETER_LISTENER_REFRESH_SECONDS: "0" });
  assert.equal(config.listenerRefreshMs, 0);
});

// -- Resolume client ----------------------------------------------------------

function mockFetch(t, respond) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, method: options?.method });
    const status = typeof respond === "function" ? respond(url) : respond;
    return { ok: status >= 200 && status < 300, status };
  });
  return calls;
}

function makeResolume(overrides = {}) {
  return new ResolumeClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    resolumeColumn: 1,
    requestTimeoutMs: 1_000,
    ...overrides,
  });
}

test("apply on posts column connect", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume().applyState("on");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/columns/1/connect",
  );
  assert.equal(calls[0].method, "POST");
});

test("apply off posts disconnect-all", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume().applyState("off");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/disconnect-all",
  );
});

test("apply strips trailing slash from base url", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume({ resolumeBaseUrl: "http://localhost:80/api/v1/" }).applyState(
    "off",
  );
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/disconnect-all",
  );
});

test("apply raises on non-2xx", async (t) => {
  mockFetch(t, 500);
  await assert.rejects(makeResolume().applyState("on"), /HTTP 500/);
});

test("apply raises on unknown state", async (t) => {
  mockFetch(t, 200);
  await assert.rejects(
    makeResolume().applyState("paused"),
    /unknown perimeter state/,
  );
});

// -- desired state ----------------------------------------------------------------

function makeController(env = {}) {
  const config = loadConfig({
    PERIMETER_INITIAL_BACKOFF_SECONDS: "0.01",
    PERIMETER_MAX_BACKOFF_SECONDS: "0.02",
    ...env,
  });
  return new PerimeterController(config);
}

test("valid state sets desired", () => {
  const controller = makeController();
  controller.onDesiredState("on");
  assert.equal(controller._readDesired(), "on");
});

test("invalid states are ignored", () => {
  const controller = makeController();
  for (const invalid of [null, true, 1, "paused", "ON", "", {}]) {
    controller.onDesiredState(invalid);
  }
  assert.equal(controller._readDesired(), null);
});

test("unchanged state is not reapplied", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  controller.startApplicator();

  controller.onDesiredState("on");
  controller.onDesiredState("on");
  await waitFor(() => applied.length >= 1);
  await sleep(30);
  assert.deepEqual(applied, ["on"]);

  controller.onDesiredState("off");
  await waitFor(() => applied.includes("off"));
  assert.deepEqual(applied, ["on", "off"]);
  controller.shutdown();
});

// -- Firebase listener -------------------------------------------------------------

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
    this.onCalls = 0;
    this.offCalls = 0;
  }

  on(event, callback) {
    this.handlers.set(event, callback);
    this.onCalls += 1;
  }

  off(event, callback) {
    this.handlers.delete(event);
    this.offCalls += 1;
  }

  emit(value) {
    const callback = this.handlers.get("value");
    if (callback) callback(new FakeSnapshot(value));
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

test("attach listens on the configured path", () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  assert.equal(db.refs.length, 1);
  assert.equal(db.refs[0].path, controller.config.path);
  assert.equal(db.refs[0].handlers.has("value"), true);
});

test("reopen re-syncs the listener", () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  const ref = db.refs[0];
  controller._reopenListener();
  assert.equal(ref.offCalls, 1);
  assert.equal(ref.onCalls, 2);
});

test("refresh loop reopens the listener periodically", async () => {
  const controller = makeController({
    PERIMETER_LISTENER_REFRESH_SECONDS: "0.05",
  });
  const db = new FakeDb();
  controller.attach(db);
  controller.startRefreshLoop();
  await waitFor(() => db.refs[0].onCalls >= 2);
  controller.shutdown();
  assert.ok(db.refs[0].offCalls >= 1);
});

test("refresh disabled starts no timer", () => {
  const controller = makeController({ PERIMETER_LISTENER_REFRESH_SECONDS: "0" });
  const db = new FakeDb();
  controller.attach(db);
  controller.startRefreshLoop();
  assert.equal(controller._refreshTimer, null);
  controller.shutdown();
});

test("applies startup state from the initial snapshot", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();
  db.refs[0].emit("on");
  await waitFor(() => applied.length >= 1);
  assert.deepEqual(applied, ["on"]);
  controller.shutdown();
});

test("converges to a state that changed while down", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();

  db.refs[0].emit("off");
  await waitFor(() => applied.includes("off"));

  db.refs[0].emit("on");
  await waitFor(() => applied.includes("on"));
  assert.deepEqual(applied, ["off", "on"]);
  controller.shutdown();
});

test("handles whole-node payloads", () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit({ enabled: true, state: "off" });
  assert.equal(controller._readDesired(), "off");
});

// -- retry and supersede behavior ------------------------------------------------

test("resolume failure retries until success", async () => {
  const controller = makeController();
  const attempts = [];
  let remaining = 2;
  controller.resolume.applyState = async (state) => {
    attempts.push(state);
    if (remaining > 0) {
      remaining -= 1;
      throw new Error("Resolume down");
    }
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => attempts.length >= 3);
  assert.deepEqual(attempts, ["on", "on", "on"]);
  controller.shutdown();
});

test("newer state supersedes failed retry", async () => {
  const controller = makeController();
  const recorded = [];
  controller.resolume.applyState = async (state) => {
    recorded.push(state);
    throw new Error("Resolume down");
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => recorded.length >= 2);
  controller.onDesiredState("off");
  await waitFor(() => recorded.includes("off"));
  await sleep(60);
  assert.equal(recorded[recorded.length - 1], "off");
  controller.shutdown();
});

test("newer state supersedes before applying", async () => {
  const controller = makeController();
  const recorded = [];
  controller.resolume.applyState = async (state) => {
    recorded.push(state);
    throw new Error("Resolume down");
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => recorded.length >= 1);
  controller.onDesiredState("off");
  await waitFor(() => recorded.includes("off"));
  controller.shutdown();
});

// -- shutdown ----------------------------------------------------------------------

test("shutdown detaches the listener and stops the applicator", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();
  controller.shutdown();
  assert.equal(db.refs[0].handlers.has("value"), false);
  await controller._applicatorPromise;
});

// -- helpers --------------------------------------------------------------------------

function waitFor(predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("condition not met within timeout"));
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
