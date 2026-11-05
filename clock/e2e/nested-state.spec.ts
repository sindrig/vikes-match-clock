import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type {} from "./fixtures/emulator-target";
import { beforeDeadline } from "./fixtures/fixture-sdk-producers";
import {
  assertBrowserEmulatorTarget,
  assertLocalFixtureUrl,
  EMULATOR_PROJECT,
  initializeExecutionToken,
  LocalFixture,
  requireEmulatorSelection,
} from "./fixtures/local-fixture";
import {
  assertNestedFixtureTarget,
  nestedMediaPaths,
  nestedPairId,
  parseNestedFixtureInput,
  type NestedFixtureInput,
  type NestedFixtureRole,
} from "./fixtures/nested-fixture-input";
import type {} from "./fixtures/nested-state-harness";

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
const imageTemplate = {
  type: "IMAGE",
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

const namespace = EMULATOR_PROJECT;
const password = "audit246-emulator-only";
const rules: unknown = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
);

// This installer is GLOBAL to the namespace. Owned venues do not isolate it;
// the entire emulator/browser lifecycle remains externally serialized.
async function canonicalRules(method: "GET" | "PUT") {
  requireEmulatorSelection();
  const url = `http://127.0.0.1:9000/.settings/rules.json?ns=${namespace}`;
  assertLocalFixtureUrl(url);
  const response = await fetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    ...(method === "PUT" ? { body: JSON.stringify(rules) } : {}),
  });
  if (response.status !== 200)
    throw new Error(`Canonical nested rules: HTTP ${response.status}.`);
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error("Oversized rules response.");
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

async function verifyServedTarget(page: Page, input: NestedFixtureInput) {
  await page.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/e2e/fixtures/emulator-target.html");
  await page.waitForFunction(() => Boolean(window.__e2eEmulatorTarget));
  assertBrowserEmulatorTarget(
    await page.evaluate(() => window.__e2eEmulatorTarget),
  );
  const params = new URLSearchParams({
    fixture: input.fixtureId,
    prefix: input.venue,
    denied: input.deniedVenue,
    role: input.role,
  });
  const url = new URL(
    `/e2e/fixtures/nested-state.html?${params}`,
    base.info().project.use.baseURL,
  );
  expect(parseNestedFixtureInput(url)).toEqual(input);
  await page.goto(url.href);
  await page.waitForFunction(() => Boolean(window.nestedHarness));
  const descriptor = await page.evaluate(() => ({
    input: window.nestedHarness.input,
    target: window.nestedHarness.target,
  }));
  assertNestedFixtureTarget(descriptor.target);
  expect(descriptor.input).toEqual(input);
}

