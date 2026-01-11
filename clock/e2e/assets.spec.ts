import { test, expect } from "./fixtures/test-helpers";

test.describe("Asset Overlay System", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await page.clock.install({ time: new Date(2025, 3, 10, 14, 0, 0) });
    await page.goto("/");
  });

  test("adds a URL asset to the queue and displays queue count", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await expect(assetController.getByText("0 í biðröð")).toBeVisible();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    await expect(assetController.getByText("1 í biðröð")).toBeVisible();
  });

  test("adds multiple assets to the queue", async ({ page }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test2");
    await assetController.getByText("Bæta við").click();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test3");
    await assetController.getByText("Bæta við").click();

    await expect(assetController.getByText("3 í biðröð")).toBeVisible();
  });

  test("clears the asset queue", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test2");
    await assetController.getByText("Bæta við").click();

    await expect(assetController.getByText("2 í biðröð")).toBeVisible();
    await assetController.getByText("Hreinsa biðröð").click();

    await expect(assetController.getByText("0 í biðröð")).toBeVisible();
  });

  test("shows Birta button when queue has items", async ({ page }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await expect(assetController.getByText("Birta")).not.toBeVisible();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    await expect(assetController.getByText("Birta")).toBeVisible();
  });

  test("toggles autoplay and loop options", async ({ page }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");

    await expect(
      assetController
        .getByText("Autoplay")
        .locator("..")
        .locator('input[type="checkbox"]'),
    ).not.toBeChecked();

    await assetController.getByText("Autoplay").click();
    await expect(
      assetController
        .getByText("Autoplay")
        .locator("..")
        .locator('input[type="checkbox"]'),
    ).toBeChecked();

    await expect(assetController.locator(".rs-input-number")).toBeVisible();

    await expect(
      assetController
        .getByText("Loop")
        .locator("..")
        .locator('input[type="checkbox"]'),
    ).not.toBeChecked();

    await assetController.getByText("Loop").click();
    await expect(
      assetController
        .getByText("Loop")
        .locator("..")
        .locator('input[type="checkbox"]'),
    ).toBeChecked();
  });

  test("shows clear overlay button when asset is displayed", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    await expect(page.getByText("Hreinsa virkt overlay")).not.toBeVisible();

    const assetController = page.locator(".asset-controller");
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await assetController.getByText("Birta").click();

    await expect(page.getByText("Hreinsa virkt overlay")).toBeVisible();
  });

  test("clears active overlay when clear button is clicked", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await assetController.getByText("Birta").click();

    await expect(page.getByText("Hreinsa virkt overlay")).toBeVisible();
    await expect(page.locator(".overlay-container")).toBeVisible();

    await page.getByText("Hreinsa virkt overlay").click();

    await expect(page.getByText("Hreinsa virkt overlay")).not.toBeVisible();
    await expect(page.locator(".overlay-container")).not.toBeVisible();
  });

  test("validates URL format before adding", async ({ page }) => {
    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await assetController.locator('input[type="text"]').fill("not-a-valid-url");
    await assetController.getByText("Bæta við").click();

    await expect(page.getByText("is not a valid url")).toBeVisible();
    await expect(assetController.getByText("0 í biðröð")).toBeVisible();
  });

  test("switches between Biðröð and Lið views", async ({ page }) => {
    await page.getByText("Stillingar").click();
    await page.locator("#team-selector-homeTeam").fill("vikingur");
    await page.locator("#team-selector-awayTeam").fill("fram");

    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await expect(
      assetController.getByRole("button", { name: "Biðröð" }),
    ).toBeVisible();
    await expect(
      assetController.getByRole("button", { name: "Lið" }),
    ).toBeVisible();

    await assetController.getByRole("button", { name: "Lið" }).click();

    await expect(page.locator(".team-asset-controller").first()).toBeVisible();

    await assetController.getByRole("button", { name: "Biðröð" }).click();

    await expect(page.locator(".controls")).toBeVisible();
  });
});
