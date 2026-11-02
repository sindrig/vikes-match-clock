import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { minimalPerimeterDisplay } from "../src/lib/venue.fixtures";
import type { ControllerState, Asset, Player } from "../src/types";

test.describe.configure({ mode: "default", timeout: 60000 });
const ns = "vikes-match-clock-test";
const venue = "audit243-a";
const other = "audit243-b";
const email = "audit243-local@example.test";
const password = "audit243-emulator-only";
const owner = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};
const rules: unknown = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
);
const crest = readFileSync(
  resolve(__dirname, "../src/perimeter/__fixtures__/crest.png"),
);
const starter = { id: 10, name: "Jón Jónsson", number: 7, show: true };
const secondStarter = { id: 12, name: "Kári Kárason", number: 9, show: true };
const bench = { id: 11, name: "Óli Ólason", number: 8, show: false };
const secondBench = {
  id: 13,
  name: "Bjarni Bjarnason",
  number: 10,
  show: false,
};
const oldAsset: Asset = {
  type: "NO_IMAGE_PLAYER",
  key: "old-player",
  name: "Old lineup",
};
const firstAsset: Asset = {
  type: "NO_IMAGE_PLAYER",
  key: "first",
  name: "First",
};
const secondAsset: Asset = { ...firstAsset, key: "second", name: "Second" };
const subAsset: Asset = {
  type: "SUB",
  key: "sub-one",
  subIn: secondAsset,
  subOut: firstAsset,
};
const files = {
  "2": {
    name: "left.png",
    source: `gs://${ns}.appspot.com/${venue}/perimeter/left.png`,
    generation: "1",
  },
  "4": {
    name: "right.png",
    source: `gs://${ns}.appspot.com/${venue}/perimeter/right.png`,
    generation: "2",
  },
};
let uid: string;
let storageBefore: unknown;
let mappingBefore: unknown;
const errors = new Map<Page, string[]>();

