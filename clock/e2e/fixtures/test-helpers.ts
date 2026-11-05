import { expect, test as base, type Page, type Route } from "@playwright/test";

import { observeFixtureMutations } from "./fixture-mutations";
import {
  assertBrowserEmulatorTarget,
  initializeExecutionToken,
  LocalFixture,
  requireEmulatorSelection,
  type Invitation,
} from "./local-fixture";
import type {} from "./emulator-target";

export const ONE_MINUTE = 60000;
export const SECOND = 1000;

const workerIndex =
  process.env.PW_TEST_WORKER_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0";
export const emulatorFixture = new LocalFixture(
  initializeExecutionToken(),
  workerIndex,
);
export const TEST_LISTEN_PREFIX = emulatorFixture.venue();
export const TEST_LOCATION_LABEL = `Test Location ${emulatorFixture.id}`;
export const TEST_EMAIL = emulatorFixture.email("operator");
const TEST_PASSWORD = "testpassword123";
const verifiedPages = new WeakSet<Page>();

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
  requireEmulatorSelection();
  await emulatorFixture.database("DELETE", `states/${TEST_LISTEN_PREFIX}`);
  await emulatorFixture.database("PUT", `locations/${TEST_LISTEN_PREFIX}`, {
    label: TEST_LOCATION_LABEL,
    screens: [{ name: "Display 1" }],
  });
  await emulatorFixture.database("PUT", `states/${TEST_LISTEN_PREFIX}`, {
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
      injuryTimeDisplayMode: "full",
    },
    controller: {
      queues: {},
      activeQueueId: null,
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
  });
}

async function ensureEmulatorUser(): Promise<void> {
  await emulatorFixture.createUser(TEST_EMAIL, TEST_PASSWORD);
}

export async function loginWithEmulatorUser(page: Page): Promise<void> {
  if (!verifiedPages.has(page)) {
    throw new Error(
      "Fixture login requires a page with verified emulator selection.",
    );
  }
  await page
    .getByPlaceholder("E-mail")
    .waitFor({ state: "visible", timeout: 15000 });
  await page.getByPlaceholder("E-mail").fill(TEST_EMAIL);
  await page.getByPlaceholder("Lykilorð").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Innskrá", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__firebaseAuthUID), null, {
    timeout: 15000,
  });
  const uid = await page.evaluate(() => window.__firebaseAuthUID);
  if (!uid) throw new Error("Missing Firebase UID after fixture login.");
  await emulatorFixture.database(
    "PUT",
    `auth/${uid}/${TEST_LISTEN_PREFIX}`,
    true,
  );
  const screenButton = page.getByRole("button", {
    // Presence can arrive between visibility and click; only its badge may vary.
    name: new RegExp(
      `^${TEST_LOCATION_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Display 1(?: \\d+ tengd)?$`,
    ),
  });
  await screenButton.waitFor({ state: "visible", timeout: 15000 });
  await screenButton.click();
  await page
    .getByRole("button", { name: "Biðröð" })
    .waitFor({ state: "visible", timeout: 10000 });
}

async function verifyServedEmulators(page: Page) {
  // The flag alone cannot reconfigure an already running/built app. Probe the
  // actual served Firebase singleton before any application login or command.
  const localOnly = (route: Route) => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  };
  await page.route("**/*", localOnly);
  try {
    await page.goto("/e2e/fixtures/emulator-target.html");
    await page.waitForFunction(
      () => Boolean(window.__e2eEmulatorTarget),
      null,
      { timeout: 10000 },
    );
    assertBrowserEmulatorTarget(
      await page.evaluate(() => window.__e2eEmulatorTarget),
    );
    await page.goto("about:blank");
    verifiedPages.add(page);
  } finally {
    await page.unroute("**/*", localOnly);
  }
}

export const test = base.extend<
  { clockPage: Page },
  { ownedResources: LocalFixture }
>({
  ownedResources: [
    async ({ browser }, provide) => {
      requireEmulatorSelection();
      try {
        await provide(emulatorFixture);
      } finally {
        // This browser belongs to this Playwright worker, including role contexts
        // explicitly created by its tests. Close them before retiring owned data.
        try {
          for (const context of browser.contexts()) await context.close();
        } finally {
          await emulatorFixture.cleanup();
        }
      }
    },
    { scope: "worker", auto: true, timeout: 30000 },
  ],
  page: async ({ page, ownedResources }, provide) => {
    expect(ownedResources).toBe(emulatorFixture);
    observeFixtureMutations(page, ownedResources);
    await verifyServedEmulators(page);
    try {
      await provide(page);
    } finally {
      // Drain while the page can still receive the actual callable response.
      await ownedResources.settleMutations();
    }
  },
  clockPage: async ({ page }, provide) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("e2e-clock-page-initialized") === null) {
        localStorage.clear();
        localStorage.setItem("clock_sync", "true");
        sessionStorage.setItem("e2e-clock-page-initialized", "true");
      }
    });
    await page.clock.setFixedTime(new Date(2025, 3, 10, 12, 0, 0));
    await provide(page);
  },
});

export async function seedAdmins(uid: string, isAdmin = true): Promise<void> {
  await emulatorFixture.database("PUT", `admins/${uid}`, isAdmin);
}

export async function seedInvitations(
  invitations: Record<string, Invitation>,
): Promise<void> {
  await emulatorFixture.seedInvitations(invitations);
}

export async function createEmulatorUser(
  email: string,
  password: string,
): Promise<string> {
  return emulatorFixture.createUser(email, password);
}

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
    .catch(() => undefined);
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
  await page.getByText("Stöðva niðurtalningu").click();
}

export async function startHalftimeCountdown(page: Page) {
  await page.getByText("Næsti hálfleikur").click();
  await expect(page.getByText("Stöðva niðurtalningu")).toBeVisible({
    timeout: 5000,
  });
}

export async function stopHalftimeCountdown(page: Page) {
  await page.getByText("Stöðva niðurtalningu").click();
  await expect(page.getByText("Byrja")).toBeVisible({ timeout: 5000 });
}

export async function addHomeGoal(page: Page) {
  await page
    .locator(".preview-score-buttons")
    .first()
    .getByRole("button")
    .first()
    .click({ force: true });
  const celebrationDialog = page.locator(".rs-modal");
  if (await celebrationDialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await celebrationDialog.waitFor({ state: "hidden", timeout: 5000 });
  }
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
  await page
    .getByRole("button", { name: "Tímastjórnun" })
    .click({ force: true });
  await page
    .locator(".time-adjust-btn")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
}

export async function closeTimeControl(page: Page) {
  await page.keyboard.press("Escape");
  await page.locator(".rs-modal").waitFor({ state: "hidden", timeout: 5000 });
}

// Register one confirmation-dialog handler per page: substantial backward
// time corrections (Tímastjórnun) now require explicit operator confirmation.
const confirmationHandlers = new WeakSet<Page>();
function acceptTimeCorrectionConfirmations(page: Page) {
  if (confirmationHandlers.has(page)) return;
  confirmationHandlers.add(page);
  page.on("dialog", async (dialog) => {
    if (dialog.message().includes("leiðrétta")) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });
}

export async function adjustTime(page: Page, amount: string) {
  acceptTimeCorrectionConfirmations(page);
  await openTimeControl(page);
  await page
    .locator(".time-adjust-btn", { hasText: amount })
    .click({ force: true });
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