async function ownedNested(browser: Browser) {
  requireEmulatorSelection();
  const fixture = new LocalFixture(
    initializeExecutionToken(),
    process.env.PW_TEST_WORKER_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0",
  );
  const venue = fixture.venue("nested");
  const deniedVenue = fixture.venue("nested-denied");
  const email = fixture.email("nested");
  const image = { ...imageTemplate, key: `${venue}/images/sponsor.gif` };
  const clients: {
    context: BrowserContext;
    page?: Page;
    input?: NestedFixtureInput;
    errors: string[];
    finish?: () => void;
    fail?: () => void;
    producer?: Promise<void>;
  }[] = [];
  let uid = "";
  let targetAdmitted = false;
  const rest = (
    method: "GET" | "PUT" | "DELETE",
    path: string,
    data?: unknown,
  ) => fixture.database(method, path, data);
  const client = async (role: NestedFixtureRole) => {
    const context = await browser.newContext();
    const entry: (typeof clients)[number] = { context, errors: [] };
    clients.push(entry);
    const page = await context.newPage();
    entry.page = page;
    page.on("pageerror", (error) => entry.errors.push(error.message));
    const url = new URL(
      "/e2e/fixtures/nested-state.html",
      base.info().project.use.baseURL,
    );
    url.search = new URLSearchParams({
      fixture: fixture.id,
      prefix: venue,
      denied: deniedVenue,
      role,
    }).toString();
    entry.input = parseNestedFixtureInput(url);
    await verifyServedTarget(page, entry.input);
    return page;
  };
  const settle = async (...pages: Page[]) => {
    for (const page of pages)
      await expect
        .poll(() => page.evaluate(() => window.nestedHarness.lifecycle()))
        .toMatchObject({
          pendingCommands: 0,
          pendingAudits: 0,
          pendingSdk: 0,
          failures: [],
        });
  };
  const bootstrap = async (page: Page) => {
    const entry = clients.find((entry) => entry.page === page);
    if (!entry?.input || entry.producer)
      throw new Error("Unowned or already initialized nested page.");
    const lifetime = new Promise<void>((resolve, reject) => {
      entry.finish = resolve;
      entry.fail = () => reject(new Error("Nested client outcome uncertain."));
    });
    entry.producer = fixture.trackMutation(() => lifetime);
    void entry.producer.catch(() => {
      /* LocalFixture retains the uncertain producer. */
    });
    await page.evaluate(
      (input) => window.nestedHarness.initialize(input),
      entry.input,
    );
    if (entry.input.role !== "anonymous")
      await page.evaluate(
        ({ email, password, uid }) =>
          window.nestedHarness.login(email, password, uid),
        { email, password, uid },
      );
    await expect
      .poll(() => page.evaluate(() => window.nestedHarness.status().connected))
      .toBe(true);
    if (entry.input.role === "controller") {
      await expect
        .poll(() => page.evaluate(() => window.nestedHarness.status()))
        .toMatchObject({ eligible: true, uid });
      await settle(page);
      await page.evaluate(() => window.nestedHarness.resetAttempts());
    } else if (entry.input.role === "observer") {
      await expect
        .poll(() =>
          page.evaluate(() => window.nestedHarness.status().stateDeliveries),
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(() => window.nestedHarness.status().auditDeliveries),
        )
        .toBeGreaterThan(0);
      expect(await page.evaluate(() => window.nestedHarness.status().uid)).toBe(
        uid,
      );
    } else
      expect(
        await page.evaluate(() => window.nestedHarness.status().uid),
      ).toBeNull();
  };
  const cleanup = async () => {
    const deadline = Date.now() + 20000;
    const failures: string[] = [];
    for (const entry of [...clients].sort(
      (a, b) =>
        Number(a.input?.role === "observer") -
        Number(b.input?.role === "observer"),
    )) {
      if (entry.producer && entry.page) {
        try {
          const disposal = entry.page.evaluate(
            (timeout) => window.nestedHarness.dispose(timeout),
            Math.max(1, deadline - Date.now()),
          );
          // A deadline may already have expired when the original promise rejects.
          // Observe that rejection without treating it as successful completion.
          void disposal.catch(() => undefined);
          await beforeDeadline(disposal, deadline);
          entry.finish?.();
          await beforeDeadline(entry.producer, deadline);
        } catch {
          entry.fail?.();
          failures.push("Nested client disposal incomplete.");
        }
      }
      try {
        const closing = entry.context.close();
        void closing.catch(() => undefined);
        await beforeDeadline(closing, deadline);
      } catch {
        failures.push("Nested context close incomplete.");
      }
      if (entry.errors.length) failures.push("Nested page error.");
    }
    if (targetAdmitted) {
      try {
        if (Date.now() >= deadline)
          throw new Error("Nested cleanup deadline expired.");
        const cleaning = fixture.cleanup(deadline - Date.now());
        void cleaning.catch(() => undefined);
        await beforeDeadline(cleaning, deadline);
      } catch {
        failures.push("Nested owned cleanup incomplete.");
      }
    }
    if (failures.length) throw new Error(failures.join("\n"));
  };
  try {
    const page = await client("controller");
    targetAdmitted = true;
    const invitations = await rest("GET", "invitations");
    for (const value of Object.values(
      invitations === null ? {} : record(invitations),
    )) {
      if (
        value !== null &&
        typeof value === "object" &&
        "email" in value &&
        typeof value.email === "string" &&
        value.email.trim().toLowerCase() === email
      )
        throw new Error("Nested email already has an invitation.");
    }
    uid = await fixture.createUser(email, password);
    await rest("PUT", `auth/${uid}/${venue}`, true);
    expect(await rest("GET", `auth/${uid}/${venue}`)).toBe(true);
    expect(await rest("GET", `auth/${uid}/${deniedVenue}`)).toBeNull();
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
    const seedMedia = async () => {
      const input = clients[0]!.input!;
      const paths = nestedMediaPaths(input);
      const bytes = Uint8Array.from(
        Buffer.from(
          "R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
          "base64",
        ),
      );
      const generations: Record<string, string> = {};
      for (const path of paths)
        generations[`gs://${namespace}.appspot.com/${path}`] =
          await fixture.uploadStorage(path, bytes);
      return {
        pairId: nestedPairId,
        paths,
        generations,
        mainScreenUrl: await page.evaluate(() =>
          window.nestedHarness.mediaUrl(),
        ),
      };
    };
    return {
      fixture,
      venue,
      deniedVenue,
      email,
      uid,
      image,
      page,
      client,
      bootstrap,
      rest,
      settle,
      seedMedia,
      cleanup,
    };
  } catch (error: unknown) {
    try {
      await cleanup();
    } catch {
      throw new Error("Nested setup and owned cleanup failed.");
    }
    throw error;
  }
}