async function rest(
  method: string,
  path: string,
  data?: unknown,
): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:9000/${path}.json?ns=${ns}`, {
    method,
    headers: owner,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response.json();
}
async function controller() {
  return (await rest("GET", `states/${venue}/controller`)) as ControllerState;
}
async function audits() {
  return Object.values(
    ((await rest("GET", `audit/${venue}`)) ?? {}) as Record<
      string,
      {
        action: string;
        uid: string;
        sessionId: string;
        timestamp: number;
        changes: string;
      }
    >,
  );
}
async function storageObjects() {
  const response = await fetch(
    `http://127.0.0.1:9199/v0/b/${ns}.appspot.com/o`,
    { headers: owner },
  );
  expect(response.ok).toBe(true);
  const result = (await response.json()) as {
    items?: Array<{ name: string; generation: string; size: string }>;
  };
  return (result.items ?? [])
    .filter((item) => item.name.startsWith(`${venue}/`))
    .map(({ name, generation, size }) => ({ name, generation, size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function eligible(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.snapshot().eligible),
    )
    .toBe(true);
}
async function bootstrap(page: Page, mode = "prepared", login = true) {
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(
    `/e2e/fixtures/session-mutations.html?prefix=${venue}&queues=${mode}`,
  );
  await page.waitForFunction(() => Boolean(window.sessionMutationHarness));
  expect(
    await page.evaluate(() => window.sessionMutationHarness.emulator),
  ).toBe(`http://127.0.0.1:9000?ns=${ns}`);
  if (login) {
    await page.evaluate(
      ({ email, password }) =>
        window.sessionMutationHarness.login(email, password),
      { email, password },
    );
    await eligible(page);
  }
  await page.evaluate((venue) => {
    window.sessionMutationHarness.observe(venue);
    window.sessionMutationHarness.reset();
  }, venue);
}
async function oneAudit(page: Page, action: string) {
  await expect.poll(async () => (await audits()).length).toBe(1);
  const [event] = await audits();
  expect(event).toMatchObject({ uid, action });
  expect(event?.sessionId).toBeTruthy();
  expect(Math.abs((event?.timestamp ?? 0) - Date.now())).toBeLessThan(30000);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts),
  ).toMatchObject({
    ordinary: 1,
    auditOnly: 0,
    sdk: ["merge:/"],
    succeeded: 1,
    failed: 0,
  });
}
async function noAttempts(page: Page, before: unknown, otherBefore: unknown) {
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts),
  ).toMatchObject({ ordinary: 0, auditOnly: 0, sdk: [] });
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await rest("GET", `states/${other}`)).toEqual(otherBefore);
  expect(await audits()).toEqual([]);
  expect(await rest("GET", `audit/${other}`)).toBeNull();
}
async function pickSub(
  page: Page,
  outgoing: Player = starter,
  incoming: Player = bench,
  side: "home" | "away" = "home",
) {
  await page
    .getByRole("button", { name: "Skipting", exact: true })
    .nth(side === "home" ? 0 : 1)
    .click();
  for (const player of [outgoing, incoming])
    await page
      .getByRole("button", {
        name: `${String(player.number)} ${player.name}`,
        exact: true,
      })
      .click();
}
async function pickAsset(page: Page, mode: string) {
  if (mode === "asset") {
    await page
      .locator('.controls input[type="text"]')
      .fill("https://example.test/selected");
    await page.getByRole("button", { name: "Bæta við", exact: true }).click();
  } else {
    await page.getByRole("img", { name: "selection.png", exact: true }).click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
}

test.beforeAll(async () => {
  // Explicitly load/read rules in the actual app namespace, then exercise SDK denials.
  await rest("PUT", ".settings/rules", rules);
  expect(await rest("GET", ".settings/rules")).toEqual(rules);
  let response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) {
    response = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
  }
  expect(response.ok).toBe(true);
  uid = ((await response.json()) as { localId: string }).localId;
  for (const path of [
    "players/10.png",
    "players/11.png",
    "players/12.png",
    "players/13.png",
    "images/selection.png",
    "perimeter/left.png",
    "perimeter/right.png",
    "unrelated/keep.png",
  ]) {
    const upload = await fetch(
      `http://127.0.0.1:9199/v0/b/${ns}.appspot.com/o?name=${encodeURIComponent(`${venue}/${path}`)}`,
      {
        method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "image/png" },
        body: crest,
      },
    );
    expect(upload.ok).toBe(true);
  }
  storageBefore = await storageObjects();
});
test.beforeEach(async () => {
  await rest("PUT", `auth/${uid}`, { [venue]: true, [other]: true });
  for (const location of [venue, other]) {
    await rest("PUT", `locations/${location}`, {
      label: location,
      perimeterDisplay: minimalPerimeterDisplay,
      screens: { main: { key: "main", name: "Main" } },
      config: { homeTeam: 2492 },
    });
    await rest("PUT", `states/${location}`, {
      match: {
        homeTeam: "Víkingur R",
        awayTeam: "Valur",
        homeTeamId: 2492,
        awayTeamId: 2570,
        homeScore: 2,
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
        playing: true,
        activeQueueId: "old",
        currentAsset: { asset: oldAsset, time: null },
        queues: {
          old: {
            id: "old",
            name: "Víkingur R",
            items: [oldAsset],
            cycle: false,
            autoPlay: true,
            imageSeconds: 5,
            order: 0,
          },
          sponsor: {
            id: "sponsor",
            name: "Sponsors",
            items: [oldAsset],
            cycle: true,
            autoPlay: true,
            imageSeconds: 6,
            order: 1,
          },
        },
        roster: {
          home: [starter, secondStarter, bench],
          away: [{ id: 20, name: "Away Player", number: 1, show: true }],
        },
      },
      view: { background: "Default", homeTeamRevealBackground: "reveal.png" },
      perimeter: {
        enabled: true,
        state: "on",
        brightness: 20,
        overlay: {
          version: 1,
          id: "legacy",
          columns: [{ durationMs: 1000, files }],
        },
        mediaPairs: { saved: { name: "Saved pair", files } },
      },
    });
    await rest("PUT", `audit/${location}`, null);
  }
  mappingBefore = await rest("GET", `locations/${venue}/perimeterDisplay`);
});
test.afterEach(async ({ page }, info) => {
  await info.attach("queue-intent-proof", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        counts: await page
          .evaluate(() => window.sessionMutationHarness?.counts ?? null)
          .catch(() => null),
        observations: await page
          .evaluate(() => window.sessionMutationHarness?.observations ?? [])
          .catch(() => []),
        state: await rest("GET", `states/${venue}`),
        other: await rest("GET", `states/${other}`),
        audit: await audits(),
        pageErrors: errors.get(page) ?? [],
        storage: await storageObjects(),
      },
      null,
      2,
    ),
  });
  expect(errors.get(page) ?? []).toEqual([]);
  expect(await storageObjects()).toEqual(storageBefore);
  expect(await rest("GET", `locations/${venue}/perimeterDisplay`)).toEqual(
    mappingBefore,
  );
  expect(
    await rest("GET", `states/${venue}/perimeter/mediaPairs/saved/files`),
  ).toEqual(files);
});

