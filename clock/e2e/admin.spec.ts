import {
  test,
  expect,
  ensureEmulatorUser,
  clearEmulatorData,
  seedAdmins,
  seedInvitations,
  createEmulatorUser,
  TEST_LISTEN_PREFIX,
} from "./fixtures/test-helpers";

const ADMIN_EMAIL = `admin-e2e@test.com`;
const ADMIN_PASSWORD = "adminpassword123";
const REGULAR_USER_EMAIL = `regular-e2e@test.com`;
const REGULAR_USER_PASSWORD = "regularpassword123";

test.describe("Admin portal", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
    await createEmulatorUser(ADMIN_EMAIL, ADMIN_PASSWORD);
    await createEmulatorUser(REGULAR_USER_EMAIL, REGULAR_USER_PASSWORD);
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.clock.setFixedTime(new Date(2025, 3, 10, 12, 0, 0));
  });

  async function loginAsAdmin(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByPlaceholder("E-mail").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Lykilorð").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Innskrá", exact: true }).click();
    await page.waitForFunction(() => (window as any).__firebaseAuthUID, null, {
      timeout: 15000,
    });
    const uid = await page.evaluate(() => (window as any).__firebaseAuthUID);
    await seedAdmins(uid, true);
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__firebaseAuthUID, null, {
      timeout: 15000,
    });
  }

  async function loginAsRegularUser(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByPlaceholder("E-mail").fill(REGULAR_USER_EMAIL);
    await page.getByPlaceholder("Lykilorð").fill(REGULAR_USER_PASSWORD);
    await page.getByRole("button", { name: "Innskrá", exact: true }).click();
    await page.waitForFunction(() => (window as any).__firebaseAuthUID, null, {
      timeout: 15000,
    });
    const uid = await page.evaluate(() => (window as any).__firebaseAuthUID);
    await seedAdmins(uid, false);
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__firebaseAuthUID, null, {
      timeout: 15000,
    });
  }

  test("admin sees Stjórnborð link on screen selector", async ({ page }) => {
    await loginAsAdmin(page);
    await page
      .getByRole("link", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByText("Admin")).toBeVisible();
  });

  test("non-admin does not see Stjórnborð link", async ({ page }) => {
    await loginAsRegularUser(page);
    await expect(
      page.getByRole("link", { name: /Stjórnborð/i }),
    ).not.toBeVisible();
  });

  test("navigate to /admin as admin shows portal", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByText("Notendur og skjáaðgangur")).toBeVisible();
    await expect(page.getByText("Boð í bið")).toBeVisible();
  });

  test("navigate to /admin as non-admin shows access denied", async ({
    page,
  }) => {
    await loginAsRegularUser(page);
    await page.goto("/admin");
    await expect(
      page.getByText("Aðgangur bannaður", { exact: false }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("admin portal shows pending invitations section", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByText("Boð í bið")).toBeVisible();
    await page.getByRole("button", { name: "Bjóða notanda" }).click();
    await expect(
      page.getByRole("dialog").getByText("Bjóða notanda"),
    ).toBeVisible();
  });

  test("create invitation shows in table", async ({ page }) => {
    // Collect console errors and network responses for debugging
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const functionResponses: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("adminWrite")) {
        const body = await response.text().catch(() => "N/A");
        functionResponses.push(
          `${response.status()} ${response.url()} => ${body.slice(0, 500)}`,
        );
      }
    });

    await loginAsAdmin(page);
    await page.goto("/admin");
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });

    await page.getByRole("button", { name: "Bjóða notanda" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    await dialog.getByLabel("Netfang:").fill("invitee@example.com");
    // Wait for location checkboxes to load (onValue may resolve after fetchUsers)
    const checkbox = dialog.getByRole("checkbox").first();
    await checkbox.waitFor({ state: "visible", timeout: 10000 });
    await checkbox.check();
    await dialog.getByRole("button", { name: "Bjóða", exact: true }).click();
    // Wait for the dialog to close — if it stays open, the Cloud Function likely failed
    const closed = await dialog
      .waitFor({ state: "hidden", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!closed) {
      const paragraphs = await dialog.locator("p").allTextContents();
      const allText = await dialog.innerText().catch(() => "");
      throw new Error(
        `Dialog did not close. Paragraphs: ${JSON.stringify(paragraphs)}. ` +
          `Full dialog text: "${allText.slice(0, 500)}". ` +
          `Function responses: ${JSON.stringify(functionResponses)}. ` +
          `Console errors: ${JSON.stringify(consoleErrors.slice(-5))}`,
      );
    }
    await page
      .getByText("invitee@example.com")
      .waitFor({ state: "visible", timeout: 15000 });
  });

  test("delete invitation removes it from table", async ({ page }) => {
    await seedInvitations({
      "inv-to-delete": {
        email: "delete-me@example.com",
        locations: { [TEST_LISTEN_PREFIX]: true },
        createdBy: "admin-uid",
        createdAt: Date.now(),
      },
    });

    await loginAsAdmin(page);
    await page.goto("/admin");
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });

    await expect(page.getByText("delete-me@example.com").first()).toBeVisible({
      timeout: 15000,
    });
    await page
      .getByRole("row")
      .filter({ hasText: "delete-me@example.com" })
      .getByRole("button", { name: "Eyða" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eyða" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eyða", exact: true })
      .click();
    await expect(
      page.getByRole("table").getByText("delete-me@example.com"),
    ).not.toBeVisible({
      timeout: 15000,
    });
  });
});
