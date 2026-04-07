import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  loginWithEmulatorUser,
} from "./fixtures/test-helpers";

test.describe("Disconnect and logout", () => {
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
  });

  test("disconnect screen returns to selector, logout returns to login form", async ({
    page,
  }) => {
    await loginWithEmulatorUser(page);

    // Verify we're on the controller (Biðröð tab visible means controller is loaded)
    await expect(page.getByRole("button", { name: "Biðröð" })).toBeVisible();

    // Click "Aftengjast skjá" to disconnect from screen but stay logged in
    await page.getByRole("button", { name: "Aftengjast skjá" }).click();

    // Should be on the screen selector page (still authenticated)
    await expect(page.getByText("Veldu skjá til að stjórna")).toBeVisible({
      timeout: 10000,
    });

    // Select the screen again
    const screenButton = page.getByRole("button", {
      name: /Test Location/,
    });
    await screenButton.waitFor({ state: "visible", timeout: 15000 });
    await screenButton.click({ force: true });

    // Verify controller is loaded again
    await page
      .getByRole("button", { name: "Biðröð" })
      .waitFor({ state: "visible", timeout: 10000 });

    // Click "Útskrá" to fully log out
    await page.getByRole("button", { name: "Útskrá" }).click();

    // Should see the login form (back on the homepage)
    await expect(page.getByPlaceholder("E-mail")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: "Innskrá", exact: true }),
    ).toBeVisible();
  });
});