type NestedCase = Awaited<ReturnType<typeof ownedNested>>;
const test = base.extend<{ nested: NestedCase }>({
  nested: async ({ browser }, provide, testInfo) => {
    const nested = await ownedNested(browser);
    try {
      await testInfo.attach("nested-ownership", {
        contentType: "application/json",
        body: JSON.stringify({
          fixture: nested.fixture.id,
          venue: nested.venue,
          deniedVenue: nested.deniedVenue,
          worker: testInfo.workerIndex,
          titlePath: testInfo.titlePath,
          retry: testInfo.retry,
          repeatEachIndex: testInfo.repeatEachIndex,
        }),
      });
      await provide(nested);
    } finally {
      await nested.cleanup();
    }
  },
  page: async ({ nested }, provide) => {
    await provide(nested.page);
  },
});
test.describe.configure({ mode: "serial", timeout: 60000 });
test.beforeAll(async ({ browser }) => {
  requireEmulatorSelection();
  const fixture = new LocalFixture(
    initializeExecutionToken(),
    process.env.PW_TEST_WORKER_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0",
  );
  const input = parseNestedFixtureInput(
    new URL(
      `/e2e/fixtures/nested-state.html?${new URLSearchParams({ fixture: fixture.id, prefix: fixture.venue("nested"), denied: fixture.venue("nested-denied"), role: "observer" })}`,
      base.info().project.use.baseURL,
    ),
  );
  const context = await browser.newContext();
  try {
    await verifyServedTarget(await context.newPage(), input);
  } finally {
    await context.close();
  }
  await canonicalRules("PUT");
  expect(await canonicalRules("GET")).toEqual(rules);
});

// Compare Firebase children, irrespective of RTDB's density-dependent JSON
// array representation. Child keys, rejected rows and metadata stay exact.
function rawChildren(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const children = Object.entries(value).flatMap(([key, child]) => {
    const raw = rawChildren(child);
    return raw === null ? [] : [[key, raw]];
  });
  return children.length ? Object.fromEntries(children) : null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a raw child map");
  return value as Record<string, unknown>;
}

const rosterStarter = {
  name: "Roster starter",
  id: 21,
  number: 20,
  show: true,
  note: { keep: 1 },
};
const rosterCoach = {
  name: "Roster coach",
  role: "Þjálfari",
  note: { keep: 2 },
};
const rosterRejected = { name: { invalid: true }, note: { keep: "rejected" } };
const blankPlayer = { name: "", number: "", role: "", show: false };
const rosterLayouts = [
  {
    name: "dense",
    raw: [rosterStarter, rosterCoach, rosterRejected],
    selected: "0",
    next: "3",
  },
  {
    name: "hole",
    raw: [rosterStarter, null, rosterCoach, rosterRejected],
    selected: "0",
    next: "4",
  },
  {
    name: "sparse",
    raw: { 17: rosterStarter, 26: rosterRejected, 31: rosterCoach, 40: false },
    selected: "17",
    next: "41",
  },
  {
    name: "named",
    raw: {
      zCoach: rosterCoach,
      aStarter: rosterStarter,
      bRejected: rosterRejected,
    },
    selected: "aStarter",
    next: "zCoach~",
  },
];

