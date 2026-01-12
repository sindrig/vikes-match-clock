import { test, expect, ONE_MINUTE, SECOND } from "./fixtures/test-helpers";

test.describe("Basic navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await page.clock.install({ time: new Date(2025, 3, 10, 12, 0, 0) });
    await page.goto("/");
  });

  test("starts the clock and does some things", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-start-time-selector").fill("12:30");
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(1);
    await page.getByText("Byrja").click();
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(0);
    await page.clock.fastForward(ONE_MINUTE / 2);
    await expect(page.getByText("Pása")).toHaveCount(1);
    await page.clock.fastForward(ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("01:30");
    await page.getByText("Stillingar").click();
    await page.locator("#team-selector-awayTeam").fill("fram");
    await page.clock.fastForward(ONE_MINUTE * 10);
    await expect(page.locator(".matchclock")).toContainText(/11:3\d/);
    await expect(page.locator(".away img")).toHaveCount(1);
    await expect(page.locator(".away img")).toHaveAttribute("src", /Fram/);
    await expect(page.locator(".halfstops-input")).toHaveCount(4);
    await page.clock.fastForward(ONE_MINUTE * 35);
    await expect(page.locator(".matchclock")).toContainText(/46:3\d/);
    await page.getByRole("button", { name: "Heim", exact: true }).click();
    await page.getByText("Pása").click();
    await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(0);
    await page.getByText("Næsti hálfleikur").click();
    await page.clock.fastForward(ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("45:00");
    await page.getByText("Stillingar").click();
    await expect(page.locator(".halfstops-input")).toHaveCount(3);
    await page.getByRole("button", { name: "Heim", exact: true }).click();
    await page.getByText("Byrja").click();
    await page.clock.fastForward(ONE_MINUTE);
    await page.getByText("+5m").click();
    await page.clock.fastForward(ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("52:00");
    await page.locator(".longerInput").fill("5");
    await expect(page.locator(".injury-time")).toHaveText("+5");
  });

  test("uses the simple control panel and updates the clock", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#view-selector-match").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await expect(page.getByText("Stop")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Leikhlé" }).first(),
    ).toBeEnabled();
    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE / 2);
    await expect(page.getByText("Stop")).toHaveCount(1);
    await page.clock.fastForward(ONE_MINUTE);
    await expect(page.locator(".matchclock")).toHaveText("01:30");
    await expect(
      page.locator(".match-controller-box-home").getByText("Brottvísun"),
    ).toBeDisabled();
    await page
      .locator(".match-controller-box-home")
      .getByText("Leikhlé")
      .click();
    await page.clock.fastForward(1500);
    await expect(page.getByText("Start")).toHaveCount(1);
    await expect(page.getByText("Start")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Leikhlé" }).first(),
    ).toBeEnabled();
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.locator(".timeoutclock")).toContainText(/00:5\d/);
    await page.clock.fastForward(30000);
    await expect(page.locator(".timeoutclock")).toContainText(/00:2\d/);
    await expect(page.locator("audio")).toHaveCount(0);
    await page.clock.fastForward(20000);
    await expect(page.locator(".timeoutclock")).toContainText(/00:0\d/);
    await expect(page.locator("audio")).toHaveCount(1);
    await page.clock.fastForward(5000);
    await expect(page.locator(".timeoutclock")).toContainText(/00:0\d/);
    await expect(page.locator("audio")).toHaveCount(0);
    await page.clock.fastForward(5000);
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.locator(".timeoutclock")).toHaveCount(0);
    await expect(page.getByText("Stop")).toHaveCount(0);
    await expect(page.getByText("Start")).toHaveCount(1);
    await page.clock.fastForward(ONE_MINUTE);
    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".matchclock")).toHaveText("01:30");
    await page.getByText("Start").click();
    await page.clock.fastForward(30000);
    await expect(page.locator(".team-timeout")).toHaveCount(1);
    await expect(page.locator(".penalty")).toContainText(/01:2\d/);
  });

  test("starts a countdown", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-start-time-selector").fill("13:30");
    await page.locator("#view-selector-match").click();
    await page.getByRole("button", { name: "Heim", exact: true }).click();
    await page.getByText("Hefja niðurtalningu").click();

    await page.clock.fastForward(SECOND);
    await expect(page.getByText("Byrja")).toHaveCount(0);
    await expect(page.locator(".matchclock")).toContainText(/89:\d{2}/);
    await page.clock.fastForward(60 * 60 * SECOND);
    await expect(page.locator(".matchclock")).toContainText(/29:\d{2}/);
    await page.clock.fastForward(60 * 30 * SECOND);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    await page.clock.fastForward(30 * SECOND);
    await expect(page.locator(".matchclock")).toHaveText("00:00");
    await expect(page.getByText("Byrja")).toHaveCount(1);
  });
});
