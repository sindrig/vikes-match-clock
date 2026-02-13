import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
} from "./fixtures/test-helpers";

test.describe("Asset Overlay System", () => {
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

    await expect(assetController.getByText("sek")).toBeVisible();

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
});

test.describe("Asset Overlay System - Team Views", () => {
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
    await page.goto("/");
    await loginWithEmulatorUser(page);
  });

  test("switches between Biðröð and Lið views", async ({ page, request }) => {
    // Bypass UI race condition: setting both teams via UI fails due to Firebase set() + onValue sync
    await request.patch(
      "http://127.0.0.1:9000/states/test-e2e/match.json?ns=vikes-match-clock-test",
      {
        data: {
          homeTeam: "Víkingur R",
          homeTeamId: 103,
          awayTeam: "Fram",
          awayTeamId: 107,
        },
      },
    );

    await page.reload();
    await page
      .getByRole("button", { name: "Heim", exact: true })
      .waitFor({ state: "visible", timeout: 10000 });

    await page.getByText("Stillingar").click();
    await expect(page.locator("#team-selector-homeTeam")).toHaveValue(
      "Víkingur R",
      { timeout: 10000 },
    );
    await expect(page.locator("#team-selector-awayTeam")).toHaveValue("Fram", {
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Heim", exact: true }).click();

    const assetController = page.locator(".asset-controller");
    await expect(
      assetController.getByRole("button", { name: "Biðröð" }),
    ).toBeVisible();
    await expect(
      assetController.getByRole("button", { name: "Lið" }),
    ).toBeVisible();

    await assetController.getByRole("button", { name: "Lið" }).click();

    await expect(
      page.locator(".team-asset-controller").first(),
    ).toBeVisible({ timeout: 10000 });

    await assetController.getByRole("button", { name: "Biðröð" }).click();

    await expect(page.locator(".controls")).toBeVisible();
  });
});
