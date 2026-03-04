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
  startSimpleClockAndWait,
  stopSimpleClockAndWait,
  startCountdownAndWait,
  closeSettings,
} from "./fixtures/test-helpers";

test.describe("Basic navigation", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.clock.setFixedTime(new Date(2025, 3, 10, 12, 0, 0));
    await page.goto("/");
    await loginWithEmulatorUser(page);
  });

  test("starts the clock and does some things", async ({ page }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 12, 0, 0));
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-start-time-selector").fill("12:30");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(1);
    await startClock(page);
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(0);
    await fakeClock.advance(page, ONE_MINUTE / 2);
    await expect(page.getByText("Pása")).toHaveCount(1);
    await fakeClock.advance(page, ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("01:30");
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator("#team-selector-awayTeam").fill("fram");
    await closeSettings(page);
    await fakeClock.advance(page, ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/11:3\d/);
    await expect(page.locator(".away img")).toHaveCount(1);
    await expect(page.locator(".away img")).toHaveAttribute("src", /Fram/);
    await page.getByRole("button", { name: "Stillingar" }).click();
    await expect(page.locator(".halfstops-input")).toHaveCount(4);
    await closeSettings(page);
    await fakeClock.advance(page, ONE_MINUTE * 35);
    await expect(page.locator(".matchclock")).toContainText(/46:3\d/);
    await page.getByText("Pása").click();
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(0);
    await page.getByText("Næsti hálfleikur").click();
    await fakeClock.advance(page, ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("45:00");
    await page.getByRole("button", { name: "Stillingar" }).click();
    await expect(page.locator(".halfstops-input")).toHaveCount(3);
    await closeSettings(page);
    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE);
    await page.getByText("+5m").click();
    await fakeClock.advance(page, ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("52:00");
    await page.locator(".longerInput").fill("5");
    await expect(page.locator(".injury-time")).toHaveText("+5");
  });

  test("uses the simple control panel and updates the clock", async ({
    page,
  }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 12, 0, 0));
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-type-selector").selectOption("handball");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Control", { exact: true })
      .click();

    await expect(page.getByText("Stop")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Leikhlé" }).first(),
    ).toBeEnabled();
    await startSimpleClockAndWait(page);
    await fakeClock.advance(page, ONE_MINUTE / 2);
    await expect(page.getByText("Stop")).toHaveCount(1);
    await fakeClock.advance(page, ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("01:30");
    await expect(
      page.locator(".match-controller-box-home").getByText("Brottvísun"),
    ).toBeDisabled();

    // Trigger a team timeout
    await page
      .locator(".match-controller-box-home")
      .getByText("Leikhlé")
      .click();
    await expect(page.locator(".timeoutclock")).toBeVisible({ timeout: 5000 });
    await fakeClock.advance(page, 1500);
    await expect(page.getByText("Stop")).toBeDisabled();
    await expect(page.locator(".timeoutclock")).toContainText(/00:5\d/);

    // Advance through the timeout countdown
    await fakeClock.advance(page, 30000);
    await expect(page.locator(".timeoutclock")).toContainText(/00:2\d/);
    await fakeClock.advance(page, 20000);
    await expect(page.locator(".timeoutclock")).toContainText(/00:0\d/);
    await fakeClock.advance(page, 10000);
    await expect(page.locator(".timeoutclock")).toHaveCount(0, {
      timeout: 5000,
    });

    // Timeout expired - match still running, button re-enabled
    await expect(page.getByText("Stop")).toHaveCount(1);
    await expect(page.getByText("Stop")).toBeEnabled({ timeout: 5000 });

    // Stop to add a penalty (Brottvísun disabled while running)
    await stopSimpleClockAndWait(page);
    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".penalty")).toHaveCount(1);
    await startSimpleClockAndWait(page);
    await fakeClock.advance(page, 31 * SECOND);
    await expect(page.locator(".team-timeout")).toHaveCount(1);
    await expect(page.locator(".penalty")).toContainText(/01:2\d/);
  });

  test("starts a countdown", async ({ page }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 12, 0, 0));
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-start-time-selector").fill("13:30");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();
    await startCountdownAndWait(page);

    await fakeClock.advance(page, SECOND);
    await expect(page.getByText("Byrja")).toHaveCount(0);
    await expect(page.locator(".matchclock")).toContainText(/89:\d{2}/);
    await fakeClock.advance(page, 60 * 60 * SECOND);
    await expect(page.locator(".matchclock")).toContainText(/29:\d{2}/);
    await fakeClock.advance(page, 60 * 30 * SECOND);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    await fakeClock.advance(page, 30 * SECOND);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    await expect(page.getByText("Byrja")).toHaveCount(1);
  });
});
