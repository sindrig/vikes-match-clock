import { test as base, expect, Page, request } from "@playwright/test";

export const ONE_MINUTE = 60000;
export const SECOND = 1000;

export const TEST_LISTEN_PREFIX = "test-e2e";
const TEST_EMAIL = "e2e-test@test.com";
const TEST_PASSWORD = "testpassword123";
const EMAIL_PREFIX = TEST_EMAIL.split("@")[0];

async function clearEmulatorData(): Promise<void> {
  const apiContext = await request.newContext();
  try {
    await apiContext.delete(
      `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
    );
    await apiContext.delete(
      `http://127.0.0.1:9000/states/${EMAIL_PREFIX}.json?ns=vikes-match-clock-test`,
    );
  } catch {}
  await apiContext.dispose();
}

async function ensureEmulatorUser(): Promise<void> {
  const apiContext = await request.newContext();
  try {
    await apiContext.post(
      "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
      {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          returnSecureToken: true,
        },
      },
    );
  } catch {
    // User may already exist, ignore error
  }
  await apiContext.dispose();
}

export async function loginWithEmulatorUser(page: Page): Promise<void> {
  await page.getByPlaceholder("E-mail").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page
    .getByRole("button", { name: "Heim", exact: true })
    .waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.getByText("Stillingar").click({ force: true });
  await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 10000 });
}

export const test = base.extend<{
  clockPage: Page;
}>({
  clockPage: async ({ page }, use) => {
    await page.addInitScript((listenPrefix) => {
      localStorage.clear();
      localStorage.setItem("clock_listenPrefix", listenPrefix);
      // Enable sync mode so unauthenticated users see the login form
      // (showControls=false when sync=true && auth.isEmpty=true)
      localStorage.setItem("clock_sync", "true");
    }, TEST_LISTEN_PREFIX);

    await page.clock.install({ time: new Date(2025, 3, 10, 12, 0, 0) });

    await use(page);
  },
});

export { ensureEmulatorUser, clearEmulatorData };

export async function goToHomeTab(page: Page) {
  await page.getByRole("button", { name: "Heim", exact: true }).click();
}

export async function goToSettingsTab(page: Page) {
  await page.getByText("Stillingar").click();
}

export async function selectMatchType(
  page: Page,
  matchType: "football" | "handball",
) {
  await goToSettingsTab(page);
  await page.locator(".match-type-selector").selectOption(matchType);
}

export async function selectView(
  page: Page,
  view: "match" | "control" | "idle",
) {
  await page.locator(`#view-selector-${view}`).click();
}

export async function startClock(page: Page) {
  await page.getByText("Byrja").click();
}

export async function pauseClock(page: Page) {
  await page.getByText("Pása").click();
}

export async function nextHalf(page: Page) {
  await page.getByText("Næsti hálfleikur").click();
}

export async function addHomeGoal(page: Page) {
  await page.getByText("H +1").click();
}

export async function subtractHomeGoal(page: Page) {
  await page.getByText("H -1").click();
}

export async function addAwayGoal(page: Page) {
  await page.getByText("Ú +1").click();
}

export async function expectClockTime(page: Page, time: string) {
  await expect(page.locator(".matchclock")).toHaveText(time);
}

export async function expectHomeScore(page: Page, score: string) {
  await expect(page.locator(".team.home .score")).toHaveText(score);
}

export async function expectAwayScore(page: Page, score: string) {
  await expect(page.locator(".team.away .score")).toHaveText(score);
}

export async function setTeam(
  page: Page,
  team: "homeTeam" | "awayTeam",
  value: string,
) {
  await page.locator(`#team-selector-${team}`).fill(value);
}

export async function setMatchStartTime(page: Page, time: string) {
  await page.locator(".match-start-time-selector").fill(time);
}

export { expect };