test("real SDK denial controls reject anonymous, wrong-venue and forged audit writes", async ({
  page,
}) => {
  await bootstrap(page, "prepared", false);
  expect(
    await page.evaluate(
      (venue) =>
        window.sessionMutationHarness.storageRead(
          `${venue}/unrelated/keep.png`,
        ),
      venue,
    ),
  ).toBe("denied");
  expect(
    await page.evaluate(
      (venue) =>
        window.sessionMutationHarness.storageWrite(
          `${venue}/images/denied.png`,
        ),
      venue,
    ),
  ).toBe("denied");
  expect(
    await page.evaluate(
      (venue) =>
        window.sessionMutationHarness.storageRead(`${venue}/players/10.png`),
      venue,
    ),
  ).toBe("accepted");
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
        "states/audit243-denied/perimeter/brightness",
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
          stateArea: "controller",
          changes: "{}",
        }),
      `audit/${venue}/forged`,
    ),
  ).toBe("denied");
  expect(await audits()).toEqual([]);
});

test("creation publishes all initial items to an independent SDK observer in one audited update", async ({
  page,
  browser,
}) => {
  await bootstrap(page);
  const observerContext = await browser.newContext();
  try {
    const observer = await observerContext.newPage();
    await bootstrap(observer, "prepared", false);
    await expect
      .poll(() =>
        observer.evaluate(
          () => window.sessionMutationHarness.observations.length,
        ),
      )
      .toBe(1);
    const id = await page.evaluate(
      ({ firstAsset, secondAsset }) =>
        window.sessionMutationHarness.commands.createQueue("Initial", [
          firstAsset,
          secondAsset,
        ]),
      { firstAsset, secondAsset },
    );
    await oneAudit(page, "controller.create-queue");
    await expect
      .poll(() =>
        observer.evaluate(
          (id) =>
            window.sessionMutationHarness.snapshot().controller.queues[id]
              ?.items.length,
          id,
        ),
      )
      .toBe(2);
    const observations = (await observer.evaluate(
      () => window.sessionMutationHarness.observations,
    )) as Array<{ controller: ControllerState }>;
    expect(observations).toHaveLength(2);
    expect(observations[0]?.controller.queues[id]).toBeUndefined();
    expect(observations[1]?.controller.queues[id]?.items).toEqual([
      firstAsset,
      secondAsset,
    ]);
    expect(errors.get(observer)).toEqual([]);
  } finally {
    await observerContext.close();
  }
});

test("team replacement preserves the old queue throughout real Storage preparation then publishes one complete replacement", async ({
  page,
}) => {
  await bootstrap(page, "team");
  const before = await controller();
  await page.evaluate(() => window.sessionMutationHarness.armMedia());
  await page
    .getByRole("button", { name: "Setja lið í biðröð" })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.mediaWaiting),
    )
    .toBe(2);
  expect(await controller()).toEqual(before);
  expect(await audits()).toEqual([]);
  await page.evaluate(() => window.sessionMutationHarness.releaseMedia());
  await oneAudit(page, "controller.replace-queue");
  const after = await controller();
  const replacement = Object.values(after.queues).find(
    (queue) => queue.name === "Víkingur R",
  );
  expect(replacement?.id).not.toBe("old");
  expect(replacement).toMatchObject({
    cycle: false,
    autoPlay: false,
    order: 2,
  });
  expect(replacement?.items.map((asset) => asset.name)).toEqual([
    starter.name,
    secondStarter.name,
  ]);
  expect(
    replacement?.items.every((asset) => asset.background === "reveal.png"),
  ).toBe(true);
  expect(after.queues.sponsor).toEqual(before.queues.sponsor);
  expect(after.activeQueueId ?? null).toBeNull();
  expect(after.currentAsset ?? null).toBeNull();
  expect(after.playing).toBe(false);
  const observations = (await page.evaluate(
    () => window.sessionMutationHarness.observations,
  )) as Array<{ controller: ControllerState }>;
  expect(observations).toHaveLength(2);
  for (const snapshot of observations)
    expect(
      Object.values(snapshot.controller.queues).filter(
        (queue) => queue.name === "Víkingur R",
      ),
    ).toHaveLength(1);
});

