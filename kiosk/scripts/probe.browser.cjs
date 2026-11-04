const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(
  require.resolve("@playwright/test", {
    paths: [path.join(__dirname, "../../clock")],
  }),
);

const input = path.resolve(
  process.argv[2] || path.join(__dirname, "../ui/probe.js"),
);
const output = process.argv[3];
const loopOnly = process.argv.includes("--loop-only");
const recoveryKey = "vikes.kiosk.recoveryAfter";
const results = { source: input, cases: [], requests: [] };
const shell = fs
  .readFileSync(path.join(__dirname, "../../clock/index.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace(/<link\b[^>]*>/g, "");
let browser;
let appServer;
let bootstrapServer;
let appURL;
let bootstrapURL;
let source;
let state;

function html(kind) {
  if (kind === "error") {
    return "<!doctype html><title>Unavailable</title><h1>HTTP 503</h1>";
  }
  return shell
    .replace(
      '<div id="root"></div>',
      kind === "app"
        ? '<div id="root">Working display 2–1</div>'
        : '<div id="root"></div>',
    )
    .replace(
      "</body>",
      '<script>window.displayState = {screen: "main", score: "2–1"}; localStorage.setItem("screen", "main");</script></body>',
    );
}

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function close(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCase(name, action, options = {}) {
  state = { doc: "app", docStatus: 200, probeStatus: 200 };
  const record = {
    name,
    pass: false,
    loads: [],
    responses: [],
    pageErrors: [],
    blocked: [],
    observations: {},
  };
  results.cases.push(record);
  const context = await browser.newContext({ serviceWorkers: "block" });
  let capped = false;
  try {
    await context.route("**/*", (route) => {
      const origin = new URL(route.request().url()).origin;
      if ([appURL, bootstrapURL].includes(origin)) return route.continue();
      record.blocked.push(origin);
      return route.abort();
    });
    await context.exposeBinding("recordProbeResponse", (_source, response) => {
      record.responses.push(response);
    });
    await context.addInitScript(
      ({ appOrigin, storageFailure, initialDeadline, key }) => {
        if (storageFailure === "access") {
          Object.defineProperty(window, "sessionStorage", {
            get() {
              throw new DOMException("Storage denied", "SecurityError");
            },
          });
        } else if (storageFailure === "write") {
          Storage.prototype.setItem = () => {
            throw new DOMException("Storage full", "QuotaExceededError");
          };
        } else if (
          location.origin === appOrigin &&
          initialDeadline !== undefined &&
          sessionStorage.getItem(key) === null
        ) {
          sessionStorage.setItem(key, initialDeadline);
        }
        const original = window.fetch;
        window.fetch = async (...args) => {
          const response = await original(...args);
          await window.recordProbeResponse({
            mode: args[1].mode,
            status: response.status,
            ok: response.ok,
            type: response.type,
          });
          return response;
        };
      },
      { appOrigin: appURL, key: recoveryKey, ...options },
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => record.pageErrors.push(error.message));
    const inject = () =>
      page.evaluate(source).catch((error) => {
        if (!/context was destroyed|closed|navigation/i.test(error.message)) {
          record.pageErrors.push(error.message);
        }
      });
    // Model the existing native Finished hook, with a fresh JS realm on EVERY
    // real HTTP replacement. Stop the broken source without runaway traffic.
    page.on("load", () => {
      record.loads.push({ at: Date.now(), url: page.url() });
      if (record.loads.length >= 11) {
        capped = true;
        return;
      }
      void inject();
    });

    async function settle() {
      let stableSince = Date.now();
      let previous = results.requests.length;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        assert.equal(
          capped,
          false,
          "Recovery loop: capped at 11 document loads",
        );
        const pending = await page
          .evaluate(() => !!window.__kioskProbePending)
          .catch(() => true);
        if (previous !== results.requests.length || pending) {
          previous = results.requests.length;
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= 150) return;
        await pause(20);
      }
      throw new Error("Probe did not settle");
    }

    const read = () =>
      page.evaluate((key) => {
        let stored;
        try {
          stored = sessionStorage.getItem(key);
        } catch {
          stored = "unavailable";
        }
        return {
          failures: window.__kioskFailures || 0,
          root: !!document.getElementById("root"),
          text: document.getElementById("root")?.textContent,
          stored,
          fallback: window.__kioskRecoveryAfter,
          displayState: window.displayState,
        };
      }, recoveryKey);
    const load = async (url = appURL) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await settle();
    };
    const tick = async () => {
      await inject();
      await settle();
    };
    async function retryWhenDue() {
      const snapshot = await read();
      const deadline =
        snapshot.stored === "unavailable"
          ? snapshot.fallback
          : Number(snapshot.stored);
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0 && remaining <= 60000);
      console.log(
        `${name}: waiting ${remaining}ms for the real retry deadline`,
      );
      await pause(remaining + 30);
      await tick();
    }

    await action({ page, load, tick, read, retryWhenDue, record });
    assert.deepEqual(record.pageErrors, []);
    assert.deepEqual(record.blocked, []);
    record.pass = true;
  } catch (error) {
    record.error = String(error.stack);
  } finally {
    await context.close();
    console.log(
      JSON.stringify({ name, pass: record.pass, loads: record.loads.length }),
    );
  }
}

