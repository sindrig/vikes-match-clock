import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { minimalPerimeterDisplay } from "../src/lib/venue.fixtures";
import type { SessionMutationHarness } from "./fixtures/session-mutation-harness";

test.describe.configure({ mode: "serial", timeout: 60000 });
const namespace = "vikes-match-clock-test";
const venue = "audit242-a";
const other = "audit242-b";
const email = "audit242-local@example.test";
const password = "audit242-emulator-only";
const owner = { Authorization: "Bearer owner" };
let uid: string;
const pageErrors = new Map<Page, string[]>();
const crest = readFileSync(
  resolve(__dirname, "../src/perimeter/__fixtures__/crest.png"),
);
const rules = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
) as unknown;

async function rest(method: string, path: string, data?: unknown) {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=${namespace}`,
    {
      method,
      headers: { ...owner, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response.json() as Promise<unknown>;
}
async function eligible(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.snapshot().eligible),
    )
    .toBe(true);
}
async function bootstrap(page: Page, login = true) {
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/e2e/fixtures/session-mutations.html?prefix=${venue}`);
  await page.waitForFunction(() => Boolean(window.sessionMutationHarness));
  expect(
    await page.evaluate(() => window.sessionMutationHarness.emulator),
  ).toBe(`http://127.0.0.1:9000?ns=${namespace}`);
  if (login) {
    await page.evaluate(
      ({ email, password }) =>
        window.sessionMutationHarness.login(email, password),
      { email, password },
    );
    await eligible(page);
  }
  await page.evaluate(() => window.sessionMutationHarness.reset());
}
async function noAttempts(page: Page, before: unknown) {
  const counts = await page.evaluate(
    () => window.sessionMutationHarness.counts,
  );
  expect(counts.ordinary).toBe(0);
  expect(counts.auditOnly).toBe(0);
  expect(counts.sdk).toEqual([]);
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
  expect(await rest("GET", `audit/${other}`)).toBeNull();
}

