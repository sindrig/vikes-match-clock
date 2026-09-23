import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenMeteoCloudCover,
  parseCloudCoverResponse,
} from "../weather.js";

const NOW = Date.parse("2026-09-22T12:00:00Z");

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

// -- response parsing -----------------------------------------------------------

test("parseCloudCoverResponse prefers the current reading", () => {
  const parsed = parseCloudCoverResponse(
    { current: { cloud_cover: 62 }, hourly: { time: [], cloud_cover: [] } },
    NOW,
  );
  assert.deepEqual(parsed, { cloudCover: 0.62, source: "current" });
  // The 0–100 API value normalizes to a 0..1 fraction with clamping.
  assert.deepEqual(parseCloudCoverResponse({ current: { cloud_cover: 150 } }, NOW), {
    cloudCover: 1,
    source: "current",
  });
  assert.deepEqual(parseCloudCoverResponse({ current: { cloud_cover: -10 } }, NOW), {
    cloudCover: 0,
    source: "current",
  });
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
  const parsed = parseCloudCoverResponse(data, Date.parse("2026-09-22T11:30:00Z"));
  assert.deepEqual(parsed, { cloudCover: 0.4, source: "hourly" });
  const parsed2 = parseCloudCoverResponse(data, Date.parse("2026-09-22T09:45:00Z"));
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
