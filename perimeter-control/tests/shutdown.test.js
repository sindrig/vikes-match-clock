import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { settle } from "./helpers/gateway.js";

// Execute the actual bootstrap body with process/Firebase/controller doubles.
// No process signals, credentials, sockets or real 30-second waits are needed.
const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
const main = source.slice(
  source.indexOf("function main() {"),
  source.indexOf("\nif (\n"),
);
assert.ok(main.startsWith("function main() {"));

function bootstrap(drain, config = {}) {
  const events = [];
  const handlers = new Map();
  const timers = [];
  const logs = [];
  vm.runInNewContext(`${main}\nmain();`, {
    SHUTDOWN_GRACE_MS: 30000,
    loadConfig: () => ({
      serviceAccountFile: "/synthetic/account.json",
      ...config,
    }),
    fs: { existsSync: () => true },
    cert: () => "synthetic-credential",
    initializeApp: () => "synthetic-app",
    getDatabase: () => "synthetic-db",
    PerimeterController: class {
      attach(db) {
        events.push(["attach", db]);
      }
      startBrightness() {
        events.push(["brightness"]);
      }
      startRefreshLoop() {
        events.push(["refresh"]);
      }
      shutdown() {
        events.push(["drain"]);
        return drain();
      }
    },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    console: {
      log: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
    process: {
      on: (signal, callback) => handlers.set(signal, callback),
      exit: (code) => events.push(["exit", code]),
    },
  });
  return { events, handlers, timers, logs };
}

test("bootstrap starts only brightness and listener recovery; repeat signals share one drain", async () => {
  let release;
  const runtime = bootstrap(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  assert.deepEqual(runtime.events, [
    ["attach", "synthetic-db"],
    ["brightness"],
    ["refresh"],
  ]);
  runtime.handlers.get("SIGTERM")();
  runtime.handlers.get("SIGINT")();
  runtime.handlers.get("SIGTERM")();
  await settle();
  assert.equal(runtime.events.filter(([op]) => op === "drain").length, 1);
  assert.equal(
    runtime.events.some(([op]) => op === "exit"),
    false,
  );
  assert.equal(runtime.timers.length, 1);
  assert.equal(runtime.timers[0].delay, 30000);
  release();
  await settle();
  assert.deepEqual(runtime.events.at(-1), ["exit", 0]);
});

test("bootstrap forces a bounded exit when a worker never drains", async () => {
  const runtime = bootstrap(() => new Promise(() => {}));
  runtime.handlers.get("SIGINT")();
  await settle();
  assert.equal(
    runtime.events.some(([op]) => op === "exit"),
    false,
  );
  assert.equal(runtime.timers[0].delay, 30000);
  runtime.timers[0].callback();
  await settle();
  assert.deepEqual(runtime.events.at(-1), ["exit", 0]);
});

test("bootstrap handles drain rejection and warns about auto without a worker", async () => {
  const runtime = bootstrap(
    () => Promise.reject(new Error("fixture drain failure")),
    { autoBrightnessEnabled: true, brightnessEnabled: false },
  );
  runtime.handlers.get("SIGTERM")();
  await settle();
  assert.ok(
    runtime.logs.some(([line]) =>
      line.includes("automatic brightness stays inert"),
    ),
  );
  assert.ok(
    runtime.logs.some(([line]) =>
      line.includes("Error during shutdown: fixture drain failure"),
    ),
  );
  assert.deepEqual(runtime.events.at(-1), ["exit", 0]);
});
