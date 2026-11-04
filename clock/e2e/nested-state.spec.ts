import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/nested-state-harness";

test.describe.configure({ mode: "serial", timeout: 60000 });
const namespace = "vikes-match-clock-test";
const venue = "audit246";
const email = "audit246@example.test";
const password = "audit246-emulator-only";
const rules: unknown = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
);
const pixel =
  "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
const photo = {
  type: "PLAYER",
  key: pixel,
  name: "Jón",
  number: "07",
  teamName: "Víkingur R",
  metadata: { source: "legacy" },
};
const noPhoto = {
  ...photo,
  type: "NO_IMAGE_PLAYER",
  key: "custom-11-Coach",
  name: "Coach",
  number: null,
  role: "Þjálfari",
};
const image = {
  type: "IMAGE",
  key: "audit246/images/sponsor.gif",
  url: pixel,
  name: "Sponsor.gif",
  metadata: { revision: 2 },
};
const outgoing = {
  name: "Jón Jónsson",
  id: 10,
  number: 7,
  show: true,
  note: { source: "old" },
};
const incoming = {
  name: "Óli Ólason",
  id: "foreign-11",
  number: "11",
  show: false,
};
const pageErrors = new Map<Page, string[]>();

async function rest(
  method: string,
  path: string,
  data?: unknown,
): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=${namespace}`,
    {
      method,
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response.json();
}
async function bootstrap(page: Page) {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await page.addInitScript(() =>
    localStorage.setItem("clock_listenPrefix", "audit246"),
  );
  await page.goto("/e2e/fixtures/nested-state.html");
  await page.waitForFunction(() => Boolean(window.nestedHarness));
  await page.evaluate(
    ({ email, password }) => window.nestedHarness.login(email, password),
    { email, password },
  );
  await expect
    .poll(() => page.evaluate(() => window.nestedHarness.snapshot().eligible))
    .toBe(true);
  await page.evaluate(() => window.nestedHarness.resetAttempts());
}
test.beforeAll(async () => {
  await rest("PUT", ".settings/rules", rules);
  expect(await rest("GET", ".settings/rules")).toEqual(rules);
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  expect(response.ok).toBe(true);
  const account = (await response.json()) as { localId: string };
  await rest("PUT", `auth/${account.localId}`, { [venue]: true });
});
test.beforeEach(async () => {
  await rest("PUT", `states/${venue}`, {
    match: {
      homeTeam: "Víkingur R",
      awayTeam: "Valur",
      started: 0,
      countdown: false,
      timeElapsed: 100,
      halfStops: [45, 90],
      matchType: "football",
    },
    controller: {
      playing: false,
      assetView: "assets",
      view: "match",
      roster: {
        home: { 7: outgoing, 10: { name: { bad: true } }, 25: incoming },
        away: { 40: { name: "李 明", id: "foreign", number: "A7" } },
      },
      queues: {
        q: {
          id: "q",
          name: "Saved",
          items: {
            4: image,
            7: { ...photo, name: { invalid: true } },
            15: noPhoto,
          },
          autoPlay: true,
          imageSeconds: 30,
          cycle: true,
          order: 0,
          note: { source: "archive" },
        },
      },
    },
    view: {
      vp: {
        key: "insidebig",
        name: "Indoor",
        style: { width: "512", height: "400", calibration: { revision: 2 } },
        fontSize: "100%",
      },
      background: "Default",
    },
    perimeter: { enabled: false, state: "off" },
  });
  await rest("PUT", `audit/${venue}`, null);
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("actual SDK/rules admit legacy malformed media while consumers stay safe and read-only", async ({
  page,
}) => {
  await bootstrap(page);
  await expect(page.getByText("Jón Jónsson")).toBeVisible();
  await expect(page.getByTestId("queue").getByText("Coach")).toBeVisible();
  for (const asset of [
    { ...photo, background: { bad: "url" } },
    { ...photo, name: { bad: "text" } },
    { ...photo, number: { bad: 7 } },
    { ...photo, overlay: { text: ["bad"] } },
    {
      type: "SUB",
      key: "bad-sub",
      subIn: { ...photo, background: ["bad.mp4"] },
      subOut: photo,
    },
    {
      type: "SUB",
      key: "bad-child",
      subIn: { type: "SUB", key: "nested", subIn: photo, subOut: photo },
      subOut: photo,
    },
    { type: "MOTM", key: "bad-motm", originalAssetType: "SUB" },
  ]) {
    // Deliberately use the authorized real SDK, not only rules-bypassing REST:
    // the existing rules accept these records, making reader validation vital.
    await page.evaluate(
      (asset) => window.nestedHarness.seedCurrent({ asset, time: 0.01 }),
      asset,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => window.nestedHarness.snapshot().controller.currentAsset,
        ),
      )
      .toBeNull();
    await page.evaluate(() => window.nestedHarness.resetAttempts());
    const before = await rest("GET", `states/${venue}`);
    await page.waitForTimeout(180);
    expect(
      await page.evaluate(() => window.nestedHarness.snapshot().attempts),
    ).toBe(0);
    expect(await rest("GET", `audit/${venue}`)).toBeNull();
    expect(await rest("GET", `states/${venue}`)).toEqual(before);
    await expect(page.getByTestId("current")).toBeEmpty();
  }
  const state = await page.evaluate(() => window.nestedHarness.snapshot());
  expect(state.controller.queues.q?.items).toHaveLength(2);
  expect(state.controller.roster.home).toHaveLength(2);
  expect(state.controller.roster.away[0]).toMatchObject({
    name: "李 明",
    number: "A7",
  });
});

test("mixed sparse penalties and rosters render without phantom lifecycle writes", async ({
  page,
}) => {
  await rest("PUT", `states/${venue}/match/home2min`, {
    5: {
      key: "valid",
      atTimeElapsed: 100,
      penaltyLength: 120000,
      note: "keep",
    },
    10: { key: "invalid", atTimeElapsed: [], penaltyLength: false },
  });
  await rest("PUT", `states/${venue}/controller/currentAsset`, {
    asset: noPhoto,
  });
  await rest("PUT", `states/${venue}/view/vp`, {
    key: "indoor",
    style: null,
    fontSize: {},
  });
  await bootstrap(page);
  await expect(page.getByTestId("current").getByText("Coach")).toBeVisible();
  const before = await rest("GET", `states/${venue}`);
  const snapshot = await page.evaluate(() => window.nestedHarness.snapshot());
  expect(snapshot.view.vp.style).toMatchObject({ width: 1920, height: 1080 });
  expect(snapshot.match.home2min).toEqual([
    { key: "valid", atTimeElapsed: 100, penaltyLength: 120000, note: "keep" },
  ]);
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => window.nestedHarness.snapshot().attempts),
  ).toBe(0);
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("substitution writes original sparse child keys, then real lifecycle cycles preserved valid media", async ({
  page,
}) => {
  await bootstrap(page);
  const stateBefore = (await rest("GET", `states/${venue}`)) as {
    controller: { roster: unknown; queues: { q: unknown } };
  };
  await page.evaluate(async () => {
    const api = window.nestedHarness.commands;
    const [outgoing, incoming] = api.controller.roster.home;
    await api.appendSubstitutionAndActivate({
      side: "home",
      outgoing: outgoing!,
      incoming: incoming!,
      asset: {
        type: "SUB",
        key: "prepared-sub",
        subIn: {
          type: "NO_IMAGE_PLAYER",
          key: "in",
          name: incoming!.name,
          number: incoming!.number,
          teamName: "Víkingur R",
        },
        subOut: {
          type: "NO_IMAGE_PLAYER",
          key: "off",
          name: outgoing!.name,
          number: outgoing!.number,
          teamName: "Víkingur R",
        },
      },
    });
  });
  expect(
    await rest("GET", `states/${venue}/controller/roster/home/7/show`),
  ).toBe(false);
  expect(
    await rest("GET", `states/${venue}/controller/roster/home/25/show`),
  ).toBe(true);
  expect(
    await rest("GET", `states/${venue}/controller/roster/home/7/note`),
  ).toEqual({ source: "old" });
  expect(await rest("GET", `states/${venue}/controller/queues/q`)).toEqual(
    stateBefore.controller.queues.q,
  );
  await page.evaluate(async () => {
    const api = window.nestedHarness.commands;
    await api.updateQueueSettings("q", { imageSeconds: 0.5 });
    api.playQueue("q");
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nestedHarness.snapshot().controller.currentAsset?.asset.key,
      ),
    )
    .toBe(image.key);
  const firstId = await page.evaluate(
    () => window.nestedHarness.snapshot().controller.currentAsset?.occurrenceId,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nestedHarness.snapshot().controller.currentAsset?.asset.key,
      ),
    )
    .toBe(noPhoto.key);
  expect(
    await page.evaluate(
      () =>
        window.nestedHarness.snapshot().controller.currentAsset?.occurrenceId,
    ),
  ).not.toBe(firstId);
  const after = (await rest("GET", `states/${venue}/controller`)) as {
    roster: unknown;
    queues: { q: { note: unknown; items: unknown[] } };
  };
  expect(after.queues.q.note).toEqual({ source: "archive" });
  expect(
    after.queues.q.items.some(
      (item) => (item as { metadata?: unknown }).metadata !== undefined,
    ),
  ).toBe(true);
  expect((after.roster as { home: { 10: unknown } }).home[10]).toEqual({
    name: { bad: true },
  });
});

test("legacy completion changes only current playback, and malformed present IDs remain ineligible", async ({
  page,
}) => {
  await rest("PUT", `states/${venue}/controller/currentAsset`, {
    asset: image,
  });
  await bootstrap(page);
  const before = (await rest("GET", `states/${venue}/controller`)) as Record<
    string,
    unknown
  >;
  expect(
    await page.evaluate(() =>
      window.nestedHarness.commands.completeAssetIfCurrent({
        occurrenceId: null,
        assetKey: "audit246/images/sponsor.gif",
        time: null,
        activeQueueId: null,
        playing: false,
      }),
    ),
  ).toBe(true);
  const { currentAsset, ...unchanged } = before;
  expect(currentAsset).toBeDefined();
  expect(await rest("GET", `states/${venue}/controller`)).toEqual(unchanged);
  const audits = await rest("GET", `audit/${venue}`);
  expect(Object.keys(audits as object)).toHaveLength(1);
  for (const occurrenceId of ["", " ", false, 7, { id: "bad" }]) {
    await page.evaluate(
      (occurrenceId) =>
        window.nestedHarness.seedCurrent({
          asset: { type: "IMAGE", key: "A" },
          occurrenceId,
        }),
      occurrenceId,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => window.nestedHarness.snapshot().controller.currentAsset,
        ),
      )
      .toBeNull();
    expect(
      await page.evaluate(() =>
        window.nestedHarness.commands.completeAssetIfCurrent({
          occurrenceId: null,
          assetKey: "A",
          time: null,
          activeQueueId: null,
          playing: false,
        }),
      ),
    ).toBe(false);
    expect(await rest("GET", `audit/${venue}`)).toEqual(audits);
  }
});

test("real Database and Storage SDK denials enforce the actual repository rules", async ({
  page,
}) => {
  await bootstrap(page);
  expect(await rest("GET", ".settings/rules")).toEqual(rules);
  const denied = await page.evaluate(async () => {
    const errors: string[] = [];
    for (const action of [
      window.nestedHarness.denied,
      window.nestedHarness.deniedStorage,
    ]) {
      try {
        await action();
        errors.push("allowed");
      } catch (error) {
        errors.push((error as { code: string }).code);
      }
    }
    return errors;
  });
  expect(denied).toEqual(["PERMISSION_DENIED", "storage/unauthorized"]);
  expect(await rest("GET", "states/audit246-denied")).toBeNull();
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("legacy file pairs and ad layouts backfill actual Storage generations while semantic overlays stay intact", async ({
  page,
}) => {
  await bootstrap(page);
  const stored = await page.evaluate(() => window.nestedHarness.seedMedia());
  const file = (index: number) => ({
    name: stored.paths[index]!.split("/").pop()!,
    source: `gs://${namespace}.appspot.com/${stored.paths[index]}`,
  });
  const overlay = {
    version: 1,
    id: "legacy-pair",
    columns: [{ durationMs: 10000, files: { "2": file(2), "4": file(3) } }],
  };
  const layout = {
    version: 1,
    revision: "legacy-base",
    columns: [{ id: "base", files: { "1": file(0), "3": file(1) } }],
  };
  const pair = {
    name: "Saved triple",
    files: { "2": file(2), "4": file(3) },
    mainScreenAsset: {
      type: "IMAGE",
      key: stored.paths[0],
      name: "base-left.gif",
      url: stored.mainScreenUrl,
    },
  };
  await rest("PATCH", `states/${venue}/perimeter`, {
    overlay,
    adLayout: layout,
    mediaPairs: { [stored.pairId]: pair },
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.nestedHarness.snapshot().perimeterOverlay?.id),
    )
    .toBe("legacy-pair");
  const saved = await page.evaluate(() => window.nestedHarness.snapshot());
  expect(saved.mediaPairs[stored.pairId]).toEqual(pair);
  expect(saved.perimeterAdLayout).toEqual(layout);
  const before = await rest("GET", `states/${venue}`);
  const filled = await page.evaluate(() => window.nestedHarness.qualifyMedia());
  expect(filled.overlay.version).toBe(1);
  if (filled.overlay.version !== 1) throw new Error("Expected file overlay");
  for (const item of [
    ...Object.values(filled.overlay.columns[0]!.files),
    ...Object.values(filled.layout.columns[0]!.files),
  ])
    expect(item.generation).toBe(stored.generations[item.source]);
  expect(filled.reads).toHaveLength(4);
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
  expect(
    await page.evaluate(() => window.nestedHarness.snapshot().attempts),
  ).toBe(0);

  const semantic = {
    version: 2 as const,
    kind: "goal-scorer" as const,
    id: "semantic-246",
    player: { id: "manual-7", name: "李 明", number: "0007" },
  };
  await page.evaluate(
    (command) => window.nestedHarness.commands.setPerimeterOverlay(command),
    semantic,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.nestedHarness.snapshot().perimeterOverlay?.version,
      ),
    )
    .toBe(2);
  const next = await page.evaluate(() => window.nestedHarness.qualifyMedia());
  expect(next.overlay).toEqual(semantic);
  expect(next.reads).toEqual([file(0).source, file(1).source]);
  expect(
    await rest("GET", `states/${venue}/perimeter/mediaPairs/${stored.pairId}`),
  ).toEqual(pair);
  expect(
    Object.keys((await rest("GET", `audit/${venue}`)) as object),
  ).toHaveLength(1);
});