test("a preparation fault preserves the old queue with zero submission attempts", async ({
  page,
}) => {
  await bootstrap(page, "team");
  const before = await rest("GET", `states/${venue}`);
  const otherBefore = await rest("GET", `states/${other}`);
  await page.evaluate(() => window.sessionMutationHarness.failPreparation());
  await page
    .getByRole("button", { name: "Setja lið í biðröð" })
    .first()
    .click();
  await expect(page.locator(".error")).toHaveText(
    "Injected media preparation failure",
  );
  await noAttempts(page, before, otherBefore);
});

test("a real denied replacement leaves the old active queue and audit unchanged", async ({
  page,
}) => {
  await bootstrap(page, "team");
  const before = await rest("GET", `states/${venue}`);
  await page.evaluate(() => window.sessionMutationHarness.armMedia());
  await page
    .getByRole("button", { name: "Setja lið í biðröð" })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.mediaWaiting),
    )
    .toBe(2);
  await rest("PUT", `auth/${uid}/${venue}`, false);
  await page.evaluate(() => window.sessionMutationHarness.releaseMedia());
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.failed),
    )
    .toBe(1);
  await expect(page.locator(".error")).not.toBeEmpty();
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await audits()).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.sessionMutationHarness.snapshot().controller.queues.old
            ?.items[0]?.key,
      ),
    )
    .toBe("old-player");
});

test("a real denied creation rejects without an apparently valid ID", async ({
  page,
}) => {
  await bootstrap(page);
  const before = await rest("GET", `states/${venue}`);
  await rest("PUT", `auth/${uid}/${venue}`, false);
  const result = await page.evaluate(
    (firstAsset) =>
      window.sessionMutationHarness.commands
        .createQueue("Denied", [firstAsset])
        .then(
          (id) => ({ outcome: "resolved", id }),
          () => ({ outcome: "rejected" }),
        ),
    firstAsset,
  );
  expect(result).toEqual({ outcome: "rejected" });
  expect(await rest("GET", `states/${venue}`)).toEqual(before);
  expect(await audits()).toEqual([]);
});

