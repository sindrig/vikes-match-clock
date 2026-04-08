import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  goToSettingsTab,
} from "./fixtures/test-helpers";

// ---- Helpers ----

async function openThemeEditor(page: import("@playwright/test").Page) {
  await goToSettingsTab(page);
  await page.getByRole("button", { name: "Breyta þema" }).click();
  await page
    .locator(".rs-modal-title")
    .filter({ hasText: "Klukku þema" })
    .waitFor({ state: "visible", timeout: 10000 });
}

async function switchToIdleVisualTab(page: import("@playwright/test").Page) {
  await page.getByText("Sjónrænt (idle)", { exact: true }).click();
}

async function openIdleVisualEditor(page: import("@playwright/test").Page) {
  await openThemeEditor(page);
  await switchToIdleVisualTab(page);
  // Wait for the canvas to be visible
  await page
    .locator(".visual-canvas")
    .waitFor({ state: "visible", timeout: 5000 });
}

function idleElement(page: import("@playwright/test").Page, id: string) {
  return page.locator(`[data-element-id="${id}"]`);
}

// ---- Tests ----

test.describe("Idle visual editor", () => {
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

  test("opens the idle visual editor and displays all four elements", async ({
    page,
  }) => {
    await openIdleVisualEditor(page);

    // Verify all four idle elements are visible
    await expect(idleElement(page, "idle-logo")).toBeVisible();
    await expect(idleElement(page, "idle-clock")).toBeVisible();
    await expect(idleElement(page, "idle-temp")).toBeVisible();
    await expect(idleElement(page, "idle-ad")).toBeVisible();

    // Verify display text content
    await expect(idleElement(page, "idle-logo")).toContainText("LOGO");
    await expect(idleElement(page, "idle-clock")).toContainText("12:00");
    await expect(idleElement(page, "idle-temp")).toContainText("17°");
    await expect(idleElement(page, "idle-ad")).toContainText("AD");

    // Verify element labels
    await expect(idleElement(page, "idle-logo")).toContainText("Merki");
    await expect(idleElement(page, "idle-clock")).toContainText("Klukka");
    await expect(idleElement(page, "idle-temp")).toContainText("Hiti");
    await expect(idleElement(page, "idle-ad")).toContainText("Auglýsing");
  });

  test("shows instructions text", async ({ page }) => {
    await openIdleVisualEditor(page);

    await expect(page.locator(".visual-instructions")).toContainText(
      "Dragðu hluti til að færa",
    );
  });

  test("opens color popover when clicking an element", async ({ page }) => {
    await openIdleVisualEditor(page);

    // Click on the clock element — this should open a popover with "Litur" field
    await idleElement(page, "idle-clock").click();

    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    const labels = popover.locator(".visual-color-popover-label");
    await expect(labels).toHaveCount(2);
    await expect(labels.nth(0)).toHaveText("Litur");
    await expect(labels.nth(1)).toHaveText("Stærð");

    // Font size controls should appear for idle-clock (it has fontSizeField)
    await expect(popover.locator(".visual-font-size-slider")).toBeVisible();
    await expect(popover.locator(".visual-font-size-input")).toBeVisible();
    await expect(popover.locator(".visual-font-size-unit")).toHaveText("px");
  });

  test("does not show stroke or font-family controls in idle popover", async ({
    page,
  }) => {
    await openIdleVisualEditor(page);

    await idleElement(page, "idle-clock").click();
    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Idle elements have no stroke or font-family fields
    await expect(popover.locator(".visual-stroke-slider")).toHaveCount(0);
    await expect(popover.locator(".visual-font-select")).toHaveCount(0);
  });

  test("popover does not show font size for elements without fontSizeField", async ({
    page,
  }) => {
    await openIdleVisualEditor(page);

    // idle-logo has no fontSizeField
    await idleElement(page, "idle-logo").click();
    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    await expect(popover.locator(".visual-font-size-slider")).toHaveCount(0);
  });

  test("closes popover when clicking outside", async ({ page }) => {
    await openIdleVisualEditor(page);

    await idleElement(page, "idle-clock").click();
    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Click the canvas background (outside the popover and elements)
    await page.locator(".visual-canvas").click({ position: { x: 5, y: 5 } });
    await expect(popover).toHaveCount(0, { timeout: 5000 });
  });

  test("drags an element to a new position", async ({ page }) => {
    await openIdleVisualEditor(page);

    const clock = idleElement(page, "idle-clock");
    const canvas = page.locator(".visual-canvas");

    // Get initial position
    const canvasBounds = await canvas.boundingBox();
    const clockBounds = await clock.boundingBox();
    if (!canvasBounds || !clockBounds) throw new Error("Missing bounding box");

    const startX = clockBounds.x + clockBounds.width / 2;
    const startY = clockBounds.y + clockBounds.height / 2;

    // Drag the clock element down and to the right
    const dragDistanceX = canvasBounds.width * 0.1;
    const dragDistanceY = canvasBounds.height * 0.15;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move in small steps to trigger pointer move events
    await page.mouse.move(
      startX + dragDistanceX / 2,
      startY + dragDistanceY / 2,
      { steps: 5 },
    );
    await page.mouse.move(startX + dragDistanceX, startY + dragDistanceY, {
      steps: 5,
    });
    await page.mouse.up();

    // Verify the element moved (new top should differ from initial)
    const newBounds = await clock.boundingBox();
    if (!newBounds) throw new Error("Missing bounding box after drag");

    // The element should have moved noticeably (at least 10px in Y)
    expect(newBounds.y - clockBounds.y).toBeGreaterThan(10);
  });

  test("can switch between visual tabs", async ({ page }) => {
    await openThemeEditor(page);

    // Default tab should be the scoreboard visual editor
    const scoreboardCanvas = page.locator(".visual-canvas");
    await expect(scoreboardCanvas).toBeVisible({ timeout: 5000 });

    // Scoreboard editor has 7 elements (home-logo, away-logo, clock, home-score, away-score, injury-time, ad)
    await expect(page.locator("[data-element-id]")).toHaveCount(7);

    // Switch to idle visual tab
    await switchToIdleVisualTab(page);
    await expect(scoreboardCanvas).toBeVisible();

    // Idle editor should have 4 elements
    await expect(page.locator("[data-element-id]")).toHaveCount(4);

    // Switch to advanced tab
    await page.getByText("Ítarlegt", { exact: true }).click();
    await expect(page.locator(".theme-editor-panels")).toBeVisible();
    await expect(page.locator("[data-element-id]")).toHaveCount(0);

    // Switch back to idle visual
    await switchToIdleVisualTab(page);
    await expect(page.locator("[data-element-id]")).toHaveCount(4);
  });

  test("font size slider uses px units and correct range", async ({ page }) => {
    await openIdleVisualEditor(page);

    await idleElement(page, "idle-clock").click();
    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    const slider = popover.locator(".visual-font-size-slider");
    // Verify px range (min=10, max=120, step=1)
    await expect(slider).toHaveAttribute("min", "10");
    await expect(slider).toHaveAttribute("max", "120");
    await expect(slider).toHaveAttribute("step", "1");

    // The unit label should say "px"
    await expect(popover.locator(".visual-font-size-unit")).toHaveText("px");
  });

  test("color swatch and transparent toggle are present", async ({ page }) => {
    await openIdleVisualEditor(page);

    // Click on idle-clock to open the popover
    await idleElement(page, "idle-clock").click();
    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });

    // The "Litur" row should have a color swatch (input[type=color]) or transparent indicator
    const colorRow = popover.locator(".visual-color-popover-row").first();
    const hasSwatch = await colorRow.locator("input[type='color']").count();
    const hasTransparentIndicator = await colorRow
      .locator(".visual-transparent-indicator")
      .count();

    // One of the two must be present (either color swatch or transparent indicator)
    expect(hasSwatch + hasTransparentIndicator).toBeGreaterThan(0);

    // Transparent toggle (∅ button) should always be present
    await expect(colorRow.locator(".visual-transparent-toggle")).toBeVisible();
  });
});
