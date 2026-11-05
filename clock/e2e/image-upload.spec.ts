import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import {
  clearEmulatorData,
  emulatorFixture,
  ensureEmulatorUser,
  expect,
  loginWithEmulatorUser,
  test,
} from "./fixtures/test-helpers";

function createTestImage(name: string) {
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return { name, mimeType: "image/png", buffer: pngBuffer };
}

async function goToMediaTab(page: Page) {
  await page.getByRole("button", { name: "Myndefni" }).click();
  await expect(page.getByText("Myndir")).toBeVisible({ timeout: 5000 });
}

test.beforeAll(async () => {
  await ensureEmulatorUser();
});

test.describe("Image Upload", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.goto("/");
  });

  test("uploads image with correct filename preserved", async ({ page }) => {
    const testImage = createTestImage(
      `test-upload-${emulatorFixture.id}-${randomUUID()}.png`,
    );

    await loginWithEmulatorUser(page);
    await goToMediaTab(page);

    const uploadArea = page.locator("label").filter({
      hasText: /Upload|drop a file/,
    });
    await expect(uploadArea).toBeVisible();

    const fileInput = page.locator('.upload-manager input[type="file"]');
    await fileInput.setInputFiles(testImage);

    await expect(uploadArea).toContainText("Uploaded Successfully", {
      timeout: 15000,
    });

    const expectedFilename = testImage.name;

    await expect(async () => {
      await page.locator(".upload-manager .reload").click();
      await page.waitForTimeout(1000);
      const imageItem = page
        .locator(".asset-image")
        .filter({ hasText: expectedFilename });
      await expect(imageItem).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });

  test("uploads image with compression enabled", async ({ page }) => {
    const testImage = createTestImage(
      `test-compressed-${emulatorFixture.id}-${randomUUID()}.png`,
    );

    await loginWithEmulatorUser(page);
    await goToMediaTab(page);

    await page
      .getByRole("checkbox", { name: "Compress automatically" })
      .check();
    await expect(
      page.getByRole("checkbox", { name: "Compress automatically" }),
    ).toBeChecked();

    const uploadArea = page.locator("label").filter({
      hasText: /Upload|drop a file/,
    });

    const fileInput = page.locator('.upload-manager input[type="file"]');
    await fileInput.setInputFiles(testImage);

    await expect(uploadArea).toContainText("Uploaded Successfully", {
      timeout: 15000,
    });

    const expectedFilename = testImage.name;

    await expect(async () => {
      await page.locator(".upload-manager .reload").click();
      await page.waitForTimeout(1000);
      const imageItem = page
        .locator(".asset-image")
        .filter({ hasText: expectedFilename });
      await expect(imageItem).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });
});