(async () => {
  appServer = await listen((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/") {
      response.writeHead(204).end();
      return;
    }
    const probe = url.searchParams.has("kiosk-probe");
    const status = probe ? state.probeStatus : state.docStatus;
    results.requests.push({
      kind: probe ? "probe" : "document",
      at: Date.now(),
      status,
    });
    if (probe && state.networkError) {
      request.socket.destroy();
      return;
    }
    response.writeHead(status, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    response.end(html(probe ? "app" : state.doc));
    if (!probe && state.recoverAfterDocument) {
      state.doc = "app";
      state.docStatus = 200;
      state.recoverAfterDocument = false;
    }
  });
  bootstrapServer = await listen((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><title>Local bootstrap</title>");
  });
  appURL = `http://127.0.0.1:${appServer.address().port}`;
  bootstrapURL = `http://127.0.0.1:${bootstrapServer.address().port}`;
  source = fs.readFileSync(input, "utf8");
  assert.ok(source.includes('"https://klukka.irdn.is"'));
  source = source.replace('"https://klukka.irdn.is"', JSON.stringify(appURL));
  results.ports = [appServer.address().port, bootstrapServer.address().port];
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--renderer-process-limit=2"],
  });
  results.browser = browser.version();

  await runCase(
    "canonical 503 / probe 200 survives repeated real document loads",
    async ({ load, tick, read, retryWhenDue, record }) => {
      state = { doc: "error", docStatus: 503, probeStatus: 200 };
      await load();
      record.observations.first = await read();
      assert.equal(
        record.loads.length,
        2,
        "First recovery must be immediate and bounded",
      );
      assert.equal(record.observations.first.root, false);
      for (let injection = 0; injection < 3; injection += 1) await tick();
      assert.equal(record.loads.length, 2);
      await retryWhenDue();
      assert.equal(record.loads.length, 3);
      assert.ok(record.loads[2].at - record.loads[1].at >= 59900);
      for (let injection = 0; injection < 3; injection += 1) await tick();
      assert.equal(record.loads.length, 3);
      record.observations.second = await read();
    },
  );
  if (loopOnly) return;

  await runCase(
    "denied storage waits an interval in every replacement document",
    async ({ load, tick, read, retryWhenDue, record }) => {
      state = { doc: "error", docStatus: 503, probeStatus: 200 };
      await load();
      record.observations.first = await read();
      assert.equal(record.loads.length, 1);
      await tick();
      assert.equal(record.loads.length, 1);
      await retryWhenDue();
      assert.equal(record.loads.length, 2);
      assert.ok(record.loads[1].at - record.loads[0].at >= 59900);
      await tick();
      assert.equal(record.loads.length, 2);
      record.observations.second = await read();
    },
    { storageFailure: "access" },
  );

  await runCase(
    "full storage safely defers the first recovery",
    async ({ load, tick, read, record }) => {
      state = { doc: "error", docStatus: 503, probeStatus: 200 };
      await load();
      await tick();
      record.observations.result = await read();
      assert.equal(record.loads.length, 1);
      assert.ok(record.observations.result.fallback > Date.now());
    },
    { storageFailure: "write" },
  );

  for (const initialDeadline of [
    "malformed",
    String(Date.now() - 10000),
    String(Date.now() + 86400000),
  ]) {
    await runCase(
      `invalid or stale deadline ${initialDeadline} is replaced`,
      async ({ load, tick, read, record }) => {
        state = { doc: "error", docStatus: 503, probeStatus: 200 };
        await load();
        await tick();
        record.observations.result = await read();
        assert.equal(record.loads.length, 2);
        assert.ok(Number(record.observations.result.stored) > Date.now());
      },
      { initialDeadline },
    );
  }

  await runCase(
    "working display tolerates one HTTP error without losing state",
    async ({ page, load, tick, read, record }) => {
      state.probeStatus = 503;
      await load();
      record.observations.failure = await read();
      await page.evaluate(() => {
        window.retainedDisplay = window.displayState;
      });
      state.probeStatus = 200;
      await tick();
      assert.equal(record.loads.length, 1);
      assert.equal(record.observations.failure.failures, 1);
      assert.equal(
        await page.evaluate(
          () => window.retainedDisplay === window.displayState,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem("screen")),
        "main",
      );
      assert.equal((await read()).text, "Working display 2–1");
      assert.equal((await read()).failures, 0);
    },
  );

  await runCase(
    "mixed network and HTTP failures recover the displayed app once",
    async ({ load, tick, read, record }) => {
      state.networkError = true;
      await load();
      assert.equal((await read()).failures, 1);
      state.networkError = false;
      state.probeStatus = 503;
      await tick();
      assert.equal((await read()).failures, 2);
      assert.equal(record.loads.length, 1);
      state.probeStatus = 200;
      await tick();
      await tick();
      assert.equal(record.loads.length, 2);
      assert.equal((await read()).failures, 0);
    },
  );

  await runCase(
    "same-origin error document waits for HTTP success then recovers",
    async ({ load, tick, read, record }) => {
      state = { doc: "error", docStatus: 503, probeStatus: 503 };
      await load();
      await tick();
      assert.equal((await read()).failures, 2);
      assert.equal(record.loads.length, 1);
      state = { doc: "app", docStatus: 200, probeStatus: 200 };
      await tick();
      assert.equal(record.loads.length, 2);
      assert.equal((await read()).root, true);
    },
  );

  await runCase(
    "first healthy probe immediately recovers to a healthy document",
    async ({ load, tick, read, record }) => {
      state = {
        doc: "error",
        docStatus: 503,
        probeStatus: 200,
        recoverAfterDocument: true,
      };
      await load();
      await tick();
      assert.equal(record.loads.length, 2);
      assert.equal((await read()).root, true);
    },
  );

  await runCase(
    "empty application root remains stable during startup",
    async ({ load, tick, read, record }) => {
      state.doc = "empty";
      await load();
      await tick();
      await tick();
      assert.equal(record.loads.length, 1);
      assert.equal((await read()).text, "");
    },
  );

  await runCase(
    "off-origin opaque reachability leads to readable app-origin checks",
    async ({ load, tick, read, record }) => {
      await load(bootstrapURL);
      await tick();
      assert.equal(record.loads.length, 2);
      assert.equal((await read()).root, true);
      assert.deepEqual(record.responses[0], {
        mode: "no-cors",
        status: 0,
        ok: false,
        type: "opaque",
      });
      assert.equal(record.responses[1].mode, "same-origin");
      assert.equal(record.responses[1].status, 200);
    },
  );

  await runCase(
    "bootstrap opaque 503 reaches an error document and later recovers",
    async ({ load, tick, read, record }) => {
      state = { doc: "error", docStatus: 503, probeStatus: 503 };
      await load(bootstrapURL);
      assert.equal(record.loads.length, 2);
      assert.equal((await read()).failures, 1);
      state = { doc: "app", docStatus: 200, probeStatus: 200 };
      await tick();
      assert.equal(record.loads.length, 3);
      assert.equal((await read()).root, true);
    },
  );
})()
  .catch((error) => {
    results.error = String(error.stack);
  })
  .finally(async () => {
    const cleanup = await Promise.allSettled([
      browser?.close(),
      close(appServer),
      close(bootstrapServer),
    ]);
    results.cleanedUp = cleanup.every(
      (result) => result.status === "fulfilled",
    );
    results.cleanupErrors = cleanup
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason));
    results.pass =
      !results.error &&
      results.cleanedUp &&
      results.cases.every((record) => record.pass);
    if (output) fs.writeFileSync(output, JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({
        pass: results.pass,
        cases: results.cases.length,
        cleanedUp: results.cleanedUp,
      }),
    );
    if (!results.pass) process.exitCode = 1;
  });
