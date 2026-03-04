import { test as base, expect, Page, request } from "@playwright/test";

export const ONE_MINUTE = 60000;
export const SECOND = 1000;

const WORKER_ID =
  process.env.PW_TEST_WORKER_INDEX ??
  process.env.TEST_WORKER_INDEX ??
  process.pid.toString();
export const TEST_LISTEN_PREFIX = `test-location-${WORKER_ID}`;
const TEST_EMAIL = `e2e-test-${WORKER_ID}@test.com`;
const TEST_PASSWORD = "testpassword123";
const EMAIL_PREFIX = TEST_EMAIL.split("@")[0];

export class FakeClock {
  constructor(private currentTime: Date) {}
  get time() {
    return this.currentTime.getTime();
  }
  async advance(page: Page, deltaMs: number) {
    this.currentTime = new Date(this.currentTime.getTime() + deltaMs);
    await page.clock.setFixedTime(this.currentTime);
  }
}

async function clearEmulatorData(): Promise<void> {
  const apiContext = await request.newContext();
  try {
    await apiContext.delete(
      `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
    );
    await apiContext.delete(
      `http://127.0.0.1:9000/states/${EMAIL_PREFIX}.json?ns=vikes-match-clock-test`,
    );

    // Create initial locations data that persists across test runs
    await apiContext.put(
      `http://127.0.0.1:9000/locations/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
      {
        data: {
          label: `Test Location ${WORKER_ID}`,
          screens: [
            {
              name: "Display 1",
            },
          ],
        },
      },
    );

    // Create initial state data for test-location so Firebase listeners don't hang
    await apiContext.put(
      `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
      {
        data: {
          match: {
            homeScore: 0,
            awayScore: 0,
            started: 0,
            timeElapsed: 0,
            halfStops: [45, 90, 105, 120],
            homeTeam: "Víkingur R",
            awayTeam: "",
            homeTeamId: 103,
            awayTeamId: 0,
            injuryTime: 0,
            matchType: "football",
            home2min: [],
            away2min: [],
            timeout: 0,
            homeTimeouts: 0,
            awayTimeouts: 0,
            buzzer: false,
            countdown: false,
            showInjuryTime: true,
          },
          controller: {
            selectedAssets: [],
            cycle: false,
            imageSeconds: 3,
            autoPlay: false,
            playing: false,
            assetView: "assets",
            view: "idle",
            roster: { home: [], away: [] },
            currentAsset: null,
            refreshToken: "",
          },
          view: {
            vp: {
              style: { height: 1080, width: 1920 },
              name: "1080p",
              key: "viken",
            },
            background: "Default",
          },
        },
      },
    );
  } catch {}
  await apiContext.dispose();
}

