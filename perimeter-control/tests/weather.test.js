import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { OpenMeteoCloudCover, parseCloudCoverResponse } from "../weather.js";

const NOW = Date.parse("2026-09-22T12:00:00Z");

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settles(promise) {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("poll did not settle")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "condition did not become true");
    await delay(5);
  }
}

// Deliberately ignores AbortSignal: cancellation must bound poll() even
// when a provider fails to reject its own fetch or JSON promise.
function stalledResponse(stage, pending) {
  return stage === "headers"
    ? pending.promise
    : { ok: true, json: () => pending.promise };
}

function completeResponse(stage, cloudCover) {
  const body = { current: { cloud_cover: cloudCover } };
  return stage === "headers" ? response(body) : body;
}

// -- response parsing -----------------------------------------------------------

test("parseCloudCoverResponse prefers the current reading", () => {
  const parsed = parseCloudCoverResponse(
    { current: { cloud_cover: 62 }, hourly: { time: [], cloud_cover: [] } },
    NOW,
  );
  assert.deepEqual(parsed, { cloudCover: 0.62, source: "current" });
  // The 0–100 API value normalizes to a 0..1 fraction with clamping.
  assert.deepEqual(
    parseCloudCoverResponse({ current: { cloud_cover: 150 } }, NOW),
    {
      cloudCover: 1,
      source: "current",
    },
  );
  assert.deepEqual(
    parseCloudCoverResponse({ current: { cloud_cover: -10 } }, NOW),
    {
      cloudCover: 0,
      source: "current",
    },
  );
});

test("parseCloudCoverResponse falls back to the nearest hourly point", () => {
  const data = {
    hourly: {
      time: [
        "2026-09-22T09:00",
        "2026-09-22T10:00",
        "2026-09-22T11:00",
        "2026-09-22T12:00",
      ],
      cloud_cover: [80, 50, 40, 20],
    },
  };
  // 11:30 is closest to the 11:00 (30 min) and 12:00 (30 min) points; the
  // first nearest wins.
  const parsed = parseCloudCoverResponse(
    data,
    Date.parse("2026-09-22T11:30:00Z"),
  );
  assert.deepEqual(parsed, { cloudCover: 0.4, source: "hourly" });
  const parsed2 = parseCloudCoverResponse(
    data,
    Date.parse("2026-09-22T09:45:00Z"),
  );
  assert.deepEqual(parsed2, { cloudCover: 0.5, source: "hourly" });
});

test("parseCloudCoverResponse rejects unusable payloads", () => {
  assert.equal(parseCloudCoverResponse(null, NOW), null);
  assert.equal(parseCloudCoverResponse({}, NOW), null);
  assert.equal(
    parseCloudCoverResponse({ current: { cloud_cover: "overcast" } }, NOW),
    null,
  );
  assert.equal(
    parseCloudCoverResponse(
      { hourly: { time: ["bogus"], cloud_cover: [50] } },
      NOW,
    ),
    null,
  );
});

// -- fetcher lifecycle -------------------------------------------------------------

