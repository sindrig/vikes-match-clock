import type { Page } from "@playwright/test";

import {
  initializeExecutionToken,
  LocalFixture,
  record,
} from "./fixtures/local-fixture";
import {
  clearEmulatorData,
  createEmulatorUser,
  emulatorFixture,
  ensureEmulatorUser,
  expect,
  seedAdmins,
  seedInvitations,
  TEST_LISTEN_PREFIX,
  test,
} from "./fixtures/test-helpers";

const adminEmail = emulatorFixture.email("admin");
const adminPassword = "adminpassword123";
const regularEmail = emulatorFixture.email("regular");
const regularPassword = "regularpassword123";
const inviteEmail = emulatorFixture.email("invitee");
const deleteEmail = emulatorFixture.email("delete");
const deleteId = emulatorFixture.invitationKey("delete");
// A separately owned fixture is deliberately ordered before the intended venue.
// Primary fixture setup and invitation teardown must preserve its records.
const unrelated = new LocalFixture(initializeExecutionToken(), "0");
const decoyVenue = unrelated.venue("0-decoy");
const decoyEmail = unrelated.email("pending");
const decoyId = unrelated.invitationKey("keep");
const decoyLocation = {
  name: `Unrelated venue ${unrelated.id}`,
  screens: [{ name: "Unrelated screen" }],
  metadata: { keep: true },
};
const decoyInvitation = {
  email: decoyEmail,
  locations: { [decoyVenue]: true },
  createdBy: "unrelated-synthetic-owner",
  createdAt: 1,
};
let adminUid: string;
let regularUid: string;
let sentinelsReady = false;

async function expectUnrelatedRecords() {
  expect(await unrelated.database("GET", `locations/${decoyVenue}`)).toEqual(
    decoyLocation,
  );
  expect(await unrelated.database("GET", `invitations/${decoyId}`)).toEqual(
    decoyInvitation,
  );
}

async function login(page: Page, email: string, password: string, uid: string) {
  await page.goto("/");
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Lykilorð").fill(password);
  await page.getByRole("button", { name: "Innskrá", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__firebaseAuthUID))
    .toBe(uid);
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__firebaseAuthUID))
    .toBe(uid);
}

test.describe("Admin portal", () => {
  test.beforeAll(async () => {
    await ensureEmulatorUser();
    adminUid = await createEmulatorUser(adminEmail, adminPassword);
    regularUid = await createEmulatorUser(regularEmail, regularPassword);
    await seedAdmins(adminUid, true);
    await seedAdmins(regularUid, false);
    await unrelated.database("PUT", `locations/${decoyVenue}`, decoyLocation);
    await unrelated.seedInvitations({ [decoyId]: decoyInvitation });
    sentinelsReady = true;
  });

  test.beforeEach(async ({ page }) => {
    await clearEmulatorData();
    await expectUnrelatedRecords();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });
    await page.clock.setFixedTime(new Date(2025, 3, 10, 12, 0, 0));
  });

  test.afterEach(async () => {
    try {
      for (const id of Object.keys(await emulatorFixture.invitations())) {
        await emulatorFixture.database("DELETE", `invitations/${id}`);
      }
    } finally {
      await expectUnrelatedRecords();
    }
  });

  test.afterAll(async () => {
    try {
      if (sentinelsReady) await expectUnrelatedRecords();
    } finally {
      await unrelated.cleanup();
    }
  });

  test("navigate to /admin as non-admin shows access denied", async ({
    page,
  }) => {
    await login(page, regularEmail, regularPassword, regularUid);
    await expect(
      page.getByRole("link", { name: /Stjórnborð/i }),
    ).not.toBeVisible();
    await page.goto("/admin");
    await expect(
      page.getByText("Aðgangur bannaður", { exact: false }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("create invitation shows in table", async ({ page }) => {
    await login(page, adminEmail, adminPassword, adminUid);
    const adminLink = page.getByRole("link", { name: /Stjórnborð/i });
    await expect(adminLink).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Admin")).toBeVisible();
    const listed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.origin === "http://127.0.0.1:5001" &&
        url.pathname.endsWith("/listUsers")
      );
    });
    await adminLink.click();
    const response = await listed;
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    const users = record(record(body).result).users;
    expect(Array.isArray(users)).toBe(true);
    if (!Array.isArray(users)) throw new Error("Missing real callable users.");
    expect(users.map((user: unknown) => record(user).uid)).toEqual(
      expect.arrayContaining([adminUid, regularUid]),
    );
    await expect(page).toHaveURL(/\/admin$/);
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByText("Stjórna notendum")).toBeVisible();
    await expect(page.getByText("Boð í bið")).toBeVisible();
    await page.getByRole("button", { name: "Bjóða notanda" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    await expect(dialog.getByText("Bjóða notanda")).toBeVisible();
    await dialog.getByLabel("Netfang:").fill(inviteEmail);
    // useAdminData renders name-or-key; the baseline venue has no name.
    const checkbox = dialog.getByRole("checkbox", {
      name: TEST_LISTEN_PREFIX,
      exact: true,
    });
    await checkbox.waitFor({ state: "visible", timeout: 10000 });
    const order = await dialog
      .getByRole("checkbox")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("value")),
      );
    expect(order.indexOf(decoyVenue)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(decoyVenue)).toBeLessThan(
      order.indexOf(TEST_LISTEN_PREFIX),
    );
    await checkbox.check();
    await dialog.getByRole("button", { name: "Bjóða", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15000 });
    await page
      .getByText(inviteEmail, { exact: true })
      .waitFor({ state: "visible", timeout: 15000 });
    const invitations = Object.values(
      await emulatorFixture.invitations(),
    ).filter((invitation) => invitation.email === inviteEmail);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.createdBy).toBe(adminEmail);
    expect(
      Object.entries(invitations[0]?.locations ?? {})
        .filter(([, granted]) => granted)
        .map(([venue]) => venue),
    ).toEqual([TEST_LISTEN_PREFIX]);
    await expectUnrelatedRecords();
  });

  test("delete invitation removes it from table", async ({ page }) => {
    await seedInvitations({
      [deleteId]: {
        email: deleteEmail,
        locations: { [TEST_LISTEN_PREFIX]: true },
        createdBy: adminEmail,
        createdAt: Date.now(),
      },
    });
    await login(page, adminEmail, adminPassword, adminUid);
    await page.goto("/admin");
    await page
      .getByRole("heading", { name: /Stjórnborð/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByText(deleteEmail, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page
      .getByRole("row")
      .filter({ hasText: deleteEmail })
      .getByRole("button", { name: "Eyða" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eyða", exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eyða", exact: true })
      .click();
    await expect(
      page.getByRole("table").getByText(deleteEmail, { exact: true }),
    ).not.toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => emulatorFixture.database("GET", `invitations/${deleteId}`))
      .toBeNull();
    await expect(page.getByText(decoyEmail, { exact: true })).toBeVisible();
  });
});
