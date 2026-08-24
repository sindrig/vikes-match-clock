import {
  test,
  expect,
  ONE_MINUTE,
  FakeClock,
  TEST_LISTEN_PREFIX,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  closeSettings,
} from "./fixtures/test-helpers";
import { request as playwrightRequest } from "@playwright/test";

// Deterministic regression for the stale-session incident: a phone session
// suspended with a pre-match countdown (generation A) must not be able to
// pause or rewind a newer running match generation (generation B) when it
// resumes. We model the stale state deliberately rather than rely on the
// OS tab-freezing heuristics:
//
//   1. A "phone" browser context loads countdown generation A and is then
//      taken OFFLINE with its page clock frozen, so it retains generation A
//      and never observes generation B.
//   2. The authoritative emulator is advanced through halftime into a running
//      generation B (REST writes stand in for the operator).
//   3. The stale phone's clock is advanced past the countdown end while it is
//      still offline, firing the obsolete countdown-end `pauseMatch` from its
//      generation-A render. Because the phone is offline, the stale mutation
//      is queued locally.
//   4. The phone is brought back online. Firebase applies the queued stale
//      mutation against current generation B state.
//   5. We assert generation B is still running at its current elapsed time.
//
// On the current implementation this reproduces the bug (the stale write
// pauses generation B). After the fix the write is rejected / never queued
// and generation B remains running.

const STALE_MATCH_START = "14:15";
const GEN_A_COUNTDOWN_MS = 15 * ONE_MINUTE;
// Time the "operator" has been running the second half when the phone
// resumes, matching the audit's ~83:32 elapsed clock.
const GEN_B_ELAPSED_MS = 38 * ONE_MINUTE + 32 * 1000;

