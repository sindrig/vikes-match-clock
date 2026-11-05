import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import type { TimedAssetCompletionObservation } from "../src/lib/conditionalTransitions";
import type { Asset } from "../src/types";
import type {} from "./fixtures/emulator-target";
import {
  assertBrowserEmulatorTarget,
  assertLocalFixtureUrl,
  EMULATOR_PROJECT,
  initializeExecutionToken,
  LocalFixture,
  record,
  requireEmulatorSelection,
} from "./fixtures/local-fixture";
import type {} from "./fixtures/playback-occurrence-harness";
import {
  assertPlaybackFixtureTarget,
  parsePlaybackFixtureInput,
  type PlaybackFixtureInput,
  type PlaybackFixtureRole,
} from "./fixtures/playback-fixture-input";

const password = "playback-emulator-only";
const asset = {
  key: "A",
  type: "IMAGE",
  url: "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
} satisfies Asset;
const rules: unknown = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
);

// This installer is still GLOBAL to the namespace. Only the external serialized
// emulator lifecycle may make it exclusive; owned case roots do not isolate it.
async function canonicalRules(method: "GET" | "PUT") {
  requireEmulatorSelection();
  const url = `http://127.0.0.1:9000/.settings/rules.json?ns=${EMULATOR_PROJECT}`;
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
    throw new Error(`Canonical playback rules: HTTP ${response.status}.`);
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error("Oversized rules response.");
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

async function verifyServedTarget(page: Page) {
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
  await page.goto("about:blank");
}

type RawController = {
  currentAsset?: {
    asset: { key: string; type?: string; url?: string };
    occurrenceId?: unknown;
    time?: number | null;
  } | null;
  queues: Record<string, { items: unknown[]; autoPlay?: boolean }>;
};
function assertRawController(value: unknown): asserts value is RawController {
  const controller = record(value);
  for (const value of Object.values(record(controller.queues))) {
    const queue = record(value);
    if (
      !Array.isArray(queue.items) ||
      (queue.autoPlay !== undefined && typeof queue.autoPlay !== "boolean")
    )
      throw new Error("Invalid raw playback queue.");
  }
  if (controller.currentAsset != null) {
    const current = record(controller.currentAsset);
    const asset = record(current.asset);
    if (
      typeof asset.key !== "string" ||
      (asset.type !== undefined && typeof asset.type !== "string") ||
      (asset.url !== undefined && typeof asset.url !== "string") ||
      (current.time != null && typeof current.time !== "number")
    )
      throw new Error("Invalid raw playback asset.");
  }
  // occurrenceId deliberately stays unknown: malformed persisted IDs must be
  // observed unchanged rather than repaired/filtered by a fixture parser.
}

async function until<T>(
  action: () => Promise<T>,
  deadline: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (Date.now() >= deadline)
      throw new Error("Playback teardown deadline expired.");
    const result = await Promise.race([
      action(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error("Playback fixture teardown deadline expired.")),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
    if (Date.now() > deadline)
      throw new Error("Playback teardown deadline expired.");
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function ownedPlayback(browser: Browser) {
  requireEmulatorSelection();
  const fixture = new LocalFixture(
    initializeExecutionToken(),
    process.env.PW_TEST_WORKER_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0",
  );
  const venue = fixture.venue("playback");
  const deniedVenue = fixture.venue("playback-denied");
  const email = fixture.email("playback");
  const clients: {
    context: BrowserContext;
    page?: Page;
    input?: PlaybackFixtureInput;
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
  const controller = async () => {
    const raw = await rest("GET", `states/${venue}/controller`);
    assertRawController(raw);
    return raw;
  };
  const client = async (role: PlaybackFixtureRole) => {
    const context = await browser.newContext();
    const entry: (typeof clients)[number] = { context };
    clients.push(entry); // Own it before page creation or navigation can fail.
    const page = await context.newPage();
    entry.page = page;
    const url = new URL(
      "/e2e/fixtures/playback-occurrences.html",
      base.info().project.use.baseURL,
    );
    url.search = new URLSearchParams({
      fixture: fixture.id,
      prefix: venue,
      denied: deniedVenue,
      role,
    }).toString();
    entry.input = parsePlaybackFixtureInput(url);
    await verifyServedTarget(page);
    return page;
  };
  const bootstrap = async (page: Page) => {
    const entry = clients.find((entry) => entry.page === page);
    if (!entry?.input || entry.producer)
      throw new Error("Unowned or already initialized playback page.");
    const url = new URLSearchParams({
      fixture: entry.input.fixtureId,
      prefix: entry.input.venue,
      denied: entry.input.deniedVenue,
      role: entry.input.role,
    });
    await page.goto(
      `/e2e/fixtures/playback-occurrences.html?${url.toString()}`,
    );
    await page.waitForFunction(() => Boolean(window.playbackHarness));
    const descriptor = await page.evaluate(() => ({
      input: window.playbackHarness.input,
      target: window.playbackHarness.target,
    }));
    assertBrowserEmulatorTarget(descriptor.target);
    assertPlaybackFixtureTarget(descriptor.target);
    expect(descriptor.input).toEqual(entry.input);
    const lifetime = new Promise<void>((resolve, reject) => {
      entry.finish = resolve;
      entry.fail = () =>
        reject(new Error("Playback client outcome uncertain."));
    });
    entry.producer = fixture.trackMutation(() => lifetime);
    void entry.producer.catch(() => {
      // LocalFixture retains the uncertain producer; cleanup must fail too.
    });
    await page.evaluate(
      (input) => window.playbackHarness.initialize(input),
      entry.input,
    );
    await page.evaluate(
      ({ email, password, uid }) =>
        window.playbackHarness.login(email, password, uid),
      { email, password, uid },
    );
    if (entry.input.role === "observer") {
      await expect
        .poll(() => page.evaluate(() => window.playbackHarness.snapshot()))
        .toMatchObject({ connected: true });
      await expect
        .poll(() =>
          page.evaluate(
            () => window.playbackHarness.snapshot().controllerDeliveries,
          ),
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(
            () => window.playbackHarness.snapshot().auditDeliveries,
          ),
        )
        .toBeGreaterThan(0);
    } else {
      await expect
        .poll(() => page.evaluate(() => window.playbackHarness.snapshot()))
        .toMatchObject({ connected: true, eligible: true, uid });
    }
  };
  const cleanup = async () => {
    const deadline = Date.now() + 20000;
    const failures: string[] = [];
    // Writable clients drain before the independent observer closes, and before
    // LocalFixture retires backend data. Every stage shares this deadline.
    for (const entry of [...clients].sort(
      (a, b) =>
        Number(a.input?.role === "observer") -
        Number(b.input?.role === "observer"),
    )) {
      if (entry.producer && entry.page) {
        try {
          await until(
            () =>
              entry.page!.evaluate(
                (timeout) => window.playbackHarness.dispose(timeout),
                Math.max(1, deadline - Date.now()),
              ),
            deadline,
          );
          entry.finish?.();
          await entry.producer;
        } catch {
          entry.fail?.();
          failures.push("Playback client disposal incomplete.");
        }
      }
      try {
        const closing = entry.context.close();
        void closing.catch(() => undefined);
        await until(() => closing, deadline);
      } catch {
        failures.push("Playback context close incomplete.");
      }
    }
    try {
      if (targetAdmitted)
        await until(
          () => fixture.cleanup(Math.max(1, deadline - Date.now())),
          deadline,
        );
    } catch {
      failures.push("Playback owned resource cleanup incomplete.");
    }
    if (failures.length) throw new Error(failures.join("\n"));
  };
  try {
    const page = await client("controller"); // Read-only selection before seeding.
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
        throw new Error("Playback email already has an invitation.");
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
        timeElapsed: 0,
        halfStops: [45, 90],
        matchType: "football",
      },
      controller: {
        view: "idle",
        assetView: "assets",
        activeQueueId: "q",
        playing: true,
        currentAsset: { asset, time: 30 },
        queues: {
          q: {
            id: "q",
            name: "Cycle",
            items: [asset],
            autoPlay: true,
            imageSeconds: 30,
            cycle: true,
            order: 0,
          },
        },
        roster: { home: [], away: [] },
      },
      view: { background: "Default" },
      clubOverrides: {},
      perimeter: { enabled: false },
    });
    await rest("PUT", `audit/${venue}`, null);
    const observer = await client("observer");
    await bootstrap(observer);
    const settle = async (...pages: Page[]) => {
      for (const page of pages)
        await expect
          .poll(() => page.evaluate(() => window.playbackHarness.lifecycle()))
          .toMatchObject({
            pendingCommands: 0,
            pendingAudits: 0,
            pendingSdk: 0,
            held: 0,
            failures: [],
          });
      const raw = await controller();
      const audit = await rest("GET", `audit/${venue}`);
      await expect
        .poll(() => observer.evaluate(() => window.playbackHarness.snapshot()))
        .toMatchObject({ rawController: raw, rawAudit: audit });
    };
    return {
      fixture,
      venue,
      deniedVenue,
      uid,
      page,
      observer,
      client,
      bootstrap,
      rest,
      controller,
      settle,
      cleanup,
    };
  } catch (error: unknown) {
    try {
      await cleanup();
    } catch {
      throw new Error("Playback setup and owned cleanup failed.");
    }
    throw error;
  }
}

type PlaybackCase = Awaited<ReturnType<typeof ownedPlayback>>;
const test = base.extend<{ playback: PlaybackCase }>({
  playback: async ({ browser }, provide, testInfo) => {
    const playback = await ownedPlayback(browser);
    try {
      await testInfo.attach("playback-ownership", {
        contentType: "application/json",
        body: JSON.stringify({
          fixture: playback.fixture.id,
          venue: playback.venue,
          deniedVenue: playback.deniedVenue,
          worker: testInfo.workerIndex,
          titlePath: testInfo.titlePath,
          retry: testInfo.retry,
          repeatEachIndex: testInfo.repeatEachIndex,
        }),
      });
      await provide(playback);
    } finally {
      await playback.cleanup();
    }
  },
});

test.describe.configure({ mode: "serial", timeout: 60000 });
test.beforeAll(async ({ browser }) => {
  requireEmulatorSelection();
  const context = await browser.newContext();
  try {
    await verifyServedTarget(await context.newPage());
  } finally {
    await context.close();
  }
  await canonicalRules("PUT");
  expect(await canonicalRules("GET")).toEqual(rules);
});

for (const initialId of [null, "identified-A"]) {
  test(`real SDK competing ${initialId === null ? "legacy" : "identified"} completions commit once, including a forced hash conflict`, async ({
    playback,
  }) => {
    const { page, bootstrap, client, rest, venue, controller, settle } =
      playback;
    if (initialId)
      await rest(
        "PUT",
        `states/${venue}/controller/currentAsset/occurrenceId`,
        initialId,
      );
    const second = await client("controller");
    await bootstrap(page);
    await bootstrap(second);
    const observed = await page.evaluate(() =>
      window.playbackHarness.observe(),
    );
    expect(observed.occurrenceId).toBe(initialId);
    for (const client of [page, second]) {
      await client.evaluate((observation) => {
        window.playbackHarness.arm();
        window.playbackHarness.compete(observation);
      }, observed);
      await expect
        .poll(() => client.evaluate(() => window.playbackHarness.held))
        .toBe(1);
    }
    expect(await page.evaluate(() => window.playbackHarness.hashes)).toEqual(
      await second.evaluate(() => window.playbackHarness.hashes),
    );
    await page.evaluate(() => window.playbackHarness.release());
    await expect
      .poll(() => page.evaluate(() => window.playbackHarness.result))
      .toBe(true);
    await second.evaluate(() => window.playbackHarness.release());
    await expect
      .poll(() => second.evaluate(() => window.playbackHarness.result))
      .toBe(false);
    await settle(page, second);
    const after = await controller();
    expect(after.currentAsset?.occurrenceId).toEqual(expect.any(String));
    expect(after.currentAsset?.occurrenceId).not.toBe(initialId);
    expect(after.currentAsset?.asset).toEqual(asset);
    expect(after.queues.q?.items).toEqual([asset]);
    expect(
      Object.keys((await rest("GET", `audit/${venue}`)) as object),
    ).toHaveLength(1);
    await expect
      .poll(() =>
        second.evaluate(
          () =>
            window.playbackHarness.commands.controller.currentAsset
              ?.occurrenceId,
        ),
      )
      .toBe(after.currentAsset?.occurrenceId);
    expect(
      await second.evaluate(() => window.playbackHarness.hashes),
    ).toHaveLength(1);
    expect(
      await second.evaluate(() => window.playbackHarness.statuses),
    ).toContain("datastale");
    expect(
      await second.evaluate(() => window.playbackHarness.snapshot().eligible),
    ).toBe(true);
    expect(
      await second.evaluate(
        (old) => window.playbackHarness.commands.completeAssetIfCurrent(old),
        observed,
      ),
    ).toBe(false);
    await settle(page, second);
  });
}

test("A to B to A rejects the old observation and preserves URLs and keys", async ({
  playback,
}) => {
  const { page, bootstrap, controller, settle } = playback;
  await bootstrap(page);
  const first = await page.evaluate(() => window.playbackHarness.observe());
  const next = { ...asset, key: "B" };
  await page.evaluate(
    (items) => window.playbackHarness.commands.addItemsToQueue("q", items),
    [next],
  );
  await page.evaluate(() => window.playbackHarness.commands.showNextAsset());
  await expect
    .poll(async () => (await controller()).currentAsset?.occurrenceId)
    .toEqual(expect.any(String));
  await page.evaluate(() => window.playbackHarness.commands.showNextAsset());
  await expect
    .poll(async () => (await controller()).currentAsset?.asset.key)
    .toBe("B");
  await page.evaluate(() => window.playbackHarness.commands.showNextAsset());
  await expect
    .poll(async () => (await controller()).currentAsset?.asset.key)
    .toBe("A");
  const before = await controller();
  expect(
    await page.evaluate(() => window.playbackHarness.snapshot().eligible),
  ).toBe(true);
  expect(
    await page.evaluate(
      (old) => window.playbackHarness.commands.completeAssetIfCurrent(old),
      first,
    ),
  ).toBe(false);
  expect(await controller()).toEqual(before);
  const current = await page.evaluate(() => window.playbackHarness.observe());
  expect(
    await page.evaluate(
      (now) => window.playbackHarness.commands.completeAssetIfCurrent(now),
      current,
    ),
  ).toBe(true);
  await settle(page);
});

test("malformed present IDs never become eligible legacy observations and real SDK rules still deny unauthorized writes", async ({
  playback,
}) => {
  const { page, bootstrap, rest, venue, deniedVenue, controller, settle } =
    playback;
  await bootstrap(page);
  await expect(
    page.evaluate(() => window.playbackHarness.deny()),
  ).rejects.toThrow(/permission_denied/i);
  await settle(page);
  expect(await rest("GET", `states/${deniedVenue}`)).toBeNull();
  for (const id of ["", " ", false, 7, { unexpected: true }]) {
    await rest(
      "PUT",
      `states/${venue}/controller/currentAsset/occurrenceId`,
      id,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => window.playbackHarness.commands.controller.currentAsset,
        ),
      )
      .toBeNull();
    const legacy: TimedAssetCompletionObservation = {
      occurrenceId: null,
      assetKey: "A",
      time: 30,
      activeQueueId: "q",
      playing: true,
    };
    expect(
      await page.evaluate(() => window.playbackHarness.snapshot().eligible),
    ).toBe(true);
    expect(
      await page.evaluate(
        (observation) =>
          window.playbackHarness.commands.completeAssetIfCurrent(observation),
        legacy,
      ),
    ).toBe(false);
    expect((await controller()).currentAsset).toHaveProperty(
      "occurrenceId",
      id,
    );
  }
  await settle(page);
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("unchanged rules permit an old writer to clear replayed identified media: documented mixed-binary limit", async ({
  playback,
}) => {
  const { page, bootstrap, controller, settle } = playback;
  await bootstrap(page);
  await page.evaluate(() => window.playbackHarness.commands.showNextAsset());
  await expect
    .poll(async () => (await controller()).currentAsset?.occurrenceId)
    .toEqual(expect.any(String));
  const old = await page.evaluate(() => window.playbackHarness.observe());
  await page.evaluate(() => window.playbackHarness.commands.showNextAsset());
  await expect
    .poll(async () => (await controller()).currentAsset?.occurrenceId)
    .not.toBe(old.occurrenceId);
  await page.evaluate(() =>
    window.playbackHarness.commands.updateQueueSettings("q", {
      autoPlay: false,
    }),
  );
  await expect
    .poll(async () => (await controller()).queues.q?.autoPlay)
    .toBe(false);
  expect(
    await page.evaluate(() => window.playbackHarness.snapshot().eligible),
  ).toBe(true);
  expect(
    await page.evaluate(
      (observation) =>
        window.playbackHarness.commands.completeAssetIfCurrent(observation),
      old,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      (observation) => window.playbackHarness.oldComplete(observation),
      old,
    ),
  ).toBe(true);
  await settle(page);
  expect((await controller()).currentAsset ?? null).toBeNull();
});

test("native video replay remounts with the same source and an old actual onEnded cannot clear it", async ({
  playback,
}) => {
  const { bootstrap, client, controller, settle } = playback;
  const commandPage = playback.page;
  const page = await client("display");
  await bootstrap(commandPage);
  await bootstrap(page);
  const url = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    let recorder: MediaRecorder | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      const done = new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
      });
      recorder.start();
      timer = setInterval(() => {
        context.fillStyle = "red";
        context.fillRect(0, 0, 32, 32);
      }, 50);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      recorder.stop();
      await done;
      return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    } finally {
      clearInterval(timer);
      if (recorder?.state === "recording") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    }
  });
  const media = { key: "native-video", type: "VIDEO", url } satisfies Asset;
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect
    .poll(() =>
      page
        .locator("#root video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.4);
  await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>("#root video")!;
    video.pause();
    const key = Object.keys(video).find((name) =>
      name.startsWith("__reactProps$"),
    )!;
    const props = (video as unknown as Record<string, { onEnded: () => void }>)[
      key
    ]!;
    Object.assign(window, { oldVideo: video, oldEnd: props.onEnded });
  });
  await page.route("**/held-replacement.png", () => {
    /* Deliberately pending until the deferred render is replaced. */
  });
  await commandPage.evaluate(() =>
    window.playbackHarness.commands.renderAsset({
      key: "B",
      type: "IMAGE",
      url: `${window.location.origin}/held-replacement.png`,
    }),
  );
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#root video") ===
        (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo,
    ),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.playbackHarness.snapshot()))
    .toMatchObject({
      eligible: true,
      controller: { currentAsset: { asset: { key: "B" } } },
    });
  const deferred = await controller();
  await page.evaluate(() => {
    (window as unknown as { oldEnd: () => void }).oldEnd();
  });
  await page.waitForTimeout(100);
  await settle(commandPage, page);
  expect(await controller()).toEqual(deferred);
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector("#root video") !==
          (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo,
      ),
    )
    .toBe(true);
  const before = await controller();
  await expect
    .poll(() => page.evaluate(() => window.playbackHarness.snapshot()))
    .toMatchObject({
      eligible: true,
      controller: {
        currentAsset: { occurrenceId: before.currentAsset?.occurrenceId },
      },
    });
  await page.evaluate(() => {
    (window as unknown as { oldEnd: () => void }).oldEnd();
  });
  await page.waitForTimeout(100);
  await settle(commandPage, page);
  expect(await controller()).toEqual(before);
  expect(await page.locator("#root video").getAttribute("src")).toBe(url);
  expect(
    await page
      .locator("#root video")
      .evaluate((video: HTMLVideoElement) => video.currentTime),
  ).toBeLessThan(0.4);
  await expect
    .poll(async () => (await controller()).currentAsset ?? null, {
      timeout: 10000,
    })
    .toBeNull();
  await settle(commandPage, page);
});

