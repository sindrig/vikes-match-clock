import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  ONE_MINUTE,
  TEST_LISTEN_PREFIX,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
} from "./fixtures/test-helpers";
import type { Asset, CurrentAsset } from "../src/types";
import type { StaleSessionHarness } from "./fixtures/stale-session-harness";

const namespace = "vikes-match-clock-test";
const owner = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};
type State = {
  match: Record<string, unknown>;
  controller: Record<string, unknown>;
};
const pageErrors = new WeakMap<Page, string[]>();

async function rest(method: string, path: string, data?: unknown) {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=${namespace}`,
    {
      method,
      headers: owner,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response.json() as Promise<unknown>;
}
const statePath = `states/${TEST_LISTEN_PREFIX}`;
const state = () => rest("GET", statePath) as Promise<State>;
const snapshot = (
  page: Page,
): Promise<ReturnType<StaleSessionHarness["snapshot"]>> =>
  page.evaluate(() => window.staleSessionHarness.snapshot());
async function proof(page: Page, phase: string) {
  await test.info().attach(phase, {
    contentType: "application/json",
    body: JSON.stringify({
      browser: await snapshot(page),
      backend: await state(),
    }),
  });
}

async function boot(page: Page) {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("clock_sync", "true");
  });
  // Keep SDK auth/retry timers running with a fixed Date. Network and
  // subscription deliveries remain real throughout the journey.
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await page.route("**/stale-session-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
    }),
  );
  await page.goto("/e2e/fixtures/stale-session.html");
  await loginWithEmulatorUser(page);
  await expect
    .poll(() => snapshot(page))
    .toMatchObject({ connected: true, eligible: true, freshness: "ready" });
  // Rules readback alone is insufficient: the actual signed-in SDK must be
  // unable to write a different venue, before counters are reset at capture.
  await expect(
    page.evaluate(() => window.staleSessionHarness.deny()),
  ).rejects.toThrow(/PERMISSION_DENIED/i);
}

async function disconnect(page: Page) {
  await page.context().setOffline(true);
  // Explicit SDK transport shutdown makes /.info/connected observable without
  // depending on Chromium's treatment of an already-open WebSocket.
  await page.evaluate(() => window.staleSessionHarness.disconnect());
  await expect
    .poll(() => snapshot(page))
    .toMatchObject({ connected: false, eligible: false, freshness: "offline" });
}

async function processDeadline(page: Page, deadline: number) {
  const before = await snapshot(page);
  expect(before.ticks.length).toBeGreaterThanOrEqual(2);
  // Advance to the due moment plus one lifecycle/renderer tick, rather than
  // five minutes of callbacks. Every previously registered 100 ms callback
  // must run, including MatchLifecycle's due-check driver.
  const delta = Math.max(0, deadline - before.serverTime);
  const time = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(time + delta);
  await page.clock.runFor(delta + 100);
  await expect
    .poll(async () => {
      const after = await snapshot(page);
      return before.ticks.every(
        (ticks, index) => (after.ticks[index] ?? 0) > ticks,
      );
    })
    .toBe(true);
  expect((await snapshot(page)).serverTime).toBeGreaterThanOrEqual(deadline);
}

async function resync(page: Page) {
  await page.context().setOffline(false);
  await page.evaluate(() => window.staleSessionHarness.reconnect());
  await expect.poll(() => snapshot(page)).toMatchObject({ connected: true });
  // An unchanged SDK reconnect need not deliver core data. A distinct core
  // update is explicit resync proof, not a claim to repair that inherited limit.
  await rest("PATCH", `${statePath}/match`, { awayScore: 1 });
  await expect
    .poll(() => snapshot(page))
    .toMatchObject({
      eligible: true,
      freshness: "ready",
      match: { awayScore: 1 },
    });
  await proof(page, "authoritative-resync");
}

async function rejectOldCompletion(page: Page, kind: "countdown" | "asset") {
  // A retained command exercises the obsolete session-origin boundary. Then
  // use the CURRENT command with the captured A observation: otherwise that
  // earlier boundary would make a removed generation CAS guard vacuous.
  for (const origin of ["retained", "current"] as const) {
    const committed = await page.evaluate(
      ({ kind, origin }) => window.staleSessionHarness.complete(kind, origin),
      { kind, origin },
    );
    expect(committed, `${origin} ${kind} completion of A must reject`).toBe(
      false,
    );
  }
}

async function checkpoint(page: Page) {
  await page.evaluate(() => window.staleSessionHarness.checkpoint());
  await expect
    .poll(() => snapshot(page))
    .toMatchObject({ match: { injuryTime: 1 } });
  const { writes } = await snapshot(page);
  expect(
    writes,
    "only the acknowledged fresh checkpoint may submit a write",
  ).toEqual([{ path: "/", status: "ok" }]);
  const audit = (await rest("GET", `audit/${TEST_LISTEN_PREFIX}`)) as Record<
    string,
    { action: string }
  >;
  expect(Object.values(audit).map((event) => event.action)).toEqual([
    "match.update",
  ]);
}

test.describe("Stale session mutation safety", () => {
  test.describe.configure({ timeout: 60000 });
  test.beforeAll(async () => {
    const rules = JSON.parse(
      readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
    ) as unknown;
    await rest("PUT", ".settings/rules", rules);
    expect(await rest("GET", ".settings/rules")).toEqual(rules);
    await ensureEmulatorUser();
  });
  test.beforeEach(async () => {
    await clearEmulatorData();
    await rest("PUT", `audit/${TEST_LISTEN_PREFIX}`, null);
    await rest("PATCH", `${statePath}/controller`, { view: "match" });
  });
  test.afterEach(async ({ page }) => {
    await test.info().attach("session-deliveries", {
      contentType: "application/json",
      body: JSON.stringify(
        await page.evaluate(() => window.staleSessionHarness?.deliveries),
      ),
    });
    expect(pageErrors.get(page) ?? []).toEqual([]);
  });

  test("suspended stale countdown cannot pause a newer running match", async ({
    page,
  }) => {
    await boot(page);
    const started = (await snapshot(page)).serverTime + 1000;
    await rest("PATCH", `${statePath}/match`, {
      started,
      countdown: true,
      halftimeCountdown: false,
    });
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({ match: { started, countdown: true }, eligible: true });
    await processDeadline(page, started - 500);
    await expect(page.locator(".matchclock")).not.toHaveText("00:00");
    expect((await snapshot(page)).serverTime).toBeLessThan(started);
    await page.evaluate(() => window.staleSessionHarness.capture());
    await proof(page, "observed-countdown-A");

    await disconnect(page);
    const genB = {
      started: started + 1,
      countdown: false,
      halftimeCountdown: false,
      timeElapsed: 83 * ONE_MINUTE + 32000,
      halfStops: [90, 105, 120],
    };
    await rest("PATCH", `${statePath}/match`, genB);
    const authoritativeB = (await state()).match;
    await processDeadline(page, started);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    expect(await snapshot(page)).toMatchObject({
      eligible: false,
      match: { started, countdown: true },
      writes: [],
    });
    await proof(page, "overdue-offline-A-with-authoritative-B");

    await resync(page);
    await expect.poll(() => snapshot(page)).toMatchObject({ match: genB });
    await processDeadline(page, (await snapshot(page)).serverTime);
    await rejectOldCompletion(page, "countdown");
    await checkpoint(page);
    expect((await state()).match).toEqual({
      ...authoritativeB,
      awayScore: 1,
      injuryTime: 1,
    });
    await expect(page.locator(".matchclock")).not.toHaveText("45:00");
    await proof(page, "resynced-B-after-settled-stale-completions");
  });

  test("suspended stale timed-asset callbacks cannot consume the queue or clear newer B", async ({
    page,
  }) => {
    await boot(page);
    const image = (key: string): Asset => ({
      key,
      type: "IMAGE",
      url: new URL(`/stale-session-${key}.svg`, page.url()).href,
    });
    const currentA: CurrentAsset = {
      asset: image("a"),
      time: 3,
      occurrenceId: "stale-occurrence-a",
    };
    const currentB: CurrentAsset = {
      asset: image("b"),
      time: 3,
      occurrenceId: "newer-occurrence-b",
    };
    const queue = {
      id: "queue-1",
      name: "Q",
      items: [image("q1"), image("q2")],
      autoPlay: true,
      imageSeconds: 3,
      cycle: false,
      order: 0,
    };
    await rest("PATCH", `${statePath}/controller`, {
      currentAsset: currentA,
      playing: true,
      activeQueueId: queue.id,
      queues: { [queue.id]: queue },
    });
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({
        controller: { currentAsset: currentA },
        eligible: true,
      });
    await expect(page.locator('.overlay-container img[alt="a"]')).toBeVisible();
    await processDeadline(page, (await snapshot(page)).serverTime);
    const observedAt = (await snapshot(page)).serverTime;
    await page.evaluate(() => window.staleSessionHarness.capture());
    await proof(page, "observed-timed-asset-A");

    await disconnect(page);
    // B really replaces A on the server while the phone still observes A.
    await rest("PATCH", `${statePath}/controller`, { currentAsset: currentB });
    const authoritativeB = (await state()).controller;
    expect(authoritativeB.currentAsset).toEqual(currentB);
    await processDeadline(page, observedAt + 3000);
    expect(await snapshot(page)).toMatchObject({
      eligible: false,
      controller: { currentAsset: currentA },
      writes: [],
    });
    await proof(page, "overdue-offline-A-with-authoritative-asset-B");

    await resync(page);
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({ controller: { currentAsset: currentB } });
    await expect(page.locator('.overlay-container img[alt="b"]')).toBeVisible();
    await processDeadline(page, (await snapshot(page)).serverTime);
    await rejectOldCompletion(page, "asset");
    await checkpoint(page);
    expect((await state()).controller).toEqual(authoritativeB);
    await proof(page, "newer-B-and-whole-queue-preserved");
  });

  test("still-current countdown completes after resync once the client is eligible", async ({
    page,
  }) => {
    await boot(page);
    const started = (await snapshot(page)).serverTime + 1000;
    await rest("PATCH", `${statePath}/match`, {
      started,
      countdown: true,
      halftimeCountdown: false,
    });
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({ match: { started, countdown: true }, eligible: true });
    await processDeadline(page, started - 500);
    await expect(page.locator(".matchclock")).not.toHaveText("00:00");
    expect((await snapshot(page)).serverTime).toBeLessThan(started);
    await page.evaluate(() => window.staleSessionHarness.capture());
    await proof(page, "observed-still-current-countdown");
    await disconnect(page);
    await processDeadline(page, started);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    expect(await snapshot(page)).toMatchObject({
      eligible: false,
      match: { started, countdown: true },
      writes: [],
    });
    expect((await state()).match).toMatchObject({ started, countdown: true });
    await proof(page, "current-countdown-overdue-while-ineligible");

    await resync(page);
    // Reconnection recomputes the SDK serverTimeOffset. Rebase the simulated
    // deadline against that actual offset; do not replace getServerTime or
    // wait fifteen real seconds for the same generation to expire again.
    await processDeadline(page, started);
    await expect
      .poll(() => state())
      .toMatchObject({
        match: {
          started: 0,
          countdown: false,
          halftimeCountdown: false,
          timeElapsed: 0,
        },
      });
    await expect
      .poll(async () => {
        const audit = (await rest(
          "GET",
          `audit/${TEST_LISTEN_PREFIX}`,
        )) as Record<string, { action: string }> | null;
        return Object.values(audit ?? {}).map((event) => event.action);
      })
      .toEqual(["match.complete-countdown"]);
    await processDeadline(page, (await snapshot(page)).serverTime);
    await expect
      .poll(async () => (await snapshot(page)).writes)
      .toEqual([
        { path: `/${statePath}/match`, status: "ok" },
        { path: "/", status: "ok" },
      ]);
    await proof(page, "still-current-countdown-committed-after-resync");
  });
});