for (const mode of ["asset", "media"]) {
  test(`${mode} picker creates its prepared items in one audited mutation`, async ({
    page,
  }) => {
    await bootstrap(page, mode);
    await pickAsset(page, mode);
    await page.getByRole("button", { name: "Ný biðröð" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await oneAudit(page, "controller.create-queue");
    const created = Object.values((await controller()).queues).find(
      (queue) => queue.name === "Biðröð 3",
    );
    expect(created?.items).toHaveLength(1);
    expect(created?.items[0]?.type).toBe(mode === "asset" ? "URL" : "IMAGE");
  });

  test(`${mode} picker retains a failed save and retries explicitly without an empty intermediate queue`, async ({
    page,
  }) => {
    await bootstrap(page, mode);
    const before = await controller();
    await pickAsset(page, mode);
    await rest("PUT", `auth/${uid}/${venue}`, false);
    await page.getByRole("button", { name: "Ný biðröð" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(await controller()).toEqual(before);
    expect(await audits()).toEqual([]);
    await rest("PUT", `auth/${uid}/${venue}`, true);
    await page.getByRole("button", { name: "Ný biðröð" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await audits()).length).toBe(1);
    expect(
      Object.values((await controller()).queues).filter(
        (queue) => queue.name === "Biðröð 3",
      ),
    ).toHaveLength(1);
    expect(
      await page.evaluate(() => window.sessionMutationHarness.counts),
    ).toMatchObject({ ordinary: 2, failed: 1, succeeded: 1 });
  });
}

test("substitution publishes the queue, activation and both roster flags together after Storage prepares", async ({
  page,
}) => {
  await bootstrap(page, "sub");
  const before = await controller();
  await page.evaluate(() => window.sessionMutationHarness.armMedia());
  await pickSub(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.mediaWaiting),
    )
    .toBe(2);
  expect(await controller()).toEqual(before);
  await page.evaluate(() => window.sessionMutationHarness.releaseMedia());
  await oneAudit(page, "controller.append-substitution-and-activate");
  const after = await controller();
  const queue = Object.values(after.queues).find(
    (queue) => queue.name === "Skiptingar",
  );
  expect(queue?.items).toHaveLength(1);
  expect(queue?.items[0]).toMatchObject({
    type: "SUB",
    subIn: { fullName: bench.name, name: "Óli", background: "reveal.png" },
    subOut: { fullName: starter.name, name: "Jón", background: "reveal.png" },
  });
  expect(after.activeQueueId).toBe(queue?.id);
  expect(after.currentAsset).toEqual(before.currentAsset);
  expect(after.playing).toBe(before.playing);
  expect(after.roster.away).toEqual(before.roster.away);
  const observations = (await page.evaluate(
    () => window.sessionMutationHarness.observations,
  )) as Array<{ controller: ControllerState }>;
  expect(observations).toHaveLength(2);
  expect(
    observations.map((snapshot) =>
      snapshot.controller.roster.home.map((player) => player.show),
    ),
  ).toEqual([
    [true, true, false],
    [false, true, true],
  ]);
});

for (const side of ["home", "away"] as const) {
  for (const firstToFinish of ["first", "second"] as const) {
    for (const conflicting of [true, false]) {
      test(`${side} pending ${conflicting ? "conflicting" : "independent"} substitutions complete ${firstToFinish} first`, async ({
        page,
        browser,
      }) => {
        await rest("PUT", `states/${venue}/controller/roster/${side}`, [
          starter,
          secondStarter,
          bench,
          secondBench,
        ]);
        await bootstrap(page, side === "home" ? "sub" : "team");
        const observerContext = await browser.newContext();
        try {
          const observer = await observerContext.newPage();
          await bootstrap(observer, "prepared", false);
          await expect
            .poll(() =>
              observer.evaluate(
                () => window.sessionMutationHarness.observations.length,
              ),
            )
            .toBe(1);
          const before = await rest("GET", `states/${venue}`);
          const otherBefore = await rest("GET", `states/${other}`);
          await page.evaluate(() =>
            window.sessionMutationHarness.armMedia("first"),
          );
          await pickSub(page, starter, bench, side);
          await expect
            .poll(() =>
              page.evaluate(
                () => window.sessionMutationHarness.counts.mediaWaiting,
              ),
            )
            .toBe(2);
          await page.evaluate(() =>
            window.sessionMutationHarness.armMedia("second"),
          );
          const secondOutgoing = conflicting ? starter : secondStarter;
          await pickSub(page, secondOutgoing, secondBench, side);
          await expect
            .poll(() =>
              page.evaluate(
                () => window.sessionMutationHarness.counts.mediaWaiting,
              ),
            )
            .toBe(4);
          await noAttempts(page, before, otherBefore);
          await page.evaluate(
            (id) => window.sessionMutationHarness.releaseMedia(id),
            firstToFinish,
          );
          await oneAudit(page, "controller.append-substitution-and-activate");
          const afterFirst = await controller();
          const firstCounts = await page.evaluate(
            () => window.sessionMutationHarness.counts,
          );
          const firstAudits = await audits();
          await page.evaluate(
            (id) => window.sessionMutationHarness.releaseMedia(id),
            firstToFinish === "first" ? "second" : "first",
          );
          if (conflicting) {
            await expect(page.getByRole("alert")).toContainText(
              "Leikmannahópur hefur breyst",
            );
            expect(await controller()).toEqual(afterFirst);
            expect(await audits()).toEqual(firstAudits);
            expect(
              await page.evaluate(() => window.sessionMutationHarness.counts),
            ).toEqual(firstCounts);
          } else {
            await expect.poll(async () => (await audits()).length).toBe(2);
            await expect
              .poll(() =>
                page.evaluate(
                  () => window.sessionMutationHarness.counts.succeeded,
                ),
              )
              .toBe(2);
            expect(
              await page.evaluate(() => window.sessionMutationHarness.counts),
            ).toMatchObject({
              ordinary: 2,
              auditOnly: 0,
              sdk: ["merge:/", "merge:/"],
              failed: 0,
            });
            await expect(page.getByRole("alert")).toHaveCount(0);
          }
          const successful = conflicting ? 1 : 2;
          await expect
            .poll(() =>
              observer.evaluate(
                () => window.sessionMutationHarness.observations.length,
              ),
            )
            .toBe(successful + 1);
          const observations = (await observer.evaluate(
            () => window.sessionMutationHarness.observations,
          )) as Array<{ controller: ControllerState }>;
          const completed =
            firstToFinish === "first"
              ? [bench, secondBench]
              : [secondBench, bench];
          for (const [index, { controller: state }] of observations.entries()) {
            expect(state.roster[side].filter((p) => p.show)).toHaveLength(2);
            const queue = Object.values(state.queues).find(
              (q) => q.name === "Skiptingar",
            );
            expect(
              queue?.items.map((asset) => asset.subIn?.fullName) ?? [],
            ).toEqual(completed.slice(0, index).map((p) => p.name));
            if (index > 0) {
              expect(state.activeQueueId).toBe(queue?.id);
              expect(queue?.cycle).toBe(false);
            }
            expect(state.currentAsset).toEqual(afterFirst.currentAsset);
            expect(state.playing).toBe(true);
          }
          const final = await controller();
          expect(
            final.roster[side].filter((p) => p.show).map((p) => p.id),
          ).toEqual(
            conflicting
              ? [secondStarter.id, completed[0]?.id]
              : [bench.id, secondBench.id],
          );
          expect(await rest("GET", `states/${other}`)).toEqual(otherBefore);
          await test.info().attach("independent-substitution-observer", {
            contentType: "application/json",
            body: JSON.stringify(observations, null, 2),
          });
        } finally {
          await observerContext.close();
        }
      });
    }
  }
  for (const changed of ["outgoing", "incoming", "number"] as const) {
    test(`${side} substitution rejects current ${changed} eligibility changed during preparation without any write`, async ({
      page,
    }) => {
      await rest("PUT", `states/${venue}/controller/roster/${side}`, [
        starter,
        bench,
      ]);
      await bootstrap(page, side === "home" ? "sub" : "team");
      await page.evaluate(() => window.sessionMutationHarness.armMedia());
      await pickSub(page, starter, bench, side);
      await expect
        .poll(() =>
          page.evaluate(
            () => window.sessionMutationHarness.counts.mediaWaiting,
          ),
        )
        .toBe(2);
      const path =
        changed === "outgoing"
          ? "0/show"
          : changed === "incoming"
            ? "1/show"
            : "1/number";
      await rest(
        "PUT",
        `states/${venue}/controller/roster/${side}/${path}`,
        changed === "incoming" ? true : changed === "outgoing" ? false : null,
      );
      await expect
        .poll(() =>
          page.evaluate(
            ({ side, changed }) => {
              const players =
                window.sessionMutationHarness.snapshot().controller.roster[
                  side
                ];
              if (changed === "outgoing") return players[0]?.show;
              if (changed === "incoming") return players[1]?.show;
              return players[1]?.number ?? null;
            },
            { side, changed },
          ),
        )
        .toBe(
          changed === "incoming" ? true : changed === "outgoing" ? false : null,
        );
      const before = await rest("GET", `states/${venue}`);
      const otherBefore = await rest("GET", `states/${other}`);
      await page.evaluate(() => window.sessionMutationHarness.releaseMedia());
      await expect(page.getByRole("alert")).toContainText(
        "Leikmannahópur hefur breyst",
      );
      await noAttempts(page, before, otherBefore);
    });
  }
}

test("same-turn SDK echoes reject reused outgoing and incoming players while independent and ordered substitutions commit", async ({
  page,
}) => {
  await rest("PUT", `states/${venue}/controller/roster/home`, [
    starter,
    secondStarter,
    bench,
    secondBench,
  ]);
  await bootstrap(page);
  const results = await page.evaluate(
    async ({ starter, secondStarter, bench, secondBench, subAsset }) => {
      const api = window.sessionMutationHarness.commands;
      const submit = (outgoing: Player, incoming: Player, key: string) =>
        api.appendSubstitutionAndActivate({
          side: "home",
          outgoing,
          incoming,
          asset: { ...subAsset, key },
        });
      return (
        await Promise.allSettled([
          submit(starter, bench, "first"),
          submit(starter, secondBench, "reused-outgoing"),
          submit(secondStarter, bench, "reused-incoming"),
          submit(secondStarter, secondBench, "independent"),
          submit(bench, starter, "ordered"),
        ])
      ).map((result) => result.status);
    },
    { starter, secondStarter, bench, secondBench, subAsset },
  );
  expect(results).toEqual([
    "fulfilled",
    "rejected",
    "rejected",
    "fulfilled",
    "fulfilled",
  ]);
  expect(await audits()).toHaveLength(3);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts),
  ).toMatchObject({
    ordinary: 3,
    auditOnly: 0,
    sdk: ["merge:/", "merge:/", "merge:/"],
    succeeded: 3,
    failed: 0,
  });
  const final = await controller();
  expect(final.roster.home.map((p) => p.show)).toEqual([
    true,
    false,
    false,
    true,
  ]);
  expect(
    Object.values(final.queues)
      .find((q) => q.name === "Skiptingar")
      ?.items.map((a) => a.key),
  ).toEqual(["first", "independent", "ordered"]);
});

test("rename, settings and ordering preserve remote items/autoplay not yet delivered to the writer", async ({
  page,
}) => {
  let paused = false;
  const held: Array<() => void> = [];
  await page.routeWebSocket(/127\.0\.0\.1:9000/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const send = () => socket.send(message);
      if (paused) held.push(send);
      else send();
    });
  });
  await bootstrap(page);
  paused = true;
  await rest("PATCH", `states/${venue}/controller/queues/old`, {
    items: [secondAsset],
    autoPlay: false,
  });
  await page.evaluate(() => {
    const commands = window.sessionMutationHarness.commands;
    commands.renameQueue("old", "Renamed");
    commands.updateQueueSettings("old", { imageSeconds: 8 });
    commands.reorderQueues(["sponsor", "old"]);
  });
  await expect
    .poll(async () => (await controller()).queues.old?.name)
    .toBe("Renamed");
  await expect.poll(async () => (await audits()).length).toBe(3);
  paused = false;
  for (const send of held.splice(0)) send();
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.counts.succeeded),
    )
    .toBe(3);
  expect((await controller()).queues.old).toMatchObject({
    items: [secondAsset],
    autoPlay: false,
    imageSeconds: 8,
    order: 1,
  });
  for (const event of await audits()) {
    const paths = Object.keys(JSON.parse(event.changes) as object);
    expect(paths).not.toContain("queues/old");
    expect(paths).not.toContain("queues/old/items");
    expect(paths).not.toContain("queues/old/autoPlay");
  }
});

