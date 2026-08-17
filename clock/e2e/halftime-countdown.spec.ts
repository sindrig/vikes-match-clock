import {
  test,
  expect,
  ONE_MINUTE,
  SECOND,
  FakeClock,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  startClock,
  startHalftimeCountdown,
  startNextPeriodEarly,
} from "./fixtures/test-helpers";

test.describe("Halftime Countdown", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.clock.setFixedTime(new Date(2025, 3, 10, 14, 0, 0));
    await page.goto("/");
    await loginWithEmulatorUser(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();
  });

  async function playToHalftime(page: import("@playwright/test").Page) {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE * 46);
    await expect(page.locator(".matchclock")).toContainText(/46:0\d/);
    await page.getByText("Pása").click();
    return fakeClock;
  }

  test("countdown reaches 00:00 and clock auto-starts next half", async ({
    page,
  }) => {
    const fakeClock = await playToHalftime(page);

    await startHalftimeCountdown(page);

    // Scoreboard should show a countdown value (less than 15:00)
    await fakeClock.advance(page, SECOND);
    await expect(page.locator(".matchclock")).toContainText(/14:5\d/);

    // Operator countdown display should also show the countdown
    await expect(page.locator(".match-countdown-display")).toBeVisible();

    // Advance through most of the 15 minutes
    await fakeClock.advance(page, ONE_MINUTE * 14);
    await expect(page.locator(".matchclock")).toContainText(/00:5\d/);

    // Advance past the end of the countdown
    await fakeClock.advance(page, ONE_MINUTE);

    // Clock should auto-start the next half from 45:00 (no "Byrja" wait)
    await expect(page.getByText("Pása")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".matchclock")).toContainText(/45:0\d/);
  });

  test("Byrja næsta hálfleik starts the next half early and shows 45:00 running", async ({
    page,
  }) => {
    const fakeClock = await playToHalftime(page);

    await startHalftimeCountdown(page);

    // Advance a few minutes into the countdown
    await fakeClock.advance(page, ONE_MINUTE * 5 + SECOND);
    await expect(page.locator(".matchclock")).toContainText(/09:5\d/);

    // Start the next half manually, before the countdown finishes
    await startNextPeriodEarly(page);

    // Clock should show 45:00 and be running (not paused)
    await expect(page.locator(".matchclock")).toContainText(/45:0\d/);
    await expect(page.getByText("Pása")).toBeVisible();

    // Clock should continue counting from 45:00
    await fakeClock.advance(page, ONE_MINUTE * 5);
    await expect(page.locator(".matchclock")).toContainText(/50:0\d/);
  });
});
