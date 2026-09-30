const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const APP_URL = "https://klukka.irdn.is";
const source = readFileSync(path.join(__dirname, "../ui/probe.js"), "utf8");

function createProbe(origin, outcomes) {
  const requests = [];
  const reloads = [];
  const timers = new Map();
  let now = 0;
  const context = vm.createContext({
    AbortController,
    URL,
    Date: { now: () => now },
    window: {},
    location: { origin, replace: (url) => reloads.push(url) },
    setTimeout: (callback, delay) => {
      const id = Symbol();
      timers.set(id, { callback, deadline: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) => {
      const outcome = outcomes[requests.length];
      requests.push({ url, ...options });
      assert.notEqual(outcome, undefined, "Unexpected extra probe request");
      if (outcome === "pending") {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          );
        });
      }
      if (outcome === "failure") {
        return Promise.reject(new Error("Network unavailable"));
      }
      return Promise.resolve({});
    },
  });

  const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
  return {
    window: context.window,
    requests,
    reloads,
    timers,
    run: async () => {
      vm.runInContext(source, context);
      await flushPromises();
    },
    advance: async (milliseconds) => {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.deadline <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
      await flushPromises();
    },
  };
}

test("a stalled bootstrap probe times out and permits the next retry", async () => {
  const probe = createProbe("http://tauri.localhost", ["pending", "success"]);
  await probe.run();
  await probe.run();
  assert.equal(probe.requests.length, 1);

  await probe.advance(9999);
  assert.equal(probe.window.__kioskProbePending, true);
  assert.equal(probe.requests[0].signal.aborted, false);

  await probe.advance(1);
  assert.equal(probe.requests[0].signal.aborted, true);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);

  await probe.advance(50000);
  await probe.run();
  assert.equal(probe.requests.length, 2);
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("two stalled checks reload the displayed clock on recovery", async () => {
  const probe = createProbe(APP_URL, ["pending", "pending", "success"]);
  await probe.run();
  await probe.advance(10000);
  assert.equal(probe.window.__kioskFailures, 1);
  assert.deepEqual(probe.reloads, []);

  await probe.advance(50000);
  await probe.run();
  await probe.advance(10000);
  assert.equal(probe.window.__kioskFailures, 2);
  assert.deepEqual(probe.reloads, []);

  await probe.advance(50000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 0);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("one timed-out check does not interrupt the displayed clock", async () => {
  const probe = createProbe(APP_URL, ["pending", "success"]);
  await probe.run();
  await probe.advance(10000);
  assert.equal(probe.window.__kioskFailures, 1);

  await probe.advance(50000);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  assert.equal(probe.window.__kioskFailures, 0);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("healthy checks cancel their deadline without reloading the clock", async () => {
  const probe = createProbe(APP_URL, ["success"]);
  await probe.run();
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);

  await probe.advance(60000);
  assert.equal(probe.requests[0].signal.aborted, false);
  assert.equal(probe.window.__kioskFailures, 0);
  assert.deepEqual(probe.reloads, []);
});

test("rejected checks clear their deadlines and reload after sustained loss", async () => {
  const probe = createProbe(APP_URL, ["failure", "failure", "success"]);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 1);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);

  await probe.advance(60000);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 2);

  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 0);
});

test("the initial clock load navigates immediately when connected", async () => {
  const probe = createProbe("http://tauri.localhost", ["success"]);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("an error document retries after failure and navigates on recovery", async () => {
  const probe = createProbe("null", ["failure", "success"]);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  assert.equal(probe.window.__kioskProbePending, false);

  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.timers.size, 0);
});
