import { test, expect, ONE_MINUTE, SECOND } from "./fixtures/test-helpers";

test.describe("Penalty System - 2-Minute Suspensions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await page.clock.install({ time: new Date(2025, 3, 10, 14, 0, 0) });
    await page.goto("/");
  });

  test("adds a 2-minute penalty and verifies countdown when match resumes", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE * 5);
    await expect(page.locator(".matchclock")).toHaveText("05:00");

    await page.getByText("Stop").click();

    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".penalty")).toHaveCount(1);
    await expect(page.locator(".penalty")).toHaveText("02:00");

    await page.getByText("Start").click();
    await page.clock.fastForward(31 * SECOND);
    await page.getByText("Stop").click();
    await expect(page.locator(".penalty")).toContainText(/01:2\d/);

    await page.getByText("Start").click();
    await page.clock.fastForward(30 * SECOND);
    await page.getByText("Stop").click();
    await expect(page.locator(".penalty")).toContainText(/00:5\d/);

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE + SECOND);
    await expect(page.locator(".penalty")).toHaveCount(0);
  });

  test("handles multiple concurrent penalties on same team", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE * 5);
    await page.getByText("Stop").click();

    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".penalty")).toHaveCount(1);

    await page.getByText("Start").click();
    await page.clock.fastForward(30 * SECOND);
    await page.getByText("Stop").click();

    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".penalty")).toHaveCount(2);

    await expect(page.locator(".penalty").first()).toContainText(/01:2\d/);
    await expect(page.locator(".penalty").last()).toHaveText("02:00");

    await page.getByText("Start").click();
    await page.clock.fastForward(90 * SECOND + SECOND);
    await expect(page.locator(".penalty")).toHaveCount(1);

    await page.clock.fastForward(30 * SECOND + SECOND);
    await expect(page.locator(".penalty")).toHaveCount(0);
  });

  test("handles penalties on both teams simultaneously", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE * 5);
    await page.getByText("Stop").click();

    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await page.getByText("Start").click();
    await page.clock.fastForward(10 * SECOND);
    await page.getByText("Stop").click();
    await page
      .locator(".match-controller-box-away")
      .getByText("Brottvísun")
      .click();

    await expect(page.locator(".team.home .penalty")).toHaveCount(1);
    await expect(page.locator(".team.away .penalty")).toHaveCount(1);

    await page.getByText("Start").click();
    await page.clock.fastForward(112 * SECOND);
    await expect(page.locator(".team.home .penalty")).toHaveCount(0);
    await expect(page.locator(".team.away .penalty")).toHaveCount(1);

    await page.clock.fastForward(12 * SECOND);
    await expect(page.locator(".team.away .penalty")).toHaveCount(0);
  });

  test("penalty button is disabled when match clock is running", async ({
    page,
  }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await expect(
      page.locator(".match-controller-box-home").getByText("Brottvísun"),
    ).not.toBeDisabled();

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE);

    await expect(
      page.locator(".match-controller-box-home").getByText("Brottvísun"),
    ).toBeDisabled();

    await page.getByText("Stop").click();

    await expect(
      page.locator(".match-controller-box-home").getByText("Brottvísun"),
    ).not.toBeDisabled();
  });

  test("penalty countdown pauses when match is paused", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator(".match-type-selector").selectOption("handball");
    await page.locator("#view-selector-control").click();

    await page.getByText("Start").click();
    await page.clock.fastForward(ONE_MINUTE * 5);
    await page.getByText("Stop").click();

    await page
      .locator(".match-controller-box-home")
      .getByText("Brottvísun")
      .click();
    await expect(page.locator(".penalty")).toHaveText("02:00");

    await page.getByText("Start").click();
    await page.clock.fastForward(31 * SECOND);
    await page.getByText("Stop").click();
    await expect(page.locator(".penalty")).toContainText(/01:2\d/);

    const penaltyTimeBeforePause = await page.locator(".penalty").textContent();

    await page.clock.fastForward(ONE_MINUTE);
    await expect(page.locator(".penalty")).toHaveText(penaltyTimeBeforePause!);

    await page.getByText("Start").click();
    await page.clock.fastForward(30 * SECOND);
    await page.getByText("Stop").click();
    await expect(page.locator(".penalty")).toContainText(/00:5\d/);
  });
});