test("animated GIF replay restarts with identical persisted media identity", async ({
  playback,
}) => {
  const { bootstrap, client, controller, settle } = playback;
  const commandPage = playback.page;
  const page = await client("display");
  await bootstrap(commandPage);
  await bootstrap(page);
  const url = await page.evaluate(() => {
    const bytes = [
      ...new TextEncoder().encode("GIF89a"),
      1,
      0,
      1,
      0,
      128,
      0,
      0,
      255,
      0,
      0,
      0,
      255,
      0,
      33,
      255,
      11,
      ...new TextEncoder().encode("NETSCAPE2.0"),
      3,
      1,
      0,
      0,
      0,
    ];
    for (const pixel of [0, 1])
      bytes.push(
        33,
        249,
        4,
        0,
        80,
        0,
        0,
        0,
        44,
        0,
        0,
        0,
        0,
        1,
        0,
        1,
        0,
        0,
        2,
        2,
        pixel === 0 ? 68 : 76,
        1,
        0,
      );
    bytes.push(59);
    return URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "image/gif" }),
    );
  });
  const media = { key: "animated-gif", type: "IMAGE", url } satisfies Asset;
  const pixel = async () => {
    const box = await page.locator("#root img").boundingBox();
    if (!box) return [];
    // Canvas drawImage(animatedImage) samples the default frame, so observe
    // actual browser-composited pixels instead. A one-pixel PNG has no prior
    // pixel/row dependencies for any of PNG's scanline filters.
    const png = await page.screenshot({
      clip: {
        x: Math.floor(box.x + box.width / 2),
        y: Math.floor(box.y + box.height / 2),
        width: 1,
        height: 1,
      },
    });
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < png.length; ) {
      const size = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
        chunks.push(png.subarray(offset + 8, offset + 8 + size));
      offset += size + 12;
    }
    return [...inflateSync(Buffer.concat(chunks)).subarray(1, 4)];
  };
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect.poll(pixel).toEqual([255, 0, 0]);
  await expect
    .poll(pixel, { intervals: [100], timeout: 2500 })
    .toEqual([0, 255, 0]);
  await page.evaluate(() =>
    Object.assign(window, { oldGif: document.querySelector("#root img") }),
  );
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector("#root img") !==
          (window as unknown as { oldGif: HTMLImageElement }).oldGif,
      ),
    )
    .toBe(true);
  expect(await pixel()).toEqual([255, 0, 0]);
  expect((await controller()).currentAsset?.asset).toEqual(media);
  await settle(commandPage, page);
});

