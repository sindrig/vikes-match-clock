const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const APP_URL = "https://klukka.irdn.is";
const RECOVERY_KEY = "vikes.kiosk.recoveryAfter";
const source = readFileSync(path.join(__dirname, "../ui/probe.js"), "utf8");

function createSession() {
  return { now: 0, origins: new Map() };
}

function createProbe(
  origin,
  outcomes,
  {
    appDocument = origin === APP_URL,
    session = createSession(),
    storageFailure,
  } = {},
) {
  const requests = [];
  const reloads = [];
  const timers = new Map();
  if (!session.origins.has(origin)) session.origins.set(origin, new Map());
  const stored = session.origins.get(origin);
  const storage = {
    getItem: (key) => {
      if (storageFailure === "read") throw new Error("Storage denied");
      return stored.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (storageFailure === "write") throw new Error("Storage full");
      stored.set(key, value);
    },
  };
  const window = {};
  Object.defineProperty(window, "sessionStorage", {
    get: () => {
      if (storageFailure === "access") throw new Error("Opaque origin");
      return storage;
    },
  });
  const root = appDocument ? { textContent: "Working display" } : null;
  const context = vm.createContext({
    AbortController,
    URL,
    Date: { now: () => session.now },
    window,
    document: { getElementById: (id) => (id === "root" ? root : null) },
    location: { origin, replace: (url) => reloads.push(url) },
    setTimeout: (callback, delay) => {
      const id = Symbol();
      timers.set(id, { callback, deadline: session.now + delay });
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
      if (typeof outcome === "object") return Promise.resolve(outcome);
      return Promise.resolve(
        origin === APP_URL
          ? { ok: true, status: 200, type: "basic" }
          : { ok: false, status: 0, type: "opaque" },
      );
    },
  });

  const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
  return {
    window: context.window,
    location: context.location,
    root,
    requests,
    reloads,
    timers,
    stored,
    run: async () => {
      vm.runInContext(source, context);
      await flushPromises();
    },
    advance: async (milliseconds) => {
      session.now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.deadline <= session.now) {
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

for (const status of [404, 429, 500, 502, 503, 504]) {
  test(`HTTP ${status} is a failed check and sustained errors recover once`, async () => {
    const error = { ok: false, status, type: "basic" };
    const probe = createProbe(APP_URL, [error, error, "success", "success"]);

    await probe.run();
    assert.equal(probe.window.__kioskFailures, 1);
    assert.deepEqual(probe.reloads, []);
    assert.equal(probe.window.__kioskProbePending, false);
    assert.equal(probe.timers.size, 0);

    await probe.advance(60000);
    await probe.run();
    assert.equal(probe.window.__kioskFailures, 2);
    assert.deepEqual(probe.reloads, []);

    await probe.advance(60000);
    await probe.run();
    assert.deepEqual(probe.reloads, [APP_URL]);
    assert.equal(probe.window.__kioskFailures, 0);
    assert.equal(probe.timers.size, 0);

    await probe.advance(60000);
    await probe.run();
    assert.deepEqual(probe.reloads, [APP_URL]);
  });
}

test("one HTTP error preserves the working display and its state", async () => {
  const probe = createProbe(APP_URL, [
    { ok: false, status: 503, type: "basic" },
    "success",
  ]);
  probe.window.displayState = { screen: "main", score: "2–1" };
  const displayState = probe.window.displayState;
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 1);
  await probe.advance(60000);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 0);
  assert.equal(probe.window.displayState, displayState);
  assert.equal(probe.root.textContent, "Working display");
  assert.deepEqual(probe.reloads, []);
});

test("HTTP errors and transport failures count toward the same outage", async () => {
  const probe = createProbe(APP_URL, [
    "failure",
    { ok: false, status: 503, type: "basic" },
    "success",
  ]);
  await probe.run();
  await probe.advance(60000);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 2);
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("healthy checks separate isolated HTTP errors", async () => {
  const probe = createProbe(APP_URL, [
    { ok: false, status: 503, type: "basic" },
    "success",
    { ok: false, status: 500, type: "basic" },
    "success",
  ]);
  for (let check = 0; check < 4; check += 1) {
    await probe.run();
    assert.equal(probe.window.__kioskFailures, check % 2 === 0 ? 1 : 0);
    await probe.advance(60000);
  }
  assert.deepEqual(probe.reloads, []);
});

test("a same-origin error document waits for HTTP success, then recovers", async () => {
  const probe = createProbe(
    APP_URL,
    [
      { ok: false, status: 503, type: "basic" },
      { ok: false, status: 503, type: "basic" },
      "success",
    ],
    { appDocument: false },
  );
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 1);
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 2);
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("an initial same-origin error page recovers on its first healthy probe", async () => {
  const probe = createProbe(APP_URL, ["success"], { appDocument: false });
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 0);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("an empty application root is safe during normal startup", async () => {
  const probe = createProbe(APP_URL, ["success", "success", "success"]);
  probe.root.textContent = "";
  for (let check = 0; check < 3; check += 1) {
    await probe.run();
    await probe.advance(60000);
  }
  assert.deepEqual(probe.reloads, []);
});

test("opaque responses cannot mark a displayed app healthy", async () => {
  const probe = createProbe(APP_URL, [
    { ok: false, status: 0, type: "opaque" },
    { ok: false, status: 0, type: "opaqueredirect" },
    "success",
  ]);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 1);
  await probe.advance(60000);
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 2);
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("off-origin opaque reachability permits navigation without claiming HTTP health", async () => {
  const probe = createProbe("null", ["success"]);
  probe.window.__kioskFailures = 2;
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 2);
  assert.equal(probe.requests[0].mode, "no-cors");
});

test("a readable HTTP error does not navigate the bootstrap", async () => {
  const probe = createProbe("http://tauri.localhost", [
    { ok: false, status: 503, type: "basic" },
  ]);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  assert.equal(probe.window.__kioskProbePending, false);
  assert.equal(probe.timers.size, 0);
});

test("same-origin checks expose status and preserve cache-busting and navigation", async () => {
  const probe = createProbe(APP_URL, ["failure", "failure", "success"]);
  for (let check = 0; check < 3; check += 1) {
    await probe.run();
    const request = probe.requests[check];
    assert.equal(request.mode, "same-origin");
    assert.equal(request.cache, "no-store");
    assert.equal(request.url, `${APP_URL}/?kiosk-probe=${check * 60000}`);
    assert.equal(request.signal.aborted, false);
    await probe.advance(60000);
  }
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("recovery is bounded across fresh error documents and load-hook reinjection", async () => {
  const session = createSession();
  let documents = 0;
  let replacements = 0;
  let previousWindow;
  let probe;

  // Every replacement discards all window flags, just like a native load hook.
  async function load() {
    do {
      probe = createProbe(APP_URL, Array(6).fill("success"), {
        session,
        appDocument: false,
      });
      assert.notEqual(probe.window, previousWindow);
      assert.equal(probe.window.__kioskProbePending, undefined);
      assert.equal(probe.window.__kioskFailures, undefined);
      previousWindow = probe.window;
      documents += 1;
      assert.ok(documents <= 5, "Recovery loop across document loads");
      await probe.run();
      replacements += probe.reloads.length;
    } while (probe.reloads.length);
  }

  await load();
  assert.equal(documents, 2);
  assert.equal(replacements, 1, "First recovery is immediate");
  assert.equal(probe.stored.get(RECOVERY_KEY), "60000");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await probe.advance(59999);
    await probe.run();
    assert.deepEqual(probe.reloads, []);
    assert.equal(probe.stored.get(RECOVERY_KEY), String(attempt * 60000));
    await probe.advance(1);
    await probe.run();
    assert.deepEqual(probe.reloads, [APP_URL]);
    replacements += 1;
    await load();
    assert.equal(replacements, attempt + 1);
    assert.equal(documents, attempt + 2);
  }
});

test("invalid, expired and implausibly future deadlines permit immediate recovery", async () => {
  const now = 1700000000000;
  const values = [
    null,
    "",
    " ",
    "garbage",
    "{}",
    "NaN",
    "Infinity",
    "-1",
    "1e12",
    "01700000001000",
    String(now + 0.5),
    String(now - 1),
    String(now),
    String(now + 60001),
    "9007199254740992",
  ];
  for (const value of values) {
    const session = createSession();
    session.now = now;
    const probe = createProbe(APP_URL, ["success"], {
      session,
      appDocument: false,
    });
    if (value !== null) probe.stored.set(RECOVERY_KEY, value);
    probe.stored.set("selected-screen", "main");
    await probe.run();
    assert.deepEqual(probe.reloads, [APP_URL], `Stored value: ${value}`);
    assert.equal(probe.stored.get(RECOVERY_KEY), String(now + 60000));
    assert.equal(probe.stored.get("selected-screen"), "main");
  }
});

test("an existing deadline survives reinjection without extending the wait", async () => {
  const probe = createProbe(APP_URL, ["success", "success", "success"], {
    appDocument: false,
  });
  probe.stored.set(RECOVERY_KEY, "60000");
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  await probe.advance(59999);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  assert.equal(probe.stored.get(RECOVERY_KEY), "60000");
  await probe.advance(1);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.stored.get(RECOVERY_KEY), "120000");
});

test("the deadline is saved before navigation, even if replacement throws", async () => {
  const probe = createProbe(APP_URL, ["success", "success", "success"], {
    appDocument: false,
  });
  probe.location.replace = () => {
    assert.equal(probe.stored.get(RECOVERY_KEY), "60000");
    throw new Error("Navigation rejected");
  };
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 1);
  assert.equal(probe.window.__kioskProbePending, false);
  probe.location.replace = (url) => probe.reloads.push(url);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("a stored deadline retains sustained-outage recovery on a displayed app", async () => {
  const probe = createProbe(APP_URL, [
    "failure",
    "failure",
    "success",
    "success",
  ]);
  probe.stored.set(RECOVERY_KEY, "60000");
  await probe.run();
  await probe.run();
  await probe.run();
  assert.equal(probe.window.__kioskFailures, 2);
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 0);
});

for (const storageFailure of ["access", "read", "write"]) {
  test(`unavailable storage (${storageFailure}) bounds navigation in every fresh document`, async () => {
    const session = createSession();
    for (let document = 0; document < 3; document += 1) {
      const probe = createProbe(APP_URL, ["success", "success", "success"], {
        session,
        appDocument: false,
        storageFailure,
      });
      await probe.run();
      assert.deepEqual(probe.reloads, []);
      assert.equal(probe.window.__kioskFailures || 0, 0);
      await probe.advance(59999);
      await probe.run();
      assert.deepEqual(probe.reloads, []);
      await probe.advance(1);
      await probe.run();
      assert.deepEqual(probe.reloads, [APP_URL]);
      assert.equal(probe.window.__kioskProbePending, false);
      assert.equal(probe.timers.size, 0);
    }
  });
}

test("deferred sustained-outage recovery on a displayed app is retained", async () => {
  const probe = createProbe(
    APP_URL,
    ["failure", "failure", "success", "success"],
    { storageFailure: "write" },
  );
  await probe.run();
  await probe.advance(60000);
  await probe.run();
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  assert.equal(probe.window.__kioskFailures, 2);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 0);
});

test("failed HTTP and network probes do not reserve a recovery deadline", async () => {
  const probe = createProbe(
    APP_URL,
    [{ ok: false, status: 503, type: "basic" }, "failure", "success"],
    { appDocument: false },
  );
  for (let failure = 1; failure <= 2; failure += 1) {
    await probe.run();
    assert.equal(probe.window.__kioskFailures, failure);
    assert.equal(probe.stored.has(RECOVERY_KEY), false);
    assert.deepEqual(probe.reloads, []);
    await probe.advance(60000);
  }
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
});

test("a bootstrap deadline cannot suppress first recovery on a different origin", async () => {
  const session = createSession();
  const bootstrap = createProbe("http://tauri.localhost", ["success"], {
    session,
  });
  await bootstrap.run();
  assert.deepEqual(bootstrap.reloads, [APP_URL]);
  const errorDocument = createProbe(APP_URL, ["success"], {
    session,
    appDocument: false,
  });
  await errorDocument.run();
  assert.deepEqual(errorDocument.reloads, [APP_URL]);
});

test("an opaque error origin with denied storage retries at a bounded rate", async () => {
  const probe = createProbe("null", ["success", "success"], {
    storageFailure: "access",
  });
  probe.window.__kioskFailures = 2;
  await probe.run();
  assert.deepEqual(probe.reloads, []);
  await probe.advance(60000);
  await probe.run();
  assert.deepEqual(probe.reloads, [APP_URL]);
  assert.equal(probe.window.__kioskFailures, 2);
  assert.equal(probe.requests[0].mode, "no-cors");
});

test("healthy startup and display checks leave recovery and application storage alone", async () => {
  for (const storageFailure of [undefined, "access", "read", "write"]) {
    const probe = createProbe(APP_URL, ["success", "success"], {
      storageFailure,
    });
    probe.root.textContent = "";
    probe.stored.set(RECOVERY_KEY, "60000");
    probe.stored.set("screen", "main");
    await probe.run();
    await probe.advance(60000);
    probe.root.textContent = "Working display";
    await probe.run();
    assert.deepEqual(probe.reloads, []);
    assert.equal(probe.stored.get(RECOVERY_KEY), "60000");
    assert.equal(probe.stored.get("screen"), "main");
    assert.equal(probe.window.__kioskFailures, 0);
  }
});