function makeFetcher({ body, error, ...options } = {}) {
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    if (error) throw error;
    return response(body);
  };
  let clock = NOW;
  const weather = new OpenMeteoCloudCover({
    url: "https://api.open-meteo.com/v1/forecast?latitude=64.117",
    fetchImpl,
    pollMs: 5,
    staleAfterMs: 3 * 60 * 60_000,
    now: () => clock,
    ...options,
  });
  return {
    weather,
    fetchCalls,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test("a good response is cached and exposed as the fresh cloud fraction", async () => {
  const { weather } = makeFetcher({
    body: { current: { cloud_cover: 30 } },
  });
  await weather.poll();
  assert.deepEqual(weather.snapshot(), {
    cloudCover: 0.3,
    ageMs: 0,
    stale: false,
  });
});

test("the cached value survives fetch failures and ages with the clock", async () => {
  const fetcher = makeFetcher({ body: { current: { cloud_cover: 30 } } });
  await fetcher.weather.poll();
  fetcher.advance(15 * 60_000);
  assert.deepEqual(fetcher.weather.snapshot(), {
    cloudCover: 0.3,
    ageMs: 15 * 60_000,
    stale: false,
  });
  const failing = makeFetcher({ error: new Error("no egress") });
  await failing.weather.poll();
  assert.deepEqual(failing.weather.snapshot(), {
    cloudCover: 0.8,
    ageMs: null,
    stale: true,
  });
});

test("after 3 h stale the fetcher falls back to the conservative fraction", async () => {
  const fetcher = makeFetcher({ body: { current: { cloud_cover: 30 } } });
  await fetcher.weather.poll();
  // One tick past the 3 h staleness boundary.
  fetcher.advance(3 * 60 * 60_000 + 1);
  const snapshot = fetcher.weather.snapshot();
  assert.equal(snapshot.cloudCover, 0.8);
  assert.equal(snapshot.stale, true);
  // The age still reflects the last good response.
  assert.equal(snapshot.ageMs, 3 * 60 * 60_000 + 1);
  // One more successful poll recovers.
  fetcher.advance(60_000);
  await fetcher.weather.poll();
  assert.equal(fetcher.weather.snapshot().stale, false);
});

test("an unusable response keeps the last good value", async () => {
  const fetcher = makeFetcher({ body: { current: { cloud_cover: 44 } } });
  await fetcher.weather.poll();
  fetcher.weather._fetch = async () => response({ garbage: true });
  await fetcher.weather.poll();
  assert.equal(fetcher.weather.snapshot().cloudCover, 0.44);
  assert.equal(fetcher.weather.snapshot().stale, false);
});

test("HTTP failure keeps the last value with its age", async () => {
  const fetcher = makeFetcher({ body: { current: { cloud_cover: 10 } } });
  await fetcher.weather.poll();
  fetcher.weather._fetch = async () => ({ ok: false, status: 503 });
  fetcher.advance(2 * 60_000);
  await fetcher.weather.poll();
  assert.deepEqual(fetcher.weather.snapshot(), {
    cloudCover: 0.1,
    ageMs: 2 * 60_000,
    stale: false,
  });
});

test("start polls immediately, repeats, and stop ends the loop", async () => {
  const fetchCalls = [];
  let live = true;
  const weather = new OpenMeteoCloudCover({
    url: "https://api.open-meteo.com/v1/forecast?latitude=64.117",
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      if (!live) throw new Error("stopped early");
      return response({ current: { cloud_cover: 50 } });
    },
    pollMs: 5,
    now: () => NOW,
  });
  weather.start();
  assert.equal(weather._pollTimer !== null, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  weather.stop();
  live = false;
  assert.ok(fetchCalls.length >= 1);
  assert.equal(weather.snapshot().cloudCover, 0.5);
  // No further polling after stop.
  const callsAfterStop = fetchCalls.length;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(fetchCalls.length, callsAfterStop);
  weather.stop();
});

for (const stage of ["headers", "JSON body"]) {
  test(`a stalled ${stage} times out and a later scheduled poll recovers`, async (t) => {
    let calls = 0;
    let stalledSignal;
    const pending = deferred();
    const { weather } = makeFetcher({
      pollMs: 10,
      requestTimeoutMs: 30,
      fetchImpl: (_url, { signal } = {}) => {
        calls += 1;
        if (calls === 1) {
          stalledSignal = signal;
          return stalledResponse(stage, pending);
        }
        return response({ current: { cloud_cover: 65 } });
      },
    });
    t.after(() => weather.stop());
    weather.start();
    await waitFor(() => weather.snapshot().cloudCover === 0.65);
    assert.ok(calls >= 2);
    assert.equal(stalledSignal.aborted, true);
  });

  test(`a ${stage} timeout settles poll(), preserves cache and stale fallback, and discards late data`, async (t) => {
    let clock = NOW;
    const { weather } = makeFetcher({
      body: { current: { cloud_cover: 30 } },
      requestTimeoutMs: 30,
      staleAfterMs: 100,
      now: () => clock,
    });
    t.after(() => weather.stop());
    await weather.poll();
    const pending = deferred();
    let signal;
    weather._fetch = (_url, options = {}) => {
      signal = options.signal;
      return stalledResponse(stage, pending);
    };
    clock += 40;
    await settles(weather.poll());
    assert.equal(signal.aborted, true);
    assert.deepEqual(weather.snapshot(), {
      cloudCover: 0.3,
      ageMs: 40,
      stale: false,
    });
    clock += 61;
    assert.deepEqual(weather.snapshot(), {
      cloudCover: 0.8,
      ageMs: 101,
      stale: true,
    });
    weather._fetch = () => response({ current: { cloud_cover: 60 } });
    await weather.poll();
    pending.resolve(completeResponse(stage, 99));
    await delay(0);
    assert.deepEqual(weather.snapshot(), {
      cloudCover: 0.6,
      ageMs: 0,
      stale: false,
    });
  });

  for (const outcome of ["success", "failure"]) {
    test(`stop aborts a stalled ${stage}, settles poll(), and ignores late ${outcome}`, async (t) => {
      const pending = deferred();
      let signal;
      let calls = 0;
      const { weather } = makeFetcher({
        requestTimeoutMs: 60_000,
        fetchImpl: (_url, options = {}) => {
          signal = options.signal;
          calls += 1;
          return stalledResponse(stage, pending);
        },
      });
      t.after(() => weather.stop());
      const polling = weather.poll();
      // Let fetch headers settle so JSON has started in the body case.
      await delay(0);
      weather.stop();
      assert.equal(signal?.aborted, true);
      await settles(polling);
      await weather.poll();
      assert.equal(calls, 1, "poll() must stay stopped until start()");
      if (outcome === "success") {
        pending.resolve(completeResponse(stage, 99));
      } else {
        pending.reject(new Error("late provider failure"));
      }
      await delay(0);
      assert.deepEqual(weather.snapshot(), {
        cloudCover: 0.8,
        ageMs: null,
        stale: true,
      });
    });
  }

  test(`start/stop/start protects the new ${stage} request from old cleanup and completion`, async (t) => {
    const old = deferred();
    const current = deferred();
    const signals = [];
    const { weather } = makeFetcher({
      body: { current: { cloud_cover: 30 } },
      pollMs: 60_000,
      requestTimeoutMs: 60_000,
    });
    t.after(() => weather.stop());
    await weather.poll();
    weather._fetch = (_url, { signal } = {}) => {
      signals.push(signal);
      return stalledResponse(stage, signals.length === 1 ? old : current);
    };
    weather.start();
    weather.start();
    assert.equal(signals.length, 1, "start() is idempotent");
    await delay(0);
    weather.stop();
    weather.start();
    assert.equal(signals.length, 2, "restart polls immediately");
    assert.equal(signals[0].aborted, true);
    // Let the old poll's finally run while the new request is still pending.
    await delay(0);
    await weather.poll();
    assert.equal(
      signals.length,
      2,
      "old cleanup must not release the new guard",
    );
    old.resolve(completeResponse(stage, 99));
    await delay(0);
    assert.equal(weather.snapshot().cloudCover, 0.3);
    assert.equal(signals[1].aborted, false);
    current.resolve(completeResponse(stage, 60));
    await waitFor(() => weather.snapshot().cloudCover === 0.6);
  });
}

for (const [name, fail] of [
  [
    "synchronous exception",
    () => {
      throw new Error("offline");
    },
  ],
  ["non-Error rejection", () => Promise.reject(null)],
  ["HTTP error", () => ({ ok: false, status: 503 })],
  [
    "invalid JSON",
    () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("invalid JSON");
      },
    }),
  ],
  ["unusable JSON", () => response({})],
]) {
  test(`${name} releases the guard, keeps the cache, and allows recovery`, async (t) => {
    const { weather, advance } = makeFetcher({
      body: { current: { cloud_cover: 30 } },
      requestTimeoutMs: 30,
    });
    t.after(() => weather.stop());
    await weather.poll();
    advance(10);
    weather._fetch = fail;
    await weather.poll();
    assert.deepEqual(weather.snapshot(), {
      cloudCover: 0.3,
      ageMs: 10,
      stale: false,
    });
    let signal;
    weather._fetch = (_url, options = {}) => {
      signal = options.signal;
      return response({ current: { cloud_cover: 60 } });
    };
    await weather.poll();
    assert.equal(weather.snapshot().cloudCover, 0.6);
    await delay(50);
    assert.equal(
      signal.aborted,
      false,
      "completed requests clear their deadline",
    );
  });
}

