import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
} from "./fixtures/test-helpers";

test.describe("Theme system smoke test", () => {
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

  test("opens theme editor from settings and lists built-in presets", async ({
    page,
  }) => {
    // Open Settings
    await page.getByRole("button", { name: "Stillingar" }).click();
    await expect(page.getByText("Klukku þema")).toBeVisible();
    // Current preset should show "Default"
    await expect(page.getByText("Default")).toBeVisible();

    // Click "Breyta þema" to open the theme editor modal
    await page.getByRole("button", { name: "Breyta þema" }).click();

    // The theme editor modal should appear with built-in preset buttons
    await expect(page.getByText("Þema")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Default", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Vikes Dark" }),
    ).toBeVisible();

    // Switch to Vikes Dark
    await page.getByRole("button", { name: "Vikes Dark" }).click();

    // Close the modal
    await page.locator(".rs-modal-header .rs-btn-close").click();

    // Re-open settings to verify the preset changed
    await page.getByRole("button", { name: "Stillingar" }).click();
    await expect(page.getByText("Vikes Dark")).toBeVisible();
  });

  test("creates a custom preset by editing a built-in preset", async ({
    page,
  }) => {
    // Open Settings then theme editor
    await page.getByRole("button", { name: "Stillingar" }).click();
    await page.getByRole("button", { name: "Breyta þema" }).click();

    // Wait for the editor to load
    await expect(
      page.getByRole("button", { name: "Default", exact: true }),
    ).toBeVisible();

    // Switch to Advanced tab to edit a field
    await page.getByRole("tab", { name: "Ítarlegt" }).click();

    // Find and edit a score box color field — this should trigger auto-copy
    // of the built-in preset into a new custom preset "(breytt)"
    const colorInputs = page.locator(
      '.theme-editor-panels input[type="color"]',
    );
    const firstColorInput = colorInputs.first();
    await firstColorInput.waitFor({ state: "visible", timeout: 5000 });

    // Change a color — this should create "Default (breytt)" custom preset
    await firstColorInput.fill("#ff0000");

    // The preset list should now show the new custom preset
    await expect(page.getByText("Default (breytt)")).toBeVisible({
      timeout: 5000,
    });
  });
});
