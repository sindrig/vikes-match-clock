import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import type { TimedAssetCompletionObservation } from "../src/lib/conditionalTransitions";
import type { ControllerState } from "../src/types";
import type {} from "./fixtures/playback-occurrence-harness";

test.describe.configure({ mode: "serial", timeout: 60000 });
const namespace = "vikes-match-clock-test";
const venue = "audit244";
const email = "audit244@example.test";
const password = "audit244-emulator-only";
const asset = {
  key: "A",
  type: "IMAGE",
  url: "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
};
const rules = JSON.parse(
  readFileSync(resolve(__dirname, "../../firebase-rules.json"), "utf8"),
) as unknown;
async function rest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=${namespace}`,
    {
      method,
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  expect(response.ok).toBe(true);
  return response.json();
}
async function controller() {
  return (await rest("GET", `states/${venue}/controller`)) as ControllerState;
}
async function bootstrap(page: Page) {
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await page.addInitScript(() => {
    localStorage.setItem("clock_listenPrefix", "audit244");
  });
  await page.goto("/e2e/fixtures/playback-occurrences.html");
  await page.waitForFunction(() => Boolean(window.playbackHarness));
  await page.evaluate(
    ({ email, password }) => window.playbackHarness.login(email, password),
    { email, password },
  );
  await expect
    .poll(() => page.evaluate(() => window.playbackHarness.snapshot().eligible))
    .toBe(true);
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
});

for (const initialId of [null, "identified-A"]) {
  test(`real SDK competing ${initialId === null ? "legacy" : "identified"} completions commit once, including a forced hash conflict`, async ({
    browser,
    page,
  }) => {
    if (initialId)
      await rest("PATCH", `states/${venue}/controller/currentAsset`, {
        occurrenceId: initialId,
      });
    const other = await browser.newContext();
    try {
      const second = await other.newPage();
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
        await second.evaluate(
          (old) => window.playbackHarness.commands.completeAssetIfCurrent(old),
          observed,
        ),
      ).toBe(false);
    } finally {
      await other.close();
    }
  });
}

test("A to B to A rejects the old observation and preserves URLs and keys", async ({
  page,
}) => {
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
});

test("malformed present IDs never become eligible legacy observations and real SDK rules still deny unauthorized writes", async ({
  page,
}) => {
  await bootstrap(page);
  await expect(
    page.evaluate(() => window.playbackHarness.deny()),
  ).rejects.toThrow(/permission_denied/i);
  for (const id of ["", " ", false, 7, { unexpected: true }]) {
    await rest("PATCH", `states/${venue}/controller/currentAsset`, {
      occurrenceId: id,
    });
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
  expect(await rest("GET", `audit/${venue}`)).toBeNull();
});

test("unchanged rules permit an old writer to clear replayed identified media: documented mixed-binary limit", async ({
  page,
}) => {
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
  expect((await controller()).currentAsset ?? null).toBeNull();
});

test("native video replay remounts with the same source and an old actual onEnded cannot clear it", async ({
  page,
}) => {
  await bootstrap(page);
  const url = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    const timer = setInterval(() => {
      context.fillStyle = "red";
      context.fillRect(0, 0, 32, 32);
    }, 50);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    recorder.stop();
    await done;
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
  });
  const media = { key: "native-video", type: "VIDEO", url };
  await page.evaluate(
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
  await page.evaluate(() =>
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
  const deferred = await controller();
  await page.evaluate(() => {
    (window as unknown as { oldEnd: () => void }).oldEnd();
  });
  await page.waitForTimeout(100);
  expect(await controller()).toEqual(deferred);
  await page.evaluate(
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
  await page.evaluate(() => {
    (window as unknown as { oldEnd: () => void }).oldEnd();
  });
  await page.waitForTimeout(100);
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
});

test("animated GIF replay restarts with identical persisted media identity", async ({
  page,
}) => {
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
  const media = { key: "animated-gif", type: "IMAGE", url };
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
  await page.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect.poll(pixel).toEqual([255, 0, 0]);
  await expect
    .poll(pixel, { intervals: [100], timeout: 2500 })
    .toEqual([0, 255, 0]);
  await page.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  expect(await pixel()).toEqual([255, 0, 0]);
  expect((await controller()).currentAsset?.asset).toEqual(media);
});

test("real browser react-youtube recreates the player and captures old end callbacks with an offline API double", async ({
  page,
}) => {
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
  await bootstrap(page);
  const media = {
    key: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    type: "URL",
  };
  await page.evaluate(
    (asset) => window.playbackHarness.commands.renderAsset(asset),
    media,
  );
  await expect(page.locator("#root iframe")).toHaveCount(1);
  await page.evaluate(
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
  expect(await controller()).toEqual(before);
  expect(before.currentAsset?.asset).toEqual(media);
  await page.evaluate(() =>
    (
      window as unknown as { youtubePlayers: { end: () => void }[] }
    ).youtubePlayers[1]!.end(),
  );
  await expect
    .poll(async () => (await controller()).currentAsset ?? null)
    .toBeNull();
});