for (const layout of rosterLayouts) {
  for (const side of ["home", "away"] as const) {
    test(`ordinary roster raw child writes: ${layout.name} ${side}`, async ({
      page,
      nested,
    }, testInfo) => {
      const { rest, venue, bootstrap, settle } = nested;
      const rawRoster = {
        home: layout.raw,
        away: layout.raw,
        provenance: { keep: "outside the edit" },
      };
      await rest("PUT", `states/${venue}/controller/roster`, rawRoster);
      await bootstrap(page);
      await settle(page);
      const evidence: unknown[] = [];
      for (const operation of ["edit", "delete", "add", "replace"] as const) {
        await rest("PUT", `states/${venue}/controller/roster`, rawRoster);
        await rest("PUT", `audit/${venue}`, null);
        await expect
          .poll(() =>
            page.evaluate((side) => {
              const players =
                window.nestedHarness.snapshot().controller.roster[side];
              return players.map((p) => ({
                name: p.name,
                show: p.show ?? false,
              }));
            }, side),
          )
          .toEqual([
            { name: rosterStarter.name, show: true },
            { name: rosterCoach.name, show: false },
          ]);
        await settle(page);
        await page.evaluate(() => window.nestedHarness.resetAttempts());
        const before = rawChildren(await rest("GET", `states/${venue}`));
        const replacement = [
          { name: "Resolved", number: 42, source: { keep: "API" } },
        ];
        let diff: Record<string, unknown>;
        let action: string;
        if (operation === "edit") {
          diff = { [`roster/${side}/${layout.selected}/show`]: false };
          action = "controller.edit-player";
          if (side === "home")
            await page.getByRole("checkbox").first().uncheck();
          else
            await page.evaluate(() =>
              window.nestedHarness.commands.editPlayer("away", 0, {
                show: false,
              }),
            );
        } else if (operation === "delete") {
          diff = { [`roster/${side}/${layout.selected}`]: null };
          action = "controller.delete-player";
          await page.evaluate(
            (side) => window.nestedHarness.commands.deletePlayer(side, 0),
            side,
          );
        } else if (operation === "add") {
          diff = { [`roster/${side}/${layout.next}`]: blankPlayer };
          action = "controller.add-player";
          await page.evaluate(
            (side) => window.nestedHarness.commands.addPlayer(side),
            side,
          );
        } else {
          diff = { [`roster/${side}`]: replacement };
          action = "controller.set-roster";
          await page.evaluate(
            ({ side, replacement }) =>
              window.nestedHarness.commands.setRoster({ [side]: replacement }),
            { side, replacement },
          );
        }
        await expect
          .poll(
            async () =>
              Object.keys(record((await rest("GET", `audit/${venue}`)) ?? {}))
                .length,
          )
          .toBe(1);
        const events = Object.values(
          record(await rest("GET", `audit/${venue}`)),
        );
        expect(events).toHaveLength(1);
        const event = record(events[0]);
        expect(event.action).toBe(action);
        expect(JSON.parse(String(event.changes))).toEqual(diff);

        const expected = structuredClone(record(before));
        for (const [path, value] of Object.entries(diff)) {
          const keys = ["controller", ...path.split("/")];
          const leaf = keys.pop()!;
          let parent = expected;
          for (const key of keys) parent = record(parent[key]);
          if (value === null) delete parent[leaf];
          else parent[leaf] = rawChildren(value);
        }
        const after = rawChildren(await rest("GET", `states/${venue}`));
        expect(after).toEqual(expected);
        const snapshot = await page.evaluate(() =>
          window.nestedHarness.snapshot(),
        );
        expect(snapshot.attempts).toBe(1);
        expect(snapshot.transport).toHaveLength(1);
        const wire = snapshot.transport[0]!;
        expect(wire.method).toBe("merge");
        expect(wire.path).toBe("/");
        const wireData = record(wire.data);
        const auditPaths = Object.keys(wireData).filter((path) =>
          path.startsWith(`audit/${venue}/`),
        );
        expect(auditPaths).toHaveLength(6);
        const eventPaths = new Set(
          auditPaths.map((path) => path.split("/")[2]),
        );
        expect(eventPaths.size).toBe(1);
        const statePaths = Object.fromEntries(
          Object.entries(wireData).filter(([path]) =>
            path.startsWith("states/"),
          ),
        );
        expect(statePaths).toEqual(
          Object.fromEntries(
            Object.entries(diff).map(([path, value]) => [
              `states/${venue}/controller/${path}`,
              value,
            ]),
          ),
        );
        expect(Object.keys(wireData)).toHaveLength(
          Object.keys(diff).length + 6,
        );
        const auditBase = `audit/${venue}/${[...eventPaths][0]!}`;
        const wireDiff = Object.fromEntries(
          Object.entries(statePaths).map(([path, value]) => [
            path.slice(`states/${venue}/controller/`.length),
            value,
          ]),
        );
        expect(wireData[`${auditBase}/changes`]).toBe(JSON.stringify(wireDiff));
        expect(event.changes).toBe(wireData[`${auditBase}/changes`]);
        expect(wireData[`${auditBase}/action`]).toBe(action);
        expect(wireData[`${auditBase}/uid`]).toBe(event.uid);
        expect(wireData[`${auditBase}/sessionId`]).toBe(event.sessionId);
        expect(wireData[`${auditBase}/stateArea`]).toBe("controller");
        expect(wireData[`${auditBase}/timestamp`]).toEqual({
          ".sv": "timestamp",
        });
        evidence.push({ operation, before, after, event, wire });
      }
      await testInfo.attach("roster-raw-roundtrips", {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
    });
  }
}

test("ordinary roster rapid SDK echoes and explicit two-side replacement/full clear", async ({
  page,
  nested,
}, testInfo) => {
  const { rest, venue, bootstrap, settle } = nested;
  await rest("PUT", `states/${venue}/controller/roster`, {
    home: { 17: rosterStarter, 26: rosterRejected, 31: rosterCoach, 40: false },
    away: [rosterStarter, null, rosterCoach],
    provenance: { keep: "until full clear" },
  });
  await bootstrap(page);
  await settle(page);
  const before = record(rawChildren(await rest("GET", `states/${venue}`)));
  await page.evaluate(() => {
    const retained = window.nestedHarness.commands;
    retained.editPlayer("home", 0, { show: false });
    retained.editPlayer("home", 0, { name: "Edited" });
    retained.deletePlayer("home", 0);
    retained.editPlayer("home", 0, { name: "Coach edited" });
    retained.addPlayer("home");
    retained.addPlayer("home");
  });
  await expect
    .poll(
      async () =>
        Object.keys(record((await rest("GET", `audit/${venue}`)) ?? {})).length,
    )
    .toBe(6);
  const expected = structuredClone(before);
  record(record(expected.controller).roster).home = {
    26: rosterRejected,
    31: { ...rosterCoach, name: "Coach edited" },
    40: false,
    41: blankPlayer,
    42: blankPlayer,
  };
  expect(rawChildren(await rest("GET", `states/${venue}`))).toEqual(expected);
  const snapshot = await page.evaluate(() => window.nestedHarness.snapshot());
  expect(snapshot.attempts).toBe(6);
  const diffs = snapshot.transport.map((wire) => {
    expect(wire.method).toBe("merge");
    expect(wire.path).toBe("/");
    const data = record(wire.data);
    const changePath = Object.keys(data).find(
      (path) => path.startsWith(`audit/${venue}/`) && path.endsWith("/changes"),
    )!;
    return JSON.parse(String(data[changePath])) as unknown;
  });
  expect(diffs).toEqual([
    { "roster/home/17/show": false },
    { "roster/home/17/name": "Edited" },
    { "roster/home/17": null },
    { "roster/home/31/name": "Coach edited" },
    { "roster/home/41": blankPlayer },
    { "roster/home/42": blankPlayer },
  ]);
  const rapidEvents = record(await rest("GET", `audit/${venue}`));
  for (const wire of snapshot.transport) {
    const changePath = Object.keys(record(wire.data)).find((path) =>
      path.endsWith("/changes"),
    )!;
    const id = changePath.split("/")[2]!;
    expect(record(rapidEvents[id]).changes).toBe(record(wire.data)[changePath]);
  }
  await testInfo.attach("rapid-echo-before-after", {
    body: JSON.stringify(
      {
        before,
        after: expected,
        transport: snapshot.transport,
        audit: rapidEvents,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  await rest("PUT", `audit/${venue}`, null);
  await settle(page);
  await page.evaluate(() => {
    window.nestedHarness.resetAttempts();
    window.nestedHarness.commands.setRoster({
      home: [{ name: "Imported" }],
      away: [],
    });
  });
  await expect
    .poll(
      async () =>
        Object.keys(record((await rest("GET", `audit/${venue}`)) ?? {})).length,
    )
    .toBe(1);
  expect(
    rawChildren(await rest("GET", `states/${venue}/controller/roster`)),
  ).toEqual({
    home: { 0: { name: "Imported" } },
    provenance: { keep: "until full clear" },
  });
  const replacementEvent = record(
    Object.values(record(await rest("GET", `audit/${venue}`)))[0],
  );
  expect(JSON.parse(String(replacementEvent.changes))).toEqual({
    "roster/home": [{ name: "Imported" }],
    "roster/away": [],
  });
  expect(
    await page.evaluate(() => window.nestedHarness.snapshot().attempts),
  ).toBe(1);

  await rest("PUT", `audit/${venue}`, null);
  await settle(page);
  await page.evaluate(() => {
    window.nestedHarness.resetAttempts();
    window.nestedHarness.commands.clearRoster();
  });
  await expect
    .poll(
      async () =>
        Object.keys(record((await rest("GET", `audit/${venue}`)) ?? {})).length,
    )
    .toBe(1);
  expect(await rest("GET", `states/${venue}/controller/roster`)).toBeNull();
  const clearEvent = record(
    Object.values(record(await rest("GET", `audit/${venue}`)))[0],
  );
  expect(clearEvent.action).toBe("controller.clear-roster");
  expect(JSON.parse(String(clearEvent.changes))).toEqual({
    roster: { home: [], away: [] },
  });
  expect(
    await page.evaluate(() => window.nestedHarness.snapshot().attempts),
  ).toBe(1);
});

test("actual SDK/rules admit legacy malformed media while consumers stay safe and read-only", async ({
  page,
  nested,
}) => {
  const { rest, venue, bootstrap, settle } = nested;
  await bootstrap(page);
  await settle(page);
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
    await settle(page);
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
  nested,
}) => {
  const { rest, venue, bootstrap, settle } = nested;
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
  await settle(page);
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
  nested,
}) => {
  const { rest, venue, bootstrap, image, settle } = nested;
  await bootstrap(page);
  await settle(page);
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
    api.updateQueueSettings("q", { imageSeconds: 0.5 });
    // Preserve the original microtask boundary; this is not an SDK acknowledgement.
    await Promise.resolve();
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
  nested,
}) => {
  const { rest, venue, bootstrap, image, settle } = nested;
  await rest("PUT", `states/${venue}/controller/currentAsset`, {
    asset: image,
  });
  await bootstrap(page);
  await settle(page);
  const before = (await rest("GET", `states/${venue}/controller`)) as Record<
    string,
    unknown
  >;
  expect(
    await page.evaluate(
      (assetKey) =>
        window.nestedHarness.commands.completeAssetIfCurrent({
          occurrenceId: null,
          assetKey,
          time: null,
          activeQueueId: null,
          playing: false,
        }),
      image.key,
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
    // This current command must reject at the raw occurrence precondition.
    await expect
      .poll(() => page.evaluate(() => window.nestedHarness.snapshot().eligible))
      .toBe(true);
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
  nested,
}) => {
  const { rest, venue, bootstrap, settle, client, deniedVenue } = nested;
  await bootstrap(page);
  await settle(page);
  expect(await canonicalRules("GET")).toEqual(rules);
  const allowed = await page.evaluate(() =>
    window.nestedHarness.authorizedStorage(),
  );
  expect(allowed.bytes).toEqual([1]);
  expect(allowed.generation).toMatch(/^[0-9]+$/);
  const anonymous = await client("anonymous");
  await bootstrap(anonymous);
  const denied: string[] = [];
  for (const action of [
    { page, method: "denied" as const },
    { page: anonymous, method: "deniedStorage" as const },
  ]) {
    denied.push(
      await action.page.evaluate(async (method) => {
        try {
          await window.nestedHarness[method]();
          return "allowed";
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            typeof error.code === "string"
          )
            return error.code;
          throw error;
        }
      }, action.method),
    );
  }
  for (const method of ["privateRead", "privateList"] as const) {
    expect(
      await anonymous.evaluate(async (method) => {
        try {
          await window.nestedHarness[method]();
          return "allowed";
        } catch (error) {
          if (error instanceof Error && "code" in error) return error.code;
          throw error;
        }
      }, method),
    ).toBe("storage/unauthorized");
  }
  await settle(page, anonymous);
  expect(denied).toEqual(["PERMISSION_DENIED", "storage/unauthorized"]);
  expect(await rest("GET", `states/${deniedVenue}`)).toBeNull();
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("legacy file pairs and ad layouts backfill actual Storage generations while semantic overlays stay intact", async ({
  page,
  nested,
}) => {
  const { rest, venue, bootstrap, settle, seedMedia } = nested;
  await bootstrap(page);
  await settle(page);
  const stored = await seedMedia();
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
  const rawPerimeter = record(await rest("GET", `states/${venue}/perimeter`));
  await rest("PUT", `states/${venue}/perimeter`, {
    ...rawPerimeter,
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