async function ensureEmulatorUser(): Promise<void> {
  const apiContext = await request.newContext();
  try {
    await apiContext.post(
      "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
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
  // Wait for login form to appear
  await page
    .getByPlaceholder("E-mail")
    .waitFor({ state: "visible", timeout: 15000 });
  await page.getByPlaceholder("E-mail").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Login", exact: true }).click();

  await page.waitForFunction(() => (window as any).__firebaseAuthUID, null, {
    timeout: 15000,
  });

  const realUID = await page.evaluate(() => {
    return (window as any).__firebaseAuthUID || null;
  });

  if (!realUID) {
    throw new Error(
      "Could not get UID from Firebase Auth. Auth may not be properly initialized.",
    );
  }

  // Create auth entry for the test user in Firebase
  // This tells the app which locations are available for this user
  const apiContext = await request.newContext();
  try {
    await apiContext.put(
      `http://127.0.0.1:9000/auth/${realUID}/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
      {
        data: true,
      },
    );
  } finally {
    await apiContext.dispose();
  }

  const screenButton = page.getByRole("button", {
    name: new RegExp(`Test Location ${WORKER_ID}`),
  });
  await screenButton.waitFor({ state: "visible", timeout: 15000 });
  await screenButton.click({ force: true });

  // After clicking the screen button, the app will:
  // 1. Set listenPrefix
  // 2. Load Firebase data for that location
  // 3. Render the display + Controller UI
  // Wait for the Controller Nav tabs to appear (Biðröð is the default tab)

  await page
    .getByRole("button", { name: "Biðröð" })
    .waitFor({ state: "visible", timeout: 10000 });
}

export const test = base.extend<{
  clockPage: Page;
}>({
  clockPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("clock_sync", "true");
    });

    await page.clock.setFixedTime(new Date(2025, 3, 10, 12, 0, 0));

    await use(page);
  },
});

export { ensureEmulatorUser, clearEmulatorData };

export async function goToHomeTab(page: Page) {
  await page.getByRole("button", { name: "Biðröð" }).click();
}

export async function goToSettingsTab(page: Page) {
  await page.getByRole("button", { name: "Stillingar" }).click();
}

export async function closeSettings(page: Page) {
  await page.keyboard.press("Escape");
  await page
    .locator(".rs-modal-backdrop")
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
}

export async function selectViewMode(
  page: Page,
  mode: "Idle" | "Match" | "Control",
) {
  await page
    .locator(".view-mode-buttons")
    .getByText(mode, { exact: true })
    .click();
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
  const viewModeLabel = {
    match: "Match",
    control: "Control",
    idle: "Idle",
  } as const;
  await page
    .locator(".view-mode-buttons")
    .getByText(viewModeLabel[view], { exact: true })
    .click();
}

export async function startClock(page: Page) {
  await page.getByText("Byrja").click();
  await expect(page.getByText("Pása")).toBeVisible({ timeout: 15000 });
}

export async function pauseClock(page: Page) {
  await page.getByText("Pása").click();
  await expect(page.getByText("Byrja")).toBeVisible({ timeout: 5000 });
}

export async function startSimpleClockAndWait(page: Page) {
  await page.getByText("Start").click();
  await expect(page.getByText("Stop")).toBeVisible({ timeout: 5000 });
}

export async function stopSimpleClockAndWait(page: Page) {
  await page.getByText("Stop").click();
  await expect(page.getByText("Start")).toBeVisible({ timeout: 5000 });
}

export async function startCountdownAndWait(page: Page) {
  await page.getByText("Hefja niðurtalningu").click();
  await expect(page.getByText("Hefja niðurtalningu")).toHaveCount(0, {
    timeout: 5000,
  });
}

export async function nextHalf(page: Page) {
  await page.getByText("Næsti hálfleikur").click();
}

export async function addHomeGoal(page: Page) {
  await page
    .locator(".preview-score-buttons")
    .first()
    .getByRole("button")
    .first()
    .click({ force: true });
}

export async function subtractHomeGoal(page: Page) {
  await page
    .locator(".preview-score-buttons")
    .first()
    .getByRole("button")
    .nth(1)
    .click({ force: true });
}

export async function addAwayGoal(page: Page) {
  await page
    .locator(".preview-score-buttons")
    .last()
    .getByRole("button")
    .first()
    .click({ force: true });
}

export async function openTimeControl(page: Page) {
  await page.getByRole("button", { name: "Tímastjórnun" }).click();
  await page
    .locator(".time-adjust-btn")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
}

export async function closeTimeControl(page: Page) {
  await page.keyboard.press("Escape");
  await page.locator(".rs-modal").waitFor({ state: "hidden", timeout: 5000 });
}

export async function adjustTime(page: Page, amount: string) {
  await openTimeControl(page);
  await page.locator(".time-adjust-btn", { hasText: amount }).click();
  await closeTimeControl(page);
}

export async function setInjuryTime(page: Page, minutes: string) {
  await openTimeControl(page);
  await page.locator(".longerInput").fill(minutes);
  await closeTimeControl(page);
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
