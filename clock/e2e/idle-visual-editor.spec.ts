import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
  goToSettingsTab,
  TEST_LISTEN_PREFIX,
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
      if (!sessionStorage.getItem("idle-editor-initialized")) {
        localStorage.clear();
        localStorage.setItem("clock_sync", "true");
        sessionStorage.setItem("idle-editor-initialized", "true");
      }
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

  test("opens color popover when clicking an element", async ({ page }) => {
    await openIdleVisualEditor(page);

    // Click on the clock element — this should open a popover with "Litur" field
    await idleElement(page, "idle-clock").click();

    const popover = page.locator(".visual-color-popover");
    await expect(popover).toBeVisible({ timeout: 5000 });
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

  test("persists a dragged element position after reload", async ({ page }) => {
    await openIdleVisualEditor(page);

    const clock = idleElement(page, "idle-clock");
    const canvas = page.locator(".visual-canvas");

    // Get initial position
    const canvasBounds = await canvas.boundingBox();
    const clockBounds = await clock.boundingBox();
    if (!canvasBounds || !clockBounds) throw new Error("Missing bounding box");

    const initialPosition = await clock.evaluate((element) => ({
      top: parseFloat(element.style.top),
      left: parseFloat(element.style.left),
    }));
    const position = {
      top: Number((initialPosition.top + 15).toFixed(1)),
      left: Number((initialPosition.left + 10).toFixed(1)),
    };
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

    await expect
      .poll(async () => {
        const response = await page.request.get(
          "http://127.0.0.1:9000/states/" +
            TEST_LISTEN_PREFIX +
            "/view.json?ns=vikes-match-clock-test",
          { headers: { Authorization: "Bearer owner" } },
        );
        expect(response.ok()).toBe(true);
        const view = await response.json();
        const saved =
          view.customPresets?.[view.themePreset]?.theme ?? view.theme;
        return {
          top: parseFloat(saved?.idleClockTop ?? ""),
          left: parseFloat(saved?.idleClockLeft ?? ""),
        };
      })
      .toEqual(position);

    const newBounds = await clock.boundingBox();
    if (!newBounds) throw new Error("Missing bounding box after drag");
    expect(newBounds.y - clockBounds.y).toBeGreaterThan(10);
    expect(newBounds.x - clockBounds.x).toBeGreaterThan(10);

    // A fresh document cannot satisfy this from local drag state.
    await page.reload();
    await openIdleVisualEditor(page);
    await expect
      .poll(() =>
        clock.evaluate((element) => ({
          top: parseFloat(element.style.top),
          left: parseFloat(element.style.left),
        })),
      )
      .toEqual(position);
  });

  test("can switch between visual tabs", async ({ page }) => {
    await openThemeEditor(page);

    // Default tab should be the scoreboard visual editor
    const scoreboardCanvas = page.locator(".visual-canvas");
    await expect(scoreboardCanvas).toBeVisible({ timeout: 5000 });

    // Scoreboard editor has 8 elements (home-logo, away-logo, clock, home-score, away-score, injury-time, ad, red-card)
    await expect(page.locator("[data-element-id]")).toHaveCount(8);

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
});
