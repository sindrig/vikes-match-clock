import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  closeSettings,
} from "./fixtures/test-helpers";

test.describe("Asset Overlay System", () => {
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

  test("adds a URL asset to the queue and displays queue count", async ({
    page,
  }) => {
    const assetController = page.locator(".asset-controller");
    await expect(page.getByText("Engin biðröð")).toBeVisible();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    const queueColumn = assetController.locator(".queue-column");
    await expect(queueColumn).toHaveCount(1);
    await expect(queueColumn.locator(".queue-item")).toHaveCount(1);
  });

  test("adds multiple assets to the queue", async ({ page }) => {
    const assetController = page.locator(".asset-controller");

    // First asset: auto-creates "Biðröð 1" (0 queues → auto-add path)
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await expect(assetController.locator(".queue-column")).toHaveCount(1);

    // Subsequent assets: QueuePicker modal opens — pick the existing queue
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test2");
    await assetController.getByText("Bæta við").click();
    await page.locator(".rs-modal").getByText("Biðröð 1").click();

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test3");
    await assetController.getByText("Bæta við").click();
    await page.locator(".rs-modal").getByText("Biðröð 1").click();

    const queueColumn = assetController.locator(".queue-column");
    await expect(queueColumn).toHaveCount(1);
    await expect(queueColumn.locator(".queue-item")).toHaveCount(3);
  });

  test("clears the asset queue", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    const assetController = page.locator(".asset-controller");

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await expect(assetController.locator(".queue-column")).toHaveCount(1);

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test2");
    await assetController.getByText("Bæta við").click();
    await page.locator(".rs-modal").getByText("Biðröð 1").click();

    const queueColumn = assetController.locator(".queue-column");
    await expect(queueColumn.locator(".queue-item")).toHaveCount(2);

    await queueColumn.locator(".queue-column-actions .rs-btn").first().click();
    await page.getByText("Eyða biðröð").click();

    await expect(page.getByText("Engin biðröð")).toBeVisible();
  });

  test("shows Birta button when queue has items", async ({ page }) => {
    const assetController = page.locator(".asset-controller");
    await expect(assetController.getByLabel("Play Queue")).toHaveCount(0);

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    const playButton = assetController
      .locator(".queue-column")
      .getByLabel("Play Queue");
    await expect(playButton).toBeVisible();

    // Clicking play on a single-item queue shows the overlay
    // (the item is consumed immediately, so we verify the overlay appeared)
    await playButton.click();
    await expect(page.getByText("Hreinsa virkt overlay")).toBeVisible();
  });

  test("toggles autoplay and loop options", async ({ page }) => {
    const assetController = page.locator(".asset-controller");

    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();

    const queueColumn = assetController.locator(".queue-column");
    await queueColumn.locator(".queue-column-actions .rs-btn").first().click();
    const settingsPopover = page.locator(".queue-settings-popover");

    const autoplayToggle = settingsPopover
      .getByText("Autoplay")
      .locator("..")
      .locator(".rs-toggle");
    const loopToggle = settingsPopover
      .getByText("Loop")
      .locator("..")
      .locator(".rs-toggle");

    await expect(autoplayToggle).not.toHaveAttribute("data-checked", "true");
    await autoplayToggle.click();
    await expect(autoplayToggle).toHaveAttribute("data-checked", "true");

    await expect(settingsPopover.getByText("sek")).toBeVisible();

    await expect(loopToggle).toHaveAttribute("data-checked", "true");
    await loopToggle.click();
    await expect(loopToggle).not.toHaveAttribute("data-checked", "true");
  });

  test("shows clear overlay button when asset is displayed", async ({
    page,
  }) => {
    await expect(page.getByText("Hreinsa virkt overlay")).not.toBeVisible();

    const assetController = page.locator(".asset-controller");
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await assetController
      .locator(".queue-column")
      .getByLabel("Play Queue")
      .click();

    await expect(page.getByText("Hreinsa virkt overlay")).toBeVisible();
  });

  test("clears active overlay when clear button is clicked", async ({
    page,
  }) => {
    const assetController = page.locator(".asset-controller");
    await assetController
      .locator('input[type="text"]')
      .fill("https://www.youtube.com/watch?v=test1");
    await assetController.getByText("Bæta við").click();
    await assetController
      .locator(".queue-column")
      .getByLabel("Play Queue")
      .click();

    await expect(page.getByText("Hreinsa virkt overlay")).toBeVisible();
    await expect(page.locator(".overlay-container")).toBeVisible();

    await page.getByText("Hreinsa virkt overlay").click();

    await expect(page.getByText("Hreinsa virkt overlay")).not.toBeVisible();
    await expect(page.locator(".overlay-container")).not.toBeVisible();
  });

  test("validates URL format before adding", async ({ page }) => {
    const assetController = page.locator(".asset-controller");
    await assetController.locator('input[type="text"]').fill("not-a-valid-url");
    await assetController.getByText("Bæta við").click();

    await expect(page.getByText("is not a valid url")).toBeVisible();
    await expect(page.getByText("Engin biðröð")).toBeVisible();
  });
});

test.describe("Asset Overlay System - Team Views", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.goto("/");
    await loginWithEmulatorUser(page);
  });

  test("switches between Biðröð and Lið views", async ({ page }) => {
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.locator("#team-selector-homeTeam").fill("Víkingur R");
    await page.locator("#team-selector-awayTeam").fill("Fram");
    await expect(page.locator("#team-selector-homeTeam")).toHaveValue(
      "Víkingur R",
      { timeout: 10000 },
    );
    await expect(page.locator("#team-selector-awayTeam")).toHaveValue("Fram", {
      timeout: 10000,
    });
    await closeSettings(page);

    await expect(page.getByRole("button", { name: "Biðröð" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lið" })).toBeVisible();

    await page.getByRole("button", { name: "Lið" }).click();

    await expect(page.locator(".team-asset-controller").first()).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Biðröð" }).click();

    await expect(
      page.locator(".controls.control-item, .controls").first(),
    ).toBeVisible();
  });
});
