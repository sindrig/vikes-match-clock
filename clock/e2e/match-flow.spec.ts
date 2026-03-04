import {
  test,
  expect,
  ONE_MINUTE,
  FakeClock,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  startClock,
  closeSettings,
} from "./fixtures/test-helpers";

test.describe("Match Flow - Complete Match Simulation", () => {
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
  });

  test("plays a complete football match with goals and half-time", async ({
    page,
  }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/10:0\d/);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");
    await expect(page.locator(".team.away .score")).toHaveText("0");

    await fakeClock.advance(page, ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/25:0\d/);

    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await fakeClock.advance(page, ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/40:0\d/);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await fakeClock.advance(page, ONE_MINUTE * 6);
    await expect(page.locator(".matchclock")).toContainText(/46:0\d/);

    await page.getByText("Pása").click();
    await page.getByText("Næsti hálfleikur").click();

    await page.getByRole("button", { name: "Stillingar" }).click();
    await expect(page.locator(".halfstops-input")).toHaveCount(3);
    await closeSettings(page);
    await startClock(page);

    await fakeClock.advance(page, ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/60:0\d/);

    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("2");

    await fakeClock.advance(page, ONE_MINUTE * 25);
    await expect(page.locator(".matchclock")).toContainText(/85:0\d/);

    await page.locator(".longerInput").fill("3");
    await expect(page.locator(".injury-time")).toHaveText("+3");

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("3");
    await expect(page.locator(".team.away .score")).toHaveText("2");

    await fakeClock.advance(page, ONE_MINUTE * 6);
    await expect(page.locator(".matchclock")).toContainText(/91:0\d/);

    await expect(page.locator(".team.home .score")).toHaveText("3");
    await expect(page.locator(".team.away .score")).toHaveText("2");
  });

  test("handles goal corrections with H -1 button", async ({ page }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE * 5);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");

    await page.getByText("H -1").click();
    await expect(page.locator(".team.home .score")).toHaveText("0");
  });

  test("plays a complete handball match with period transitions", async ({
    page,
  }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-type-selector").selectOption("handball");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    await startClock(page);

    await fakeClock.advance(page, ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);

    await page.getByText("H +1").click();
    await page.getByText("H +1").click();
    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await fakeClock.advance(page, ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/30:0\d/);

    await page.getByText("Pása").click();
    await page.getByText("Næsti hálfleikur").click();

    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/40:0\d/);

    await page.getByText("Ú +1").click();
    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("3");

    await fakeClock.advance(page, ONE_MINUTE * 20);
    await expect(page.locator(".matchclock")).toContainText(/60:0\d/);
  });

  test("uses time adjustment buttons to modify elapsed time", async ({
    page,
  }) => {
    const fakeClock = new FakeClock(new Date(2025, 3, 10, 14, 0, 0));
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    await startClock(page);
    await fakeClock.advance(page, ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/10:0\d/);

    await page.getByText("+5m").click();
    await fakeClock.advance(page, 100);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);

    await page.getByText("+5m").click();
    await fakeClock.advance(page, 100);
    await expect(page.locator(".matchclock")).toContainText(/20:0\d/);

    await page.getByText("-5m").click();
    await fakeClock.advance(page, 100);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);
  });

  test("sets team logos and displays them on scoreboard", async ({ page }) => {
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator("#team-selector-awayTeam").fill("fram");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Match", { exact: true })
      .click();

    await expect(page.locator(".team.away img")).toHaveAttribute("src", /Fram/);
  });

  test("uses Leiðrétta to switch to advanced controls", async ({ page }) => {
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator(".match-type-selector").selectOption("handball");
    await closeSettings(page);
    await page
      .locator(".view-mode-buttons")
      .getByText("Control", { exact: true })
      .click();
    await expect(
      page.locator(".match-controller-box-home").getByText("Mark"),
    ).toBeVisible();

    await page.getByText("Leiðrétta").click();

    await expect(
      page.locator(".view-mode-buttons").getByText("Match"),
    ).toHaveClass(/rs-btn-primary/);
  });
});