for (const version of [1, 2]) {
  test(`queue intents preserve version-${version} web media, saved pairs and mappings`, async ({
    page,
  }) => {
    if (version === 2)
      await rest("PUT", `states/${venue}/perimeter/overlay`, {
        version: 2,
        id: "semantic",
        kind: "goal-scorer",
        player: { id: "10", name: starter.name, number: "7" },
      });
    const before = await rest("GET", `states/${venue}/perimeter`);
    await bootstrap(page);
    await page.evaluate(
      async ({ firstAsset, starter, bench, subAsset }) => {
        const api = window.sessionMutationHarness.commands;
        await api.createQueue("Media preservation", [firstAsset]);
        await api.replaceQueue("Víkingur R", [firstAsset], { cycle: false });
        await api.appendSubstitutionAndActivate({
          side: "home",
          outgoing: starter,
          incoming: bench,
          asset: subAsset,
        });
      },
      { firstAsset, starter, bench, subAsset },
    );
    expect(await rest("GET", `states/${venue}/perimeter`)).toEqual(before);
    expect(await audits()).toHaveLength(3);
  });
}

test("rapid same-turn creates and substitutions use real synchronous SDK echoes", async ({
  page,
}) => {
  await bootstrap(page);
  const ids = await page.evaluate(
    async ({ firstAsset, secondAsset, starter, bench, subAsset }) => {
      const api = window.sessionMutationHarness.commands;
      const first = api.createQueue("Rapid first", [firstAsset]);
      const second = api.createQueue("Rapid second", [secondAsset]);
      const subOne = api.appendSubstitutionAndActivate({
        side: "home",
        outgoing: starter,
        incoming: bench,
        asset: subAsset,
      });
      const subTwo = api.appendSubstitutionAndActivate({
        side: "home",
        outgoing: bench,
        incoming: starter,
        asset: {
          ...subAsset,
          key: "sub-two",
          subIn: subAsset.subOut,
          subOut: subAsset.subIn,
        },
      });
      await Promise.all([subOne, subTwo]);
      return Promise.all([first, second]);
    },
    { firstAsset, secondAsset, starter, bench, subAsset },
  );
  const queues = (await controller()).queues;
  expect(ids.map((id) => queues[id]?.order)).toEqual([2, 3]);
  const subs = Object.values(queues).filter(
    (queue) => queue.name === "Skiptingar",
  );
  expect(subs).toHaveLength(1);
  expect(subs[0]?.order).toBe(4);
  expect(subs[0]?.items.map((asset) => asset.key)).toEqual([
    "sub-one",
    "sub-two",
  ]);
  expect(await audits()).toHaveLength(4);
  expect((await controller()).roster.home).toEqual([
    starter,
    secondStarter,
    bench,
  ]);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts.ordinary),
  ).toBe(4);
});

