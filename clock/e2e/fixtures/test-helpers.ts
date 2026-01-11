import { test as base, expect, Page } from "@playwright/test";

export const ONE_MINUTE = 60000;
export const SECOND = 1000;

export const test = base.extend<{
  clockPage: Page;
}>({
  clockPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.clock.install({ time: new Date(2025, 3, 10, 12, 0, 0) });

    await use(page);
  },
});

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