test("real browser react-youtube recreates the player and captures old end callbacks with an offline API double", async ({
  playback,
}) => {
  const { bootstrap, client, controller, settle } = playback;
  const commandPage = playback.page;
  const page = await client("display");
  await page.addInitScript(() => {
    type Options = {
      videoId: string;
      events: Record<string, (event: unknown) => void>;
    };
    const players: { videoId: string; destroyed: boolean; end: () => void }[] =
      [];
    class Player {
      iframe: HTMLIFrameElement;
      record: (typeof players)[number];
      constructor(element: HTMLElement, options: Options) {
        this.iframe = document.createElement("iframe");
        element.replaceWith(this.iframe);
        this.record = {
          videoId: options.videoId,
          destroyed: false,
          end: () => options.events.onStateChange?.({ target: this, data: 0 }),
        };
        players.push(this.record);
        queueMicrotask(() => options.events.onReady?.({ target: this }));
      }
      getIframe() {
        return this.iframe;
      }
      destroy() {
        this.record.destroyed = true;
        this.iframe.remove();
      }
      getPlayerState() {
        return 1;
      }
      playVideo() {
        /* The double has no remote playback. */
      }
      pauseVideo() {
        /* The double has no remote playback. */
      }
      stopVideo() {
        /* The double has no remote playback. */
      }
    }
    Object.assign(window, { YT: { Player }, youtubePlayers: players });
  });
  await bootstrap(commandPage);
  await bootstrap(page);
  const media = {
    key: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    type: "URL",
  } satisfies Asset;
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect(page.locator("#root iframe")).toHaveCount(1);
  await commandPage.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { youtubePlayers: object[] }).youtubePlayers
            .length,
      ),
    )
    .toBe(2);
  const before = await controller();
  const records = await page.evaluate(() => {
    const players = (
      window as unknown as {
        youtubePlayers: {
          videoId: string;
          destroyed: boolean;
          end: () => void;
        }[];
      }
    ).youtubePlayers;
    players[0]!.end();
    return players.map(({ videoId, destroyed }) => ({ videoId, destroyed }));
  });
  expect(records).toEqual([
    { videoId: "jNQXAC9IVRw", destroyed: true },
    { videoId: "jNQXAC9IVRw", destroyed: false },
  ]);
  await page.waitForTimeout(100);
  await settle(commandPage, page);
  expect(await controller()).toEqual(before);
  expect(before.currentAsset?.asset).toEqual(media);
  expect(
    await page.evaluate(() => window.playbackHarness.snapshot().eligible),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { youtubePlayers: { end: () => void }[] }
    ).youtubePlayers[1]!.end(),
  );
  await expect
    .poll(async () => (await controller()).currentAsset ?? null)
    .toBeNull();
  await settle(commandPage, page);
});
