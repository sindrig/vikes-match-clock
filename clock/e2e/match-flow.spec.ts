import {
  test,
  expect,
  ONE_MINUTE,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
} from "./fixtures/test-helpers";

test.describe("Match Flow - Complete Match Simulation", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_listenPrefix", "test-e2e");
      localStorage.setItem("clock_sync", "true");
    });
    await page.clock.install({ time: new Date(2025, 3, 10, 14, 0, 0) });
    await page.goto("/");
    await loginWithEmulatorUser(page);
  });

  test("plays a complete football match with goals and half-time", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    await page.getByText("Byrja").click();
    await page.clock.fastForward(ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/10:0\d/);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");
    await expect(page.locator(".team.away .score")).toHaveText("0");

    await page.clock.fastForward(ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/25:0\d/);

    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await page.clock.fastForward(ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/40:0\d/);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await page.clock.fastForward(ONE_MINUTE * 6);
    await expect(page.locator(".matchclock")).toContainText(/46:0\d/);

    await page.getByText("Pása").click();
    await page.getByText("Næsti hálfleikur").click();

    await page.getByText("Stillingar").click();
    await expect(page.locator(".halfstops-input")).toHaveCount(3);

    await page.getByRole("button", { name: "Heim", exact: true }).click();
    await page.getByText("Byrja").click();

    await page.clock.fastForward(ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/60:0\d/);

    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("2");

    await page.clock.fastForward(ONE_MINUTE * 25);
    await expect(page.locator(".matchclock")).toContainText(/85:0\d/);

    await page.locator(".longerInput").fill("3");
    await expect(page.locator(".injury-time")).toHaveText("+3");

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("3");
    await expect(page.locator(".team.away .score")).toHaveText("2");

    await page.clock.fastForward(ONE_MINUTE * 6);
    await expect(page.locator(".matchclock")).toContainText(/91:0\d/);

    await expect(page.locator(".team.home .score")).toHaveText("3");
    await expect(page.locator(".team.away .score")).toHaveText("2");
  });

  test("handles goal corrections with H -1 button", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    await page.getByText("Byrja").click();
    await page.clock.fastForward(ONE_MINUTE * 5);

    await page.getByText("H +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("1");

    await page.getByText("H -1").click();
    await expect(page.locator(".team.home .score")).toHaveText("0");
  });

  test("plays a complete handball match with period transitions", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    await page.getByText("Byrja").click();

    await page.clock.fastForward(ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);

    await page.getByText("H +1").click();
    await page.getByText("H +1").click();
    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("1");

    await page.clock.fastForward(ONE_MINUTE * 15);
    await expect(page.locator(".matchclock")).toContainText(/30:0\d/);

    await page.getByText("Pása").click();
    await page.getByText("Næsti hálfleikur").click();

    await page.getByText("Byrja").click();
    await page.clock.fastForward(ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/40:0\d/);

    await page.getByText("Ú +1").click();
    await page.getByText("Ú +1").click();
    await expect(page.locator(".team.home .score")).toHaveText("2");
    await expect(page.locator(".team.away .score")).toHaveText("3");

    await page.clock.fastForward(ONE_MINUTE * 20);
    await expect(page.locator(".matchclock")).toContainText(/60:0\d/);
  });

  test("uses time adjustment buttons to modify elapsed time", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    await page.getByText("Byrja").click();
    await page.clock.fastForward(ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/10:0\d/);

    await page.getByText("+5m").click();
    await page.clock.fastForward(100);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);

    await page.getByText("+5m").click();
    await page.clock.fastForward(100);
    await expect(page.locator(".matchclock")).toContainText(/20:0\d/);

    await page.getByText("-5m").click();
    await page.clock.fastForward(100);
    await expect(page.locator(".matchclock")).toContainText(/15:0\d/);
  });

  test("sets team logos and displays them on scoreboard", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#team-selector-awayTeam").fill("fram");
    await page.locator("#view-selector-match").click();

    await expect(page.locator(".team.away img")).toHaveAttribute("src", /Fram/);
  });

  test("uses Leiðrétta to switch to advanced controls", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#view-selector-control").click();
    await expect(
      page.locator(".match-controller-box-home").getByText("Mark"),
    ).toBeVisible();

    await page.getByText("Leiðrétta").click();

    await page.getByText("Stillingar").click();
    await expect(page.locator("#view-selector-match")).toBeChecked();
  });
});
