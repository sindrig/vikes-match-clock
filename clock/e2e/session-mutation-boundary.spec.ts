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

for (const resumeAfterCore of [false, true]) {
  test(`initial venue snapshots finish readiness after resume (core delivered before resume: ${resumeAfterCore})`, async ({
    page,
  }) => {
    let paused = false;
    const held: Array<{ path?: string; send: () => void }> = [];
    // Pause every incoming frame, including acknowledgements, so delivery
    // order remains the real emulator's order. No snapshots are discarded.
    await page.routeWebSocket(/127\.0\.0\.1:9000/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        const payload = JSON.parse(String(message)) as {
          d?: { b?: { p?: string } };
        };
        const send = () => socket.send(message);
        if (paused) held.push({ path: payload.d?.b?.p, send });
        else send();
      });
    });
    await bootstrap(page);
    const before = await rest("GET", `states/${venue}`);
    const otherBefore = await rest("GET", `states/${other}`);
    paused = true;
    await page.evaluate((location) => {
      const h = window.sessionMutationHarness;
      h.retain();
      h.venue(location);
    }, other);
    await expect
      .poll(() => held.some(({ path }) => path === `states/${other}/perimeter`))
      .toBe(true);
    expect(
      await page.evaluate(() => window.sessionMutationHarness.snapshot().ready),
    ).toBe(false);
    const resume = () =>
      page.evaluate(() => {
        const h = window.sessionMutationHarness;
        h.hide(true);
        h.hide(false);
      });
    if (!resumeAfterCore) await resume();
    const partialPaths: Array<string | undefined> = [];
    while (held.length) {
      const message = held.shift();
      if (!message) throw new Error("Missing paused frame");
      partialPaths.push(message.path);
      message.send();
      if (message.path === `states/${other}/clubOverrides`) break;
    }
    expect(partialPaths).toContain(`states/${other}/match`);
    expect(partialPaths).not.toContain(`states/${other}/perimeter`);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.sessionMutationHarness.snapshot().match.homeScore,
        ),
      )
      .toBe(90);
    if (resumeAfterCore) await resume();
    expect(
      await page.evaluate(() => window.sessionMutationHarness.snapshot().ready),
    ).toBe(false);
    expect(
      await page.evaluate(() =>
        window.sessionMutationHarness.brightness(45).then(
          () => "accepted",
          () => "blocked",
        ),
      ),
    ).toBe("blocked");
    await noAttempts(page, before);
    expect(await rest("GET", `states/${other}`)).toEqual(otherBefore);
    paused = false;
    for (const message of held.splice(0)) message.send();
    await expect
      .poll(() =>
        page.evaluate(() => window.sessionMutationHarness.snapshot().ready),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => window.sessionMutationHarness.snapshot()),
    ).toMatchObject({
      eligible: true,
      freshness: "ready",
      location: other,
      match: { homeScore: 90 },
    });
    expect(
      await page.evaluate(() => window.sessionMutationHarness.oldCommands()),
    ).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    await noAttempts(page, before);
    await page.evaluate(() => window.sessionMutationHarness.brightness(45));
    expect(await rest("GET", `states/${other}/perimeter/brightness`)).toBe(45);
    const audit = Object.values(
      (await rest("GET", `audit/${other}`)) as Record<
        string,
        { uid: string; action: string; timestamp: number; sessionId: string }
      >,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ uid, action: "perimeter.set-brightness" });
    expect(audit[0]?.sessionId).toBeTruthy();
    expect(Math.abs((audit[0]?.timestamp ?? 0) - Date.now())).toBeLessThan(
      30000,
    );
    expect(await rest("GET", `states/${venue}`)).toEqual(before);
    expect(
      await page.evaluate(() => window.sessionMutationHarness.counts),
    ).toMatchObject({ ordinary: 1, auditOnly: 0, sdk: ["merge:/"] });
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

test("fresh create-with-items then play uses subscribed queue state", async ({
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
    .toBe(2);
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
  ).toBe(2);
});

test("cached reconnect finishes a partial initial load without another core update", async ({
  page,
}) => {
  let paused = false;
  const held: Array<{ path?: string; send: () => void }> = [];
  const delivered: string[] = [];
  await page.routeWebSocket(/127\.0\.0\.1:9000/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const payload = JSON.parse(String(message)) as {
        d?: { b?: { p?: string } };
      };
      const path = payload.d?.b?.p;
      const send = () => {
        if (path) delivered.push(path);
        socket.send(message);
      };
      if (paused) held.push({ path, send });
      else send();
    });
  });
  await bootstrap(page);
  const before = await rest("GET", `states/${venue}`);
  paused = true;
  await page.evaluate((location) => {
    const h = window.sessionMutationHarness;
    h.retain();
    h.venue(location);
  }, other);
  await expect
    .poll(() => held.some(({ path }) => path === `states/${other}/perimeter`))
    .toBe(true);
  // Keep the original data/ack order. Deliver only through the core areas.
  while (held.length) {
    const message = held.shift()!;
    if (
      message.path === `states/${other}/clubOverrides` ||
      message.path === `states/${other}/perimeter`
    ) {
      held.unshift(message);
      break;
    }
    message.send();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => window.sessionMutationHarness.snapshot().match.homeScore,
      ),
    )
    .toBe(90);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.snapshot()),
  ).toMatchObject({ ready: false, eligible: false });
  await page.evaluate(() => window.sessionMutationHarness.disconnect());
  await expect
    .poll(() =>
      page.evaluate(() => window.sessionMutationHarness.snapshot().connected),
    )
    .toBe(false);
  await page.evaluate(() => window.sessionMutationHarness.oldCommands());
  await noAttempts(page, before);
  // Only unread frames from the socket actually disconnected are discarded.
  held.length = 0;
  paused = false;
  const reconnectStart = delivered.length;
  await page.evaluate(() => window.sessionMutationHarness.reconnect());
  await eligible(page);
  expect(delivered.slice(reconnectStart)).toContain(
    `states/${other}/perimeter`,
  );
  expect(
    delivered
      .slice(reconnectStart)
      .filter((path) =>
        ["match", "controller", "view"].some(
          (leaf) => path === `states/${other}/${leaf}`,
        ),
      ),
  ).toEqual([]);
  await page.evaluate(() => window.sessionMutationHarness.oldCommands());
  await noAttempts(page, before);
  await page.evaluate(() => window.sessionMutationHarness.brightness(49));
  expect(await rest("GET", `states/${other}/perimeter/brightness`)).toBe(49);
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts),
  ).toMatchObject({ ordinary: 1, auditOnly: 0, sdk: ["merge:/"] });
});

