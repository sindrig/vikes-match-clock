import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { minimalPerimeterDisplay } from "../src/lib/venue.fixtures";
import type { SubscriptionDomainsHarness } from "./fixtures/subscription-domains";

test.describe.configure({ mode: "serial", timeout: 60_000 });
const namespace = "vikes-match-clock-test";
const venue = "audit247-a";
const other = "audit247-b";
const email = `audit247-${Date.now()}@example.test`;
const password = "synthetic-emulator-only";
const owner = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};
const rules = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
) as { rules: Record<string, unknown> };
let uid: string;
const pageErrors = new Map<Page, string[]>();
async function rest(method: string, path: string, value?: unknown) {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=${namespace}`,
    {
      method,
      headers: owner,
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    },
  );
  expect(response.ok).toBe(true);
  return response.json() as Promise<unknown>;
}
async function install(value = rules) {
  await rest("PUT", ".settings/rules", value);
  expect(await rest("GET", ".settings/rules")).toEqual(value);
}
function denyCore() {
  return {
    rules: {
      ...rules.rules,
      states: {
        $location: {
          ".write":
            "root.child('auth').child(auth.uid).child($location).val() == true",
          match: { ".read": false },
          controller: { ".read": true },
          view: { ".read": true },
          clubOverrides: { ".read": true },
          perimeter: { ".read": true },
        },
      },
    },
  };
}
async function ready(page: Page, eligible = true) {
  await expect
    .poll(() =>
      page.evaluate(() => window.subscriptionDomains.snapshot().ready),
    )
    .toBe(true);
  if (eligible)
    await expect
      .poll(() =>
        page.evaluate(() => window.subscriptionDomains.snapshot().eligible),
      )
      .toBe(true);
}
async function boot(
  page: Page,
  { login = true, prefix = venue, offline = false } = {},
) {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await page.route("http://localhost:8000/**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto(
    `/e2e/fixtures/subscription-domains.html?prefix=${prefix}${offline ? "&offline=1" : ""}`,
  );
  await page.waitForFunction(() => Boolean(window.subscriptionDomains));
  if (login)
    await page.evaluate(
      ({ email, password }) =>
        window.subscriptionDomains.login(email, password),
      { email, password },
    );
}
test.beforeAll(async () => {
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
    {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  expect(response.ok).toBe(true);
  uid = ((await response.json()) as { localId: string }).localId;
  await rest("PUT", `auth/${uid}`, { [venue]: true, [other]: true });
});
test.beforeEach(async () => {
  await install();
  for (const location of [venue, other]) {
    await rest("PUT", `locations/${location}`, {
      label: location,
      screens: [{ key: "main", name: "Main" }],
      perimeterDisplay: minimalPerimeterDisplay,
    });
    await rest("PUT", `states/${location}`, {
      match: {
        homeScore: location === venue ? 2 : 90,
        awayScore: 0,
        homeTeam: "Víkingur R",
        awayTeam: "Valur",
        halfStops: [45, 90, 105, 120],
        matchType: "football",
        started: 0,
        countdown: false,
      },
      controller: {
        view: "match",
        assetView: "assets",
        roster: { home: [], away: [] },
        playing: false,
      },
      view: {
        background: "Default",
        vp: { key: "main", name: "Main", style: { width: 1920, height: 1080 } },
      },
      perimeter: {
        enabled: true,
        state: "on",
        brightness: location === venue ? 20 : 75,
      },
    });
    await rest(
      "PUT",
      `perimeter/${location}/brightnessStatus`,
      location === venue
        ? {
            phase: "applied",
            requestedPercent: 20,
            appliedPercent: 20,
            updatedAt: 1,
          }
        : null,
    );
    await rest("PUT", `audit/${location}`, null);
  }
});
test.afterEach(async ({ page }, info) => {
  const proof = await page
    .evaluate(() =>
      window.subscriptionDomains
        ? {
            snapshot: window.subscriptionDomains.snapshot(),
            counts: window.subscriptionDomains.counts,
            history: window.subscriptionDomains.history,
          }
        : null,
    )
    .catch(() => null);
  await info.attach("subscription-proof", {
    contentType: "application/json",
    body: JSON.stringify(proof),
  });
  await install();
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("public display survives denied optional telemetry and real rules preserve read/write boundaries", async ({
  page,
  browser,
}) => {
  await boot(page, { login: false });
  await ready(page, false);
  expect(
    await page.evaluate(() =>
      window.subscriptionDomains.rawRead(
        `perimeter/${"audit247-a"}/brightnessStatus`,
      ),
    ),
  ).toBe("denied");
  expect(
    await page.evaluate(() =>
      window.subscriptionDomains.rawWrite("states/audit247-a/match/homeScore"),
    ),
  ).toBe("denied");
  await expect(page.locator(".App")).toBeVisible();
  expect(
    await page.evaluate(() => window.subscriptionDomains.snapshot().telemetry),
  ).toBeNull();
  const anonymous = await page.evaluate(() =>
    window.subscriptionDomains.snapshot(),
  );
  await page.close(); // Independent roles need not keep both App renderers resident.
  const context = await browser.newContext();
  try {
    const operator = await context.newPage();
    await boot(operator);
    await ready(operator);
    await expect
      .poll(() =>
        operator.evaluate(
          () => window.subscriptionDomains.snapshot().telemetry?.appliedPercent,
        ),
      )
      .toBe(20);
    expect(
      await operator.evaluate(() =>
        window.subscriptionDomains.rawRead(
          "perimeter/ungranted/brightnessStatus",
        ),
      ),
    ).toBe("denied");
    expect(
      await operator.evaluate(() =>
        window.subscriptionDomains.rawWrite(
          "perimeter/audit247-a/brightnessStatus",
        ),
      ),
    ).toBe("denied");
    await test.info().attach("independent-role-boundaries", {
      contentType: "application/json",
      body: JSON.stringify({
        anonymous,
        operator: await operator.evaluate(() =>
          window.subscriptionDomains.snapshot(),
        ),
      }),
    });
    expect(pageErrors.get(operator) ?? []).toEqual([]);
    await operator.evaluate(() => window.subscriptionDomains.brightness(40));
    expect(
      await operator.evaluate(
        () => window.subscriptionDomains.snapshot().telemetry?.appliedPercent,
      ),
    ).toBe(20);
  } finally {
    await context.close();
  }
});

test("required permission failure replaces first-load spinner with actionable retry UI", async ({
  page,
}) => {
  await install(denyCore());
  await boot(page, { login: false });
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("match");
  await expect(
    alert.getByRole("button", { name: "Reyna lestur aftur" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Velja annan skjá" }),
  ).toBeVisible();
  await install();
  await alert.getByRole("button").click();
  await ready(page, false);
  await expect(page.locator(".App")).toBeVisible();
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("required revocation locks retained commands and read recovery never replays writes or toggles perimeter", async ({
  page,
}) => {
  await boot(page);
  await ready(page);
  await page.evaluate(() => window.subscriptionDomains.reset());
  await install(denyCore());
  await expect(page.getByRole("alert")).toContainText("match");
  expect(
    await page.evaluate(() => window.subscriptionDomains.staleWrite()),
  ).toBe("denied");
  expect(
    await page.evaluate(() => window.subscriptionDomains.counts.ordinary),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.subscriptionDomains.counts.sdk),
  ).toEqual([]);
  await expect(page.locator(".App")).toBeVisible();
  await install();
  await page.getByRole("alert").getByRole("button").click();
  await ready(page);
  expect(
    await page.evaluate(() => window.subscriptionDomains.staleWrite()),
  ).toBe("denied");
  expect(
    await page.evaluate(() => window.subscriptionDomains.counts.sdk),
  ).toEqual([]);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
  await page.evaluate(() => window.subscriptionDomains.brightness(45));
  expect(await rest("GET", `states/${venue}/perimeter/brightness`)).toBe(45);
});

test("cold unavailable required reads expose a deadline and recover only after explicit read retry", async ({
  page,
}) => {
  await boot(page, { login: false, offline: true });
  await expect(page.getByRole("alert").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.evaluate(() => {
    window.subscriptionDomains.online();
    window.subscriptionDomains.retry();
  });
  await ready(page, false);
  await expect(page.locator(".App")).toBeVisible();
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("selector grant denial is actionable, empty metadata stays a completed empty selector", async ({
  page,
}) => {
  await install({ rules: { ...rules.rules, auth: { ".read": false } } });
  await boot(page, { prefix: "" });
  await expect(page.getByRole("alert")).toContainText("aðgang að skjám");
  await install();
  await page.getByRole("alert").getByRole("button").click();
  await expect(
    page.getByRole("button", { name: /audit247-a/ }).first(),
  ).toBeVisible();
  await rest("PUT", `locations/${venue}`, null);
  await rest("PUT", `locations/${other}`, null);
  await expect(page.getByText("Engir skjáir tiltækir")).toBeVisible();
});

test("venue/auth resets never expose old requested or applied brightness as current", async ({
  page,
}) => {
  await boot(page);
  await ready(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.subscriptionDomains.snapshot().telemetry?.appliedPercent,
      ),
    )
    .toBe(20);
  await page.evaluate(() => window.subscriptionDomains.perimeterMode());
  await expect(page.getByText("Staðfest: 20%")).toBeVisible();
  await page.evaluate(() => {
    window.subscriptionDomains.reset();
    window.subscriptionDomains.choose("audit247-b");
  });
  await ready(page);
  await expect(page.getByText("Staðfest: 20%")).toHaveCount(0);
  const history = await page.evaluate(() => window.subscriptionDomains.history);
  expect(
    history
      .filter((entry) => entry.location === other)
      .every((entry) => entry.applied === null && entry.brightness !== 20),
  ).toBe(true);
  await page.evaluate(() => window.subscriptionDomains.logout());
  await expect
    .poll(() =>
      page.evaluate(() => window.subscriptionDomains.snapshot().uid ?? null),
    )
    .toBeNull();
  expect(
    await page.evaluate(() => window.subscriptionDomains.snapshot().telemetry),
  ).toBeNull();
});

test("writer keeps rapid SDK echoes and dependent queue acknowledgement barriers", async ({
  page,
}) => {
  await boot(page);
  await ready(page);
  await page.evaluate(() => window.subscriptionDomains.reset());
  await page.evaluate(() => {
    window.subscriptionDomains.rapidGoals();
  });
  await page.evaluate(() => window.subscriptionDomains.settle());
  expect(await rest("GET", `states/${venue}/match/homeScore`)).toBe(4);
  await page.evaluate(() => {
    window.subscriptionDomains.holdAcknowledgements();
    void window.subscriptionDomains.createAndAppend();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.subscriptionDomains.acknowledgements().filter(Boolean).length,
      ),
    )
    .toBe(1);
  const before = (await rest(
    "GET",
    `states/${venue}/controller/queues`,
  )) as Record<string, { items: unknown[] }>;
  expect(Object.values(before)[0]?.items).toHaveLength(1);
  await page.evaluate(() =>
    window.subscriptionDomains.releaseAcknowledgements(),
  );
  await expect
    .poll(
      async () =>
        Object.values(
          (await rest(
            "GET",
            `states/${venue}/controller/queues`,
          )) as typeof before,
        )[0]?.items.length,
    )
    .toBe(2);
  await page.evaluate(() => window.subscriptionDomains.settle());
  expect(
    await page.evaluate(() => window.subscriptionDomains.counts.ordinary),
  ).toBe(4);
});

// Keep the import as a compile-time contract for the dev-only fixture.
type Harness = SubscriptionDomainsHarness;
export type { Harness };

for (const replacement of [false, true]) {
  test(`mounted lifecycle retains its deadline through read fault (replacement=${String(replacement)})`, async ({
    page,
  }) => {
    await boot(page);
    await ready(page);
    await page.clock.install();
    const asset = {
      asset: {
        type: "IMAGE",
        key: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      },
      time: 10,
      occurrenceId: "occurrence-a",
    };
    await rest("PUT", `states/${venue}/controller/currentAsset`, asset);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.subscriptionDomains.snapshot().controller.currentAsset
              ?.occurrenceId,
        ),
      )
      .toBe("occurrence-a");
    await page.evaluate(() => window.subscriptionDomains.reset());
    await page.clock.fastForward(7000);
    await install(denyCore());
    await expect(page.getByRole("alert")).toContainText("match");
    await page.clock.fastForward(5000);
    expect(
      await page.evaluate(() => window.subscriptionDomains.counts.sdk),
    ).toEqual([]);
    if (replacement)
      await rest("PUT", `states/${venue}/controller/currentAsset`, {
        ...asset,
        time: 300,
        occurrenceId: "occurrence-b",
      });
    await install();
    await page.getByRole("alert").getByRole("button").click();
    await ready(page);
    await page.clock.fastForward(100);
    if (replacement) {
      expect(
        await page.evaluate(
          (assetKey) =>
            window.subscriptionDomains.complete({
              occurrenceId: "occurrence-a",
              assetKey,
              time: 10,
              activeQueueId: null,
              playing: false,
            }),
          asset.asset.key,
        ),
      ).toBe(false);
      expect(
        await rest(
          "GET",
          `states/${venue}/controller/currentAsset/occurrenceId`,
        ),
      ).toBe("occurrence-b");
      expect(await rest("GET", `audit/${venue}`)).toBeNull();
    } else {
      await expect
        .poll(() => rest("GET", `states/${venue}/controller/currentAsset`))
        .toBeNull();
      await expect
        .poll(
          async () =>
            Object.keys(((await rest("GET", `audit/${venue}`)) as object) ?? {})
              .length,
        )
        .toBe(1);
    }
    expect(
      await page.evaluate(() => window.subscriptionDomains.counts.ordinary),
    ).toBe(0);
  });
}