// Real fetch/AbortController coverage, entirely on loopback with OS-assigned
// ports. The first request never finishes; the next request is healthy.
for (const stage of ["headers", "JSON body"]) {
  for (const cancellation of ["deadline", "stop"]) {
    test(`local HTTP ${stage} stall is cancelled by ${cancellation}`, async (t) => {
      const entered = deferred();
      const consuming = deferred();
      const disconnected = deferred();
      let calls = 0;
      let weather;
      const server = createServer((_request, res) => {
        calls += 1;
        if (calls === 1) {
          res.once("close", () => disconnected.resolve());
          if (stage === "JSON body") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write('{"current":');
          }
          entered.resolve();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ current: { cloud_cover: 60 } }));
      });
      t.after(async () => {
        weather?.stop();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      weather = new OpenMeteoCloudCover({
        url: `http://127.0.0.1:${server.address().port}/forecast`,
        fetchImpl: async (url, options) => {
          const res = await fetch(url, options);
          return {
            ok: res.ok,
            status: res.status,
            json: () => {
              consuming.resolve();
              return res.json();
            },
          };
        },
        requestTimeoutMs: cancellation === "deadline" ? 100 : 60_000,
        pollMs: 60_000,
        now: () => NOW,
      });
      const polling = weather.poll();
      await settles(entered.promise);
      if (stage === "JSON body") await settles(consuming.promise);
      if (cancellation === "stop") weather.stop();
      await settles(polling);
      await settles(disconnected.promise);
      assert.deepEqual(weather.snapshot(), {
        cloudCover: 0.8,
        ageMs: null,
        stale: true,
      });
      if (cancellation === "stop") weather.start();
      else await weather.poll();
      await waitFor(() => weather.snapshot().cloudCover === 0.6);
      assert.equal(calls, 2);
    });
  }
}