test("rapid ordinary commands retain both goals, queue edits and presets through SDK echoes", async ({
  page,
}) => {
  await bootstrap(page);
  const queues = await page.evaluate(() =>
    window.sessionMutationHarness.rapidOrdinary(),
  );
  await expect
    .poll(
      async () =>
        Object.keys((await rest("GET", `audit/${venue}`)) as object).length,
    )
    .toBe(8);
  expect(await rest("GET", `states/${venue}/match/homeScore`)).toBe(4);
  expect(
    await rest("GET", `states/${venue}/controller/queues/${queues.first}/name`),
  ).toBe("First rapid queue");
  expect(
    await rest(
      "GET",
      `states/${venue}/controller/queues/${queues.second}/name`,
    ),
  ).toBe("Second rapid queue");
  const items = (await rest(
    "GET",
    `states/${venue}/controller/queues/${queues.first}/items`,
  )) as Array<{ key: string }>;
  expect(items.map(({ key }) => key)).toEqual(["rapid-one", "rapid-two"]);
  const presets = (await rest(
    "GET",
    `states/${venue}/view/customPresets`,
  )) as Record<string, { name: string }>;
  expect(presets["rapid-one"]?.name).toBe("First");
  expect(presets["rapid-two"]?.name).toBe("Second");
  expect(
    await page.evaluate(() => window.sessionMutationHarness.counts.ordinary),
  ).toBe(8);
});

for (const fail of [false, true]) {
  test(`late rename ${fail ? "failure" : "success"} preserves another preset's draft and deduplicates Enter/blur`, async ({
    page,
  }) => {
    let buffering = false;
    let arm = false;
    const held: Array<() => void> = [];
    await page.routeWebSocket(/127\.0\.0\.1:9000/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        const payload = JSON.parse(String(message)) as {
          d?: { a?: string; b?: { d?: Record<string, unknown> } };
        };
        if (
          arm &&
          payload.d?.a === "m" &&
          Object.keys(payload.d.b?.d ?? {}).some((path) =>
            path.startsWith(`states/${venue}/view/`),
          )
        )
          buffering = true;
        if (buffering) held.push(() => server.send(message));
        else server.send(message);
      });
    });
    await rest("PATCH", `states/${venue}/view`, {
      customPresets: {
        one: { name: "One", theme: { logoTop: "0px" } },
        two: { name: "Two", theme: { logoTop: "0px" } },
      },
    });
    await bootstrap(page);
    await page.evaluate(() => window.sessionMutationHarness.openTheme());
    await page.locator('button[title="Endurnefna"]').first().click();
    const input = page.locator(".theme-rename-input");
    await input.fill("Submitted first name");
    arm = true;
    await input.press("Enter");
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await page.locator('button[title="Endurnefna"]').nth(1).click();
    await input.fill("Unsaved second draft");
    expect(
      await page.evaluate(() => window.sessionMutationHarness.counts.ordinary),
    ).toBe(1);
    if (fail) await rest("PUT", `auth/${uid}/${venue}`, false);
    arm = false;
    buffering = false;
    for (const send of held.splice(0)) send();
    // Wait for actual server acceptance/denial and then the promise handlers.
    await expect
      .poll(() =>
        page.evaluate((failure) => {
          const { counts } = window.sessionMutationHarness;
          return failure ? counts.failed : counts.succeeded;
        }, fail),
      )
      .toBe(1);
    if (fail) {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.sessionMutationHarness.snapshot().view.customPresets?.one
                ?.name,
          ),
        )
        .toBe("One");
    } else {
      await expect
        .poll(() => rest("GET", `states/${venue}/view/customPresets/one/name`))
        .toBe("Submitted first name");
    }
    await expect(input).toHaveValue("Unsaved second draft");
    await expect(page.locator('.theme-modal-body [role="alert"]')).toHaveCount(
      0,
    );
    expect(
      await rest("GET", `states/${venue}/view/customPresets/two/name`),
    ).toBe("Two");
    if (fail) await rest("PUT", `auth/${uid}/${venue}`, true);
  });
}