test.describe("Stale session mutation safety", () => {
  // These tests drive a full login, a fake clock, and a real Firebase
  // emulator reconnection after going offline. On CI (slower runners) the
  // default 30s test timeout is flaky, so give them headroom.
  test.describe.configure({ timeout: 60000 });

  test.beforeAll(async () => {
    await ensureEmulatorUser();
  });

  test.beforeEach(async () => {
    await clearEmulatorData();
  });

  async function emulatorState(): Promise<{
    match: Record<string, unknown>;
    controller: Record<string, unknown>;
  }> {
    const ctx = await playwrightRequest.newContext();
    try {
      const res = await ctx.get(
        `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
      );
      const json = (await res.json()) as {
        match: Record<string, unknown>;
        controller: Record<string, unknown>;
      };
      return json;
    } finally {
      await ctx.dispose();
    }
  }

  async function writeMatch(partial: Record<string, unknown>): Promise<void> {
    const ctx = await playwrightRequest.newContext();
    try {
      await ctx.patch(
        `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}/match.json?ns=vikes-match-clock-test`,
        { headers: { Authorization: "Bearer owner" }, data: partial },
      );
    } finally {
      await ctx.dispose();
    }
  }

  async function writeController(
    partial: Record<string, unknown>,
  ): Promise<void> {
    const ctx = await playwrightRequest.newContext();
    try {
      await ctx.patch(
        `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}/controller.json?ns=vikes-match-clock-test`,
        { headers: { Authorization: "Bearer owner" }, data: partial },
      );
    } finally {
      await ctx.dispose();
    }
  }

  async function emulatorControllerState(): Promise<{
    currentAsset: unknown;
    playing: boolean;
    activeQueueId: unknown;
    queues: Record<string, { items: unknown[] }>;
  }> {
    const state = await emulatorState();
    const ctl = state.controller as Record<string, unknown>;
    return {
      currentAsset: ctl.currentAsset ?? null,
      playing: Boolean(ctl.playing),
      activeQueueId: ctl.activeQueueId ?? null,
      queues: (ctl.queues as Record<string, { items: unknown[] }>) ?? {},
    };
  }

  test("suspended stale countdown cannot pause a newer running match", async ({
    page,
  }) => {
    // --- Phase 1: phone context loads countdown generation A ---
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    const phoneClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page.clock.setFixedTime(phoneClock.time);
    await page.goto("/");
    await loginWithEmulatorUser(page);
    // Configure the pre-match start time in the settings modal, then switch to
    // Match view and start the pre-match countdown. The app computes the
    // countdown's `started` from its own getServerTime(), so generation A is
    // internally consistent (deterministic under the fake clock).
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-start-time-selector").fill(STALE_MATCH_START);
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();
    await page.getByText("Hefja niðurtalningu").click();
    await phoneClock.advance(page, 1000);
    // Countdown generation A is now active (started in the future).
    await expect(page.locator(".matchclock")).toContainText(/14:5\d/);

    // Capture generation A's authoritative `started` timestamp.
    const genAStarted = (await emulatorState()).match.started as number;
    expect(genAStarted).toBeGreaterThan(phoneClock.time);

    // --- Phase 2: isolate the phone (offline + frozen) so it keeps gen A ---
    const context = page.context();
    await context.setOffline(true);

    // --- Phase 3: operator advances emulator through halftime to gen B ---
    // Complete generation A, play the first half, advance halftime, and start
    // a running second half (generation B) at the current elapsed time.
    const genBStarted = phoneClock.time + GEN_A_COUNTDOWN_MS + GEN_B_ELAPSED_MS;
    await writeMatch({
      started: 0,
      countdown: false,
      halftimeCountdown: false,
      timeElapsed: 45 * ONE_MINUTE,
      halfStops: [90, 105, 120],
    });
    await writeMatch({
      started: genBStarted,
      countdown: false,
      halftimeCountdown: false,
      timeElapsed: GEN_B_ELAPSED_MS,
      halfStops: [90, 105, 120],
    });
    let state = await emulatorState();
    expect(state.match.started).toBe(genBStarted);
    expect(state.match.countdown).toBe(false);

    // --- Phase 4: resume the stale phone (still offline), fire the stale
    // countdown-end callback. The phone's local matchRef is still gen A, so
    // its pauseMatch computes `{ started: 0 }` and queues it offline. ---
    await phoneClock.advance(page, GEN_A_COUNTDOWN_MS + ONE_MINUTE);
    await page.waitForTimeout(500);

    // --- Phase 5: bring the phone online; the queued stale write is applied
    // against the authoritative gen B state. ---
    await context.setOffline(false);
    await page.waitForTimeout(1500);

    // --- Assert: generation B must remain running, unchanged. ---
    state = await emulatorState();
    expect(state.match.started).toBe(genBStarted);
    expect(state.match.countdown).toBe(false);

    // The running clock must not be reset/paused at the 45:00 second-half
    // base (the incident symptom). Exact rendered time depends on the fake
    // clock's server-time offset after reconnect, so assert on the pause
    // symptom rather than a specific elapsed value.
    await expect(page.locator(".matchclock")).not.toHaveText("45:00");
  });

  test("suspended stale timed-asset callbacks do not consume the queue or clear the current asset", async ({
    page,
  }) => {
    // --- Phase 1: phone context renders a timed current asset (image) with an
    // active autoplay queue (generation A). The asset's `time` schedules a
    // `removeAssetAfterTimeout` timer in the Asset renderer. ---
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    const phoneClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page.clock.setFixedTime(phoneClock.time);
    await page.goto("/");
    await loginWithEmulatorUser(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    const asset = {
      key: "stale-image",
      type: "image",
      url: "https://example.com/stale.png",
    };
    const queueItem = {
      key: "queue-item-1",
      type: "image",
      url: "https://example.com/q1.png",
    };
    await writeController({
      currentAsset: { asset, time: 3 },
      playing: true,
      activeQueueId: "queue-1",
      queues: {
        "queue-1": {
          id: "queue-1",
          name: "Q",
          items: [queueItem],
          autoPlay: true,
          imageSeconds: 3,
          cycle: false,
          order: 0,
        },
      },
    });
    // The phone renders the overlay asset and schedules the 3s expiry timer.
    await expect(page.locator(".overlay-container")).toBeVisible({
      timeout: 10000,
    });

    // --- Phase 2: isolate the phone (offline + frozen) so it keeps gen A ---
    const context = page.context();
    await context.setOffline(true);

    // --- Phase 3: the authoritative emulator is generation B and still holds
    // the current asset with an intact queue (nothing consumed). ---
    let ctl = await emulatorControllerState();
    expect(ctl.currentAsset).not.toBeNull();
    expect(ctl.playing).toBe(true);
    expect(ctl.queues["queue-1"]?.items).toHaveLength(1);

    // --- Phase 4: resume the stale phone and advance its clock past the
    // asset expiry. `runFor` fires the pending one-shot `setTimeout` that the
    // stale gen-A renderer scheduled, so the delayed
    // `removeAssetAfterTimeout` runs while offline and its stale mutation is
    // queued locally. ---
    await page.clock.runFor(5 * ONE_MINUTE);
    await page.waitForTimeout(500);

    // --- Phase 5: bring the phone online; the queued stale asset write is
    // applied against authoritative gen B controller state. ---
    await context.setOffline(false);
    await page.waitForTimeout(1500);

    // --- Assert: the authoritative current asset and queue are untouched. ---
    ctl = await emulatorControllerState();
    expect(ctl.currentAsset).not.toBeNull();
    expect(ctl.playing).toBe(true);
    expect(ctl.queues["queue-1"]?.items).toHaveLength(1);
  });

  test("still-current countdown completes after resync once the client is eligible", async ({
    page,
  }) => {
    // A countdown generation that is still authoritative when the phone
    // resumes must NOT stay stuck: the lifecycle coordinator defers the due
    // transition while the client is ineligible (offline) and completes it as
    // soon as the freshness barrier clears and the client is ready to write
    // again.
    //
    // getServerTime() is derived from the real server time via Firebase's
    // serverTimeOffset, so a fake page clock cannot make a countdown "due"
    // after resync (the offset is recomputed on reconnect). Instead this test
    // seeds a still-current countdown whose `started` is a few seconds in the
    // future in real server time:
    //
    //   1. The phone loads and observes the running countdown (not yet due).
    //   2. It goes offline; generation A remains authoritative and, in real
    //      time, `started` passes → the countdown becomes due while the phone
    //      is ineligible.
    //   3. The phone comes back online; after resync it is eligible again and
    //      generation A is still current (real time has passed `started`), so
    //      the countdown must complete.
    //   4. We assert the countdown completed (started 0, countdown false)
    //      rather than remaining latched-but-stuck on the expired generation.
    //
    // The emulator does not re-deliver unchanged subscription data on a raw
    // WebSocket reconnect, so after the phone comes back online we deliver the
    // post-resume authoritative snapshot explicitly with an innocuous match
    // write (`timeElapsed`). This mirrors production Firebase, which re-fires
    // the current value on reconnect and drives the client back to "ready".
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.goto("/");
    await loginWithEmulatorUser(page);

    // Seed a still-current countdown that becomes due ~15s from now (real
    // server time), letting the phone observe it while it is still running.
    const started = Date.now() + 15000;
    await writeMatch({
      started,
      countdown: true,
      halftimeCountdown: false,
      timeElapsed: 0,
      halfStops: [45, 90, 105, 120],
    });
    await page.waitForTimeout(1000);
    let state = await emulatorState();
    expect(state.match.started).toBe(started);
    expect(state.match.countdown).toBe(true);

    // --- Phase 2: isolate the phone while the countdown is still running. ---
    const context = page.context();
    await context.setOffline(true);

    // --- Phase 3: wait out the countdown in real time while the phone is
    // ineligible (offline). The lifecycle must defer the due transition, so
    // generation A is left untouched. ---
    await page.waitForTimeout(16000);
    state = await emulatorState();
    expect(state.match.started).toBe(started);
    expect(state.match.countdown).toBe(true);

    // --- Phase 4: resume. After resync the client is eligible again and the
    // still-current generation A must complete rather than stay stuck. ---
    await context.setOffline(false);
    await page.waitForTimeout(3000);
    await writeMatch({ timeElapsed: 1 });
    await page.waitForTimeout(2000);

    // --- Assert: the countdown completed (the due transition was retried, not
    // dropped, once eligibility returned). ---
    state = await emulatorState();
    expect(state.match.started).toBe(0);
    expect(state.match.countdown).toBe(false);
  });
});