test("cycling, item order, autoplay and final empty deletion keep their established playback behavior", async ({
  page,
}) => {
  await bootstrap(page);
  const cycle = await page.evaluate(
    ({ firstAsset, secondAsset }) =>
      window.sessionMutationHarness.commands.createQueue("Cycle", [
        firstAsset,
        secondAsset,
      ]),
    { firstAsset, secondAsset },
  );
  await page.evaluate((id) => {
    const api = window.sessionMutationHarness.commands;
    api.updateQueueSettings(id, { autoPlay: true, imageSeconds: 7 });
    api.playQueue(id);
  }, cycle);
  await expect
    .poll(async () => (await controller()).currentAsset?.asset.key)
    .toBe("first");
  expect(
    (await controller()).queues[cycle]?.items.map((asset) => asset.key),
  ).toEqual(["second", "first"]);
  expect(await controller()).toMatchObject({
    playing: true,
    currentAsset: { time: 7 },
  });
  await page.evaluate(() =>
    window.sessionMutationHarness.commands.showNextAsset(),
  );
  await expect
    .poll(async () => (await controller()).currentAsset?.asset.key)
    .toBe("second");
  const once = await page.evaluate(
    ({ firstAsset, secondAsset }) =>
      window.sessionMutationHarness.commands.createQueue(
        "Once",
        [firstAsset, secondAsset],
        { cycle: false },
      ),
    { firstAsset, secondAsset },
  );
  await page.evaluate((id) => {
    const api = window.sessionMutationHarness.commands;
    api.playQueue(id);
    api.showNextAsset();
  }, once);
  await expect
    .poll(async () => (await controller()).currentAsset?.asset.key)
    .toBe("second");
  expect((await controller()).queues[once]?.items ?? []).toEqual([]);
  expect((await controller()).playing).toBe(false);
  await page.evaluate(() =>
    window.sessionMutationHarness.commands.showNextAsset(),
  );
  await expect
    .poll(async () => (await controller()).queues[once])
    .toBeUndefined();
  expect((await controller()).activeQueueId ?? null).toBeNull();
  expect((await controller()).currentAsset ?? null).toBeNull();
  expect(
    (await controller()).queues[cycle]?.items.map((asset) => asset.key),
  ).toEqual(["first", "second"]);
});