test.beforeAll(async () => {
  // The CLI can install rules in a different default namespace. Explicitly
  // load AND read back the rules in the namespace used by the browser SDK.
  await rest("PUT", ".settings/rules", rules);
  expect(await rest("GET", ".settings/rules")).toEqual(rules);
  const signup = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  expect(signup.ok).toBe(true);
  const account = (await signup.json()) as { localId: string };
  uid = account.localId;
  await rest("PUT", `auth/${uid}`, { [venue]: true, [other]: true });
  // Real Storage objects; the harness delays an already-resolved SDK media
  // promise so an offline test does not depend on retrying a Storage fetch.
  for (const path of [
    `${venue}/players/10-fagn.png`,
    `${venue}/perimeter/ad.png`,
  ]) {
    const response = await fetch(
      `http://127.0.0.1:9199/v0/b/${namespace}.appspot.com/o?name=${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "image/png" },
        body: crest,
      },
    );
    expect(response.ok).toBe(true);
  }
});
test.beforeEach(async () => {
  for (const location of [venue, other]) {
    await rest("PUT", `locations/${location}`, {
      label: location,
      perimeterDisplay: minimalPerimeterDisplay,
      screens: [{ key: "main", name: "Main" }],
    });
    await rest("PUT", `states/${location}`, {
      match: {
        homeTeam: "Víkingur R",
        awayTeam: "Valur",
        homeScore: location === venue ? 2 : 90,
        awayScore: 0,
        started: 0,
        countdown: false,
        halftimeCountdown: false,
        timeElapsed: 0,
        halfStops: [45, 90],
        matchType: "football",
      },
      controller: {
        view: "idle",
        assetView: "assets",
        playing: false,
        roster: { home: [], away: [] },
      },
      view: { background: "Default" },
      clubOverrides: {
        club: {
          name: "Original Club",
          clubId: "-1",
          logoUrl: "https://example.test/logo.svg",
          isOverride: false,
        },
      },
      perimeter: { enabled: true, state: "on", brightness: 20 },
    });
    await rest("PUT", `audit/${location}`, null);
  }
});
test.afterEach(async ({ page }, info) => {
  const counts: SessionMutationHarness["counts"] | null = await page
    .evaluate(() => window.sessionMutationHarness?.counts ?? null)
    .catch(() => null);
  await info.attach("session-command-proof", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        counts,
        state: await rest("GET", `states/${venue}`),
        other: await rest("GET", `states/${other}`),
        audit: await rest("GET", `audit/${venue}`),
        pageErrors: pageErrors.get(page) ?? [],
      },
      null,
      2,
    ),
  });
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("real SDK rules deny anonymous writes, unauthorized venues and forged audit identity", async ({
  page,
}) => {
  await bootstrap(page, false);
  expect(
    await page.evaluate(
      (path) => window.sessionMutationHarness.rawWrite(path, 99),
      `states/${venue}/perimeter/brightness`,
    ),
  ).toBe("denied");
  await page.evaluate(
    ({ email, password }) =>
      window.sessionMutationHarness.login(email, password),
    { email, password },
  );
  await eligible(page);
  expect(
    await page.evaluate(() =>
      window.sessionMutationHarness.rawWrite(
        "states/audit242-denied/perimeter/brightness",
        99,
      ),
    ),
  ).toBe("denied");
  expect(
    await page.evaluate(
      (path) =>
        window.sessionMutationHarness.rawWrite(path, {
          timestamp: { ".sv": "timestamp" },
          uid: "forged",
          sessionId: "test",
          action: "test",
          stateArea: "perimeter",
          changes: "{}",
        }),
      `audit/${venue}/forged`,
    ),
  ).toBe("denied");
  expect(await rest("GET", `states/${venue}/perimeter/brightness`)).toBe(20);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

for (const boundary of [
  "hide",
  "pagehide",
  "offline",
  "venue",
  "ABA",
  "hide-resume",
  "logout-login",
] as const) {
  test(`deferred scorer after ${boundary} produces zero submission/audit/SDK attempts`, async ({
    page,
  }) => {
    await bootstrap(page);
    await page.evaluate(() => {
      window.sessionMutationHarness.armMedia();
      window.sessionMutationHarness.openScorer();
    });
    await page.getByRole("button", { name: "7 Jón" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionMutationHarness.counts.mediaWaiting),
      )
      .toBe(1);
    const before = await rest("GET", `states/${venue}`);
    const otherBefore = await rest("GET", `states/${other}`);
    await page.evaluate(
      ({ boundary, other }) => {
        const h = window.sessionMutationHarness;
        h.reset();
        if (boundary === "hide") h.hide(true);
        if (boundary === "pagehide") h.pagehide();
        if (boundary === "offline") h.offline();
        if (boundary === "venue") h.venue(other);
        if (boundary === "ABA") h.aba(other);
        if (boundary === "hide-resume") {
          h.hide(true);
          h.hide(false);
        }
      },
      { boundary, other },
    );
    if (boundary === "logout-login") {
      await page.evaluate(() => window.sessionMutationHarness.logout());
      await page.evaluate(
        ({ email, password }) =>
          window.sessionMutationHarness.login(email, password),
        { email, password },
      );
      await eligible(page);
    }
    await page.evaluate(() => window.sessionMutationHarness.releaseMedia());
    await expect(page.getByRole("alert")).toContainText("Ekki tókst að vista");
    await noAttempts(page, before);
    expect(await rest("GET", `states/${other}`)).toEqual(otherBefore);
    if (boundary === "offline") {
      await page.evaluate(() => window.sessionMutationHarness.online());
      // Prove nothing was queued for later replay after reconnect.
      await rest("PATCH", `states/${venue}/match`, { awayScore: 1 });
      await expect
        .poll(() =>
          page.evaluate(
            () => window.sessionMutationHarness.snapshot().match.awayScore,
          ),
        )
        .toBe(1);
      expect(
        await page.evaluate(() => window.sessionMutationHarness.counts.sdk),
      ).toEqual([]);
      expect(await rest("GET", `audit/${venue}`)).toBeNull();
    }
  });
}

for (const boundary of ["hide-resume", "ABA"] as const) {
  test(`retained callbacks stay obsolete after ${boundary}`, async ({
    page,
  }) => {
    await bootstrap(page);
    const before = await rest("GET", `states/${venue}`);
    await page.evaluate(
      ({ boundary, other }) => {
        const h = window.sessionMutationHarness;
        h.retain();
        if (boundary === "ABA") h.aba(other);
        else {
          h.hide(true);
          h.hide(false);
        }
      },
      { boundary, other },
    );
    await eligible(page);
    expect(
      await page.evaluate(() => window.sessionMutationHarness.oldCommands()),
    ).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    await noAttempts(page, before);
  });
}

test("fresh scorer, brightness and auto config commit with accountable server-timestamped audits", async ({
  page,
}) => {
  await bootstrap(page);
  await page.evaluate(() => window.sessionMutationHarness.openScorer());
  await page.getByRole("button", { name: "7 Jón" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.sessionMutationHarness.fresh());
  await expect
    .poll(
      async () =>
        Object.keys((await rest("GET", `audit/${venue}`)) as object).length,
    )
    .toBe(5);
  const audit = Object.values(
    (await rest("GET", `audit/${venue}`)) as Record<
      string,
      { uid: string; timestamp: number; action: string; sessionId: string }
    >,
  );
  expect(audit.map((event) => event.action).sort()).toEqual(
    [
      "controller.render-asset",
      "perimeter.set-overlay",
      "match.add-goal",
      "perimeter.set-brightness",
      "perimeter.set-brightness-auto",
    ].sort(),
  );
  for (const event of audit) {
    expect(event.uid).toBe(uid);
    expect(event.sessionId).toBeTruthy();
    expect(typeof event.timestamp).toBe("number");
    expect(Math.abs(event.timestamp - Date.now())).toBeLessThan(30000);
  }
  expect(await rest("GET", `states/${venue}/perimeter/brightness`)).toBe(60);
  expect(await rest("GET", `states/${venue}/match/homeScore`)).toBe(3);
  const updatedAt = await rest(
    "GET",
    `states/${venue}/perimeter/brightnessAuto/updatedAt`,
  );
  expect(typeof updatedAt).toBe("number");
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts.ordinary),
  ).toBe(5);
});

test("a delayed blocked club save retains its dialog, text and selected file", async ({
  page,
}) => {
  await bootstrap(page);
  await page.evaluate(() => {
    window.sessionMutationHarness.armMedia();
    window.sessionMutationHarness.openClub();
  });
  const input = page.getByPlaceholder("Nafn liðs...");
  await expect(input).toHaveValue("Original Club");
  await input.fill("Unsaved club draft");
  await page.locator('input[type="file"][name="logo"]').setInputFiles({
    name: "draft.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Vista", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.mediaWaiting),
    )
    .toBe(1);
  const before = await rest("GET", `states/${venue}`);
  await page.evaluate(() => {
    const h = window.sessionMutationHarness;
    h.reset();
    h.hide(true);
    h.hide(false);
    h.releaseMedia();
  });
  await expect(page.getByRole("alert")).toContainText("Ekki tókst að vista");
  await expect(input).toHaveValue("Unsaved club draft");
  await expect(page.getByText("draft.svg", { exact: true })).toBeVisible();
  await noAttempts(page, before);
});

test("queued layout save invalidated before its microtask retains the add dialog and selected file", async ({
  page,
}) => {
  await bootstrap(page);
  await page.getByRole("button", { name: "Bæta við dálki" }).click();
  await page
    .locator(".perimeter-file-option")
    .filter({ hasText: "ad.png" })
    .click();
  const before = await rest("GET", `states/${venue}`);
  await page.evaluate(() => {
    const h = window.sessionMutationHarness;
    h.reset();
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".perimeter-add-dialog button",
      ),
    ].find((button) => button.textContent?.trim() === "Vista");
    if (!button) throw new Error("Missing layout save button");
    button.click();
    h.hide(true);
    h.hide(false);
  });
  await expect(page.getByRole("alert")).toContainText("Ekki tókst að vista");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.locator(".perimeter-file-option").filter({ hasText: "ad.png" }),
  ).toHaveClass(/selected/);
  await noAttempts(page, before);
});

test("conditional generations commit once and stale observations produce no audit", async ({
  page,
}) => {
  await bootstrap(page);
  const observed = {
    started: 12345,
    countdown: true,
    halftimeCountdown: false,
  };
  await rest("PATCH", `states/${venue}/match`, observed);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.sessionMutationHarness.snapshot().match.started,
      ),
    )
    .toBe(observed.started);
  expect(
    await page.evaluate(
      (observation) => window.sessionMutationHarness.conditional(observation),
      observed,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      (observation) => window.sessionMutationHarness.conditional(observation),
      observed,
    ),
  ).toBe(false);
  await expect
    .poll(
      async () =>
        Object.keys((await rest("GET", `audit/${venue}`)) as object).length,
    )
    .toBe(1);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts.auditOnly),
  ).toBe(1);
  expect(await rest("GET", `states/${venue}/match/countdown`)).toBe(false);
});

test("fresh create/add/play uses subscribed queue state within one browser event turn", async ({
  page,
}) => {
  await bootstrap(page);
  const id = await page.evaluate(() =>
    window.sessionMutationHarness.queueRoundTrip(),
  );
  await expect
    .poll(
      async () =>
        Object.keys((await rest("GET", `audit/${venue}`)) as object).length,
    )
    .toBe(3);
  expect(await rest("GET", `states/${venue}/controller/activeQueueId`)).toBe(
    id,
  );
  const current = (await rest(
    "GET",
    `states/${venue}/controller/currentAsset`,
  )) as { asset: { key: string } };
  expect(current.asset.key).toBe("fresh-player");
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts.ordinary),
  ).toBe(3);
});