for (const mode of ["team", "sub", "prepared"]) {
  for (const boundary of [
    "hide-resume",
    "pagehide",
    "offline",
    "venue",
    "ABA",
    "logout-login",
  ]) {
    test(`${mode} prepared before ${boundary} cannot retarget or submit any state/audit write`, async ({
      page,
    }) => {
      await bootstrap(page, mode);
      await page.evaluate(() => window.sessionMutationHarness.armMedia());
      if (mode === "team")
        await page
          .getByRole("button", { name: "Setja lið í biðröð" })
          .first()
          .click();
      else if (mode === "sub") await pickSub(page);
      else
        await page.evaluate(() =>
          window.sessionMutationHarness.preparePicker(),
        );
      await expect
        .poll(() =>
          page.evaluate(
            () => window.sessionMutationHarness.counts.mediaWaiting,
          ),
        )
        .toBe(mode === "prepared" ? 1 : 2);
      const before = await rest("GET", `states/${venue}`);
      const otherBefore = await rest("GET", `states/${other}`);
      await page.evaluate(
        ({ boundary, other }) => {
          const h = window.sessionMutationHarness;
          h.reset();
          if (boundary === "hide-resume") {
            h.hide(true);
            h.hide(false);
          }
          if (boundary === "pagehide") h.pagehide();
          if (boundary === "offline") h.offline();
          if (boundary === "venue") h.venue(other);
          if (boundary === "ABA") h.aba(other);
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
      if (mode === "prepared") {
        await page.getByRole("button", { name: "Ný biðröð" }).click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
          "lota eða tenging",
        );
      } else if (mode === "team")
        await expect(page.locator(".error")).toContainText("lota eða tenging");
      else
        await expect(page.getByRole("alert").last()).toContainText(
          "lota eða tenging",
        );
      await noAttempts(page, before, otherBefore);
      if (boundary === "offline") {
        await page.evaluate(() => window.sessionMutationHarness.online());
        // No SDK submission existed to replay; allow the real reconnect to settle.
        await expect
          .poll(() =>
            page.evaluate(
              () => window.sessionMutationHarness.snapshot().connected,
            ),
          )
          .toBe(true);
        await noAttempts(page, before, otherBefore);
      }
    });
  }
}
