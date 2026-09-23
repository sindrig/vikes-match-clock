import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import zlib from "node:zlib";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { expect, type Page } from "@playwright/test";
import {
  TEST_LISTEN_PREFIX,
  clearEmulatorData,
  test,
} from "./fixtures/test-helpers";

const OWNER_HEADERS = { Authorization: "Bearer owner" };

// -- Storage fixtures (band photos, overlay media, base ads) ------------------

const storageRules = readFileSync(
  resolve(__dirname, "../../storage.rules"),
  "utf8",
);

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 90, 255, 255] as const;
// Card photos are distinct from the deck/overlay colors so a single grid
// pass can identify which band content is live.
const OFF_PHOTO_COLOR = [0, 200, 0] as const;
const ON_PHOTO_COLOR = [240, 200, 0] as const;

// Minimal valid PNG encoder (8-bit RGBA, no filtering) for colored fixtures.
function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngBytes(
  width: number,
  height: number,
  rgb: readonly number[],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowLength = 1 + width * 4;
  const raw = Buffer.alloc(height * rowLength);
  const pixel = Buffer.from([rgb[0], rgb[1], rgb[2], 255]);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < width; x += 1) {
      pixel.copy(raw, y * rowLength + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const testEnvPromise = initializeTestEnvironment({
  projectId: "vikes-match-clock-test",
  storage: {
    host: "127.0.0.1",
    port: 9199,
    rules: storageRules,
    // The app connects with the emulator config's bucket name.
    bucket: "vikes-match-clock-test.appspot.com",
  },
});

// Uploads a fixture into the emulator bucket the app connects with (rules
// disabled) and returns the object's immutable generation.
async function seedObject(
  env: RulesTestEnvironment,
  objectPath: string,
  bytes: Buffer,
): Promise<string> {
  let generation = "";
  await env.withSecurityRulesDisabled(async (context) => {
    const file = context
      .storage("gs://vikes-match-clock-test.appspot.com")
      .ref(objectPath);
    await file.put(bytes);
    const metadata = await file.getMetadata();
    generation = String(metadata.generation);
  });
  return generation;
}

// -- Perimeter test scaffolding ------------------------------------------------

// A dedicated small web venue: one 1920x108 strip with a fast cue (400 ms)
// so base advancement is observable inside a test.
const bandMapping = {
  version: 1,
  revision: "band-e2e-1",
  renderer: "web",
  framebuffer: { width: 1920, height: 108, background: "black" },
  logicalScreens: {
    "screen-west": {
      id: "screen-west",
      name: "West",
      width: 1920,
      height: 108,
    },
  },
  compatibilityKeys: {
    base: { "1": "screen-west" },
    overlay: { "2": "screen-west" },
  },
  regions: [
    {
      id: "west-region",
      logicalScreenId: "screen-west",
      source: { x: 0, y: 0, width: 1920, height: 108 },
      destination: { x: 0, y: 0, width: 1920, height: 108 },
      transform: {
        rotation: 0,
        flipX: false,
        flipY: false,
        allowScaling: false,
        allowClipping: false,
        allowSourceOverlap: false,
        allowDestinationOverlap: false,
        zIndex: 0,
      },
    },
  ],
  playback: { cueDurationMs: 400, videoPolicy: "fit-to-cue" },
};

async function patch(
  clockPage: Page,
  path: string,
  data: unknown,
): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=vikes-match-clock-test`,
    {
      method: "PATCH",
      headers: { ...OWNER_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) {
    throw new Error(`RTDB patch failed for ${path}: ${response.status}`);
  }
}

async function readRtdb(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(
    `http://127.0.0.1:9000/${path}.json?ns=vikes-match-clock-test`,
    // The audit path is rules-protected; read as the emulator owner like the
    // patch helper so the empty-audit assertion observes reality.
    { headers: OWNER_HEADERS },
  );
  return (await response.json()) as Record<string, unknown>;
}

// Emulator Storage serves objects over plain HTTP with permissive CORS, so
// the band loader can fetch a seeded card photo directly by its URL.
function emulatorDownloadUrl(objectPath: string): string {
  return `http://127.0.0.1:9199/v0/b/vikes-match-clock-test.appspot.com/o/${encodeURIComponent(
    objectPath,
  )}?alt=media`;
}

// Reads one RGBA pixel of the perimeter canvas through the live WebGL
// framebuffer (valid inside the same animation frame the app draws in).
async function samplePixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      new Promise<number[]>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-testid="perimeter-canvas"]',
        );
        const context = canvas?.getContext("webgl");
        requestAnimationFrame(() => {
          if (!canvas || !context) {
            resolve([]);
            return;
          }
          const buffer = new Uint8Array(4);
          context.readPixels(
            px!,
            canvas.height - 1 - py!,
            1,
            1,
            context.RGBA,
            context.UNSIGNED_BYTE,
            buffer,
          );
          resolve(Array.from(buffer));
        });
      }),
    [x, y],
  );
}

// A 128x64 photo's portrait slot spans 216 px of the band; a 12-point grid
// spaced 150 px always intersects a portrait while the band is live.
const GRID_POINTS: Array<[number, number]> = Array.from(
  { length: 12 },
  (_, index) => [80 + index * 150, 54],
);

async function sampleGrid(
  page: Page,
  points: Array<[number, number]>,
): Promise<number[][]> {
  const samples: number[][] = [];
  for (const [x, y] of points) {
    samples.push(await samplePixel(page, x, y));
  }
  return samples;
}

const isColor = (
  actual: number[],
  expected: readonly number[],
  tolerance = 28,
) =>
  actual.length === 4 &&
  [0, 1, 2].every(
    (channel) => Math.abs(actual[channel]! - expected[channel]!) <= tolerance,
  );

async function anyColor(
  page: Page,
  expected: readonly (readonly number[])[],
): Promise<boolean> {
  const samples = await sampleGrid(page, GRID_POINTS);
  return samples.some((sample) =>
    expected.some((color) => isColor(sample, color)),
  );
}

test.describe("Web perimeter player band", () => {
  let storageEnv: RulesTestEnvironment;
  let redGeneration = "";

  test.setTimeout(180_000);

  test.beforeAll(async () => {
    storageEnv = await testEnvPromise;
  });

  test.beforeEach(async ({ clockPage }) => {
    await clearEmulatorData();
    redGeneration = await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/perimeter/band-e2e-red.png`,
      pngBytes(64, 32, RED),
    );
    const blueGeneration = await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/perimeter/band-e2e-blue.png`,
      pngBytes(64, 32, BLUE),
    );
    // Lineup/substitution card photos: identifier-shaped `{id}.png` names
    // (no -fagn suffix), exercising the extended public-read rule.
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/players/10.png`,
      pngBytes(128, 64, OFF_PHOTO_COLOR),
    );
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/players/20.png`,
      pngBytes(128, 64, ON_PHOTO_COLOR),
    );

    await patch(clockPage, `locations/${TEST_LISTEN_PREFIX}`, {
      label: `Test Location ${TEST_LISTEN_PREFIX.replace("test-location-", "")}`,
      screens: [{ name: "Display 1" }],
      perimeterDisplay: bandMapping,
    });
    await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/perimeter/adLayout`, {
      version: 1,
      revision: "ads-band-e2e",
      columns: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          files: {
            "1": {
              name: "band-e2e-red.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/band-e2e-red.png`,
              generation: redGeneration,
            },
          },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          files: {
            "1": {
              name: "band-e2e-blue.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/band-e2e-blue.png`,
              generation: blueGeneration,
            },
          },
        },
      ],
    });
    // The perimeter is on, so the base playlist plays immediately.
    await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/perimeter`, {
      enabled: true,
      state: "on",
    });
    await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
      queues: {
        lineup: {
          id: "lineup",
          name: "Byrjunarlið",
          items: [],
          autoPlay: true,
          imageSeconds: 5,
          cycle: false,
          order: 0,
        },
      },
      activeQueueId: "lineup",
      playing: true,
      assetView: "assets",
      view: "match",
      roster: { home: [], away: [] },
      currentAsset: null,
      refreshToken: "",
    });
    await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/view`, {
      vp: {
        style: { height: 1080, width: 1920 },
        name: "1080p",
        key: "viken",
      },
      background: "Default",
    });
  });

  test("anonymous reads follow the extended player media rules", async () => {
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/players/30.png`,
      pngBytes(8, 8, RED),
    );
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/players/private-notes.txt`,
      Buffer.from("secret"),
    );
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/club-logos/custom.png`,
      pngBytes(8, 8, RED),
    );
    // Anonymous downloads through the storage emulator's REST surface,
    // which enforces the seeded rules (no auth headers).
    const objectUrl = (name: string) =>
      `http://127.0.0.1:9199/v0/b/vikes-match-clock-test.appspot.com/o/${encodeURIComponent(
        `${TEST_LISTEN_PREFIX}/${name}`,
      )}?alt=media`;
    const allowed = await fetch(objectUrl("players/30.png"));
    expect(allowed.status).toBe(200);
    const clubLogo = await fetch(objectUrl("club-logos/custom.png"));
    expect(clubLogo.status).toBe(200);
    const denied = await fetch(objectUrl("players/private-notes.txt"));
    expect(denied.status).toBe(403);
  });

  test("renders the lineup band, covers it with a goal overlay, and restores", async ({
    browser,
    clockPage,
  }) => {
    const displayContext = await browser.newContext();
    const displayPage = await displayContext.newPage();
    try {
      await displayPage.addInitScript(() => {
        localStorage.setItem("clock_sync", "true");
      });
      await displayPage.goto("/");
      await displayPage.locator(".initial-screen-select").selectOption({
        label: `Test Location ${TEST_LISTEN_PREFIX.replace("test-location-", "")} Perimeter`,
      });
      await displayPage.getByRole("button", { name: "Birta skjá" }).click();
      await expect(displayPage.getByTestId("perimeter-display")).toBeVisible();

      // The base playlist advances: red cue then blue cue.
      let sawRed = false;
      let sawBlue = false;
      for (let i = 0; i < 12 && !(sawRed && sawBlue); i += 1) {
        const pixel = await samplePixel(displayPage, 960, 54);
        sawRed = sawRed || isColor(pixel, RED);
        sawBlue = sawBlue || isColor(pixel, BLUE);
        await displayPage.waitForTimeout(120);
      }
      expect(sawRed).toBe(true);
      expect(sawBlue).toBe(true);

      // -- The lineup queue plays a player card -----------------------------
      // (The same state playQueue writes when an item becomes current.)
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
        currentAsset: {
          asset: {
            type: "PLAYER",
            key: emulatorDownloadUrl(`${TEST_LISTEN_PREFIX}/players/10.png`),
            name: "Jón",
            number: 7,
            teamName: "Víkingur R",
          },
          time: null,
        },
        activeQueueId: "lineup",
        playing: true,
      });

      // The band derives from the current asset: the player photo (green
      // fixture) appears on the band canvas, above the base deck.
      await expect
        .poll(async () => anyColor(displayPage, [OFF_PHOTO_COLOR]), {
          timeout: 25_000,
          intervals: [500, 800, 1_000, 1_500],
        })
        .toBe(true);

      // -- A goal overlay covers the band ----------------------------------
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`, {
        version: 1,
        id: "band-e2e-overlay-1",
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "band-e2e-red.png",
                source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/band-e2e-red.png`,
                generation: redGeneration,
              },
            },
          },
        ],
      });
      await expect
        .poll(
          async () => isColor(await samplePixel(displayPage, 960, 54), RED),
          { timeout: 15_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // -- Clearing the overlay restores the band ---------------------------
      await patch(
        clockPage,
        `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
        null,
      );
      await expect
        .poll(async () => anyColor(displayPage, [OFF_PHOTO_COLOR]), {
          timeout: 15_000,
          intervals: [500, 1_000, 1_000, 2_000],
        })
        .toBe(true);

      // -- Stopping the queue restores the base deck ------------------------
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
        currentAsset: null,
        playing: false,
      });
      await expect
        .poll(
          async () => isColor(await samplePixel(displayPage, 960, 54), RED),
          { timeout: 15_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // The read-only guarantee: band derivation wrote no audit events.
      const audit = await readRtdb(`audit/${TEST_LISTEN_PREFIX}`);
      expect(audit).toBeNull();
    } finally {
      await displayContext.close();
    }
  });

  test("derives the substitution band and drops it for an invalid sub", async ({
    browser,
    clockPage,
  }) => {
    const displayContext = await browser.newContext();
    const displayPage = await displayContext.newPage();
    try {
      await displayPage.addInitScript(() => {
        localStorage.setItem("clock_sync", "true");
      });
      await displayPage.goto("/");
      await displayPage.locator(".initial-screen-select").selectOption({
        label: `Test Location ${TEST_LISTEN_PREFIX.replace("test-location-", "")} Perimeter`,
      });
      await displayPage.getByRole("button", { name: "Birta skjá" }).click();
      await expect(displayPage.getByTestId("perimeter-display")).toBeVisible();

      // The substitution card is stepped to from the Skiptingar queue: the
      // same state activating the queue item writes.
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
        currentAsset: {
          asset: {
            type: "SUB",
            key: "sub-key",
            subIn: {
              type: "PLAYER",
              key: emulatorDownloadUrl(`${TEST_LISTEN_PREFIX}/players/20.png`),
              name: "Jón",
              number: 7,
              teamName: "Víkingur R",
            },
            subOut: {
              type: "PLAYER",
              key: emulatorDownloadUrl(`${TEST_LISTEN_PREFIX}/players/10.png`),
              name: "Siggi",
              number: 12,
              teamName: "Víkingur R",
            },
          },
          time: null,
        },
        activeQueueId: "lineup",
        playing: true,
      });

      // Both substitution portraits are visible on the same grid pass: the
      // off player (green, left) and the on player (yellow, right).
      let sawOff = false;
      let sawOn = false;
      await expect
        .poll(
          async () => {
            const samples = await sampleGrid(displayPage, GRID_POINTS);
            sawOff = sawOff || samples.some((s) => isColor(s, OFF_PHOTO_COLOR));
            sawOn = sawOn || samples.some((s) => isColor(s, ON_PHOTO_COLOR));
            return sawOff && sawOn;
          },
          { timeout: 25_000, intervals: [500, 800, 1_000, 1_500] },
        )
        .toBe(true);

      // A goal overlay covers the substitution band and returns on clear.
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`, {
        version: 1,
        id: "band-e2e-overlay-2",
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "band-e2e-red.png",
                source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/band-e2e-red.png`,
                generation: redGeneration,
              },
            },
          },
        ],
      });
      await expect
        .poll(
          async () => isColor(await samplePixel(displayPage, 960, 54), RED),
          { timeout: 15_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);
      await patch(
        clockPage,
        `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
        null,
      );
      await expect
        .poll(
          async () =>
            (await sampleGrid(displayPage, GRID_POINTS)).some(
              (s) => isColor(s, OFF_PHOTO_COLOR) || isColor(s, ON_PHOTO_COLOR),
            ),
          { timeout: 15_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // Advancing past the substitution restores the base deck.
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
        currentAsset: null,
        playing: false,
      });
      await expect
        .poll(
          async () => isColor(await samplePixel(displayPage, 960, 54), RED),
          { timeout: 15_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // An invalid-identity substitution renders no band: the deck keeps
      // showing through.
      await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/controller`, {
        currentAsset: {
          asset: {
            type: "SUB",
            key: "sub-key",
            subIn: {
              type: "PLAYER",
              name: "Jón",
              number: 7,
              teamName: "Víkingur R",
            },
            subOut: {
              type: "PLAYER",
              name: "Siggi",
              teamName: "Víkingur R",
            },
          },
          time: null,
        },
        activeQueueId: "lineup",
        playing: true,
      });
      let deckSeen = false;
      for (let i = 0; i < 6 && !deckSeen; i += 1) {
        const pixel = await samplePixel(displayPage, 960, 54);
        deckSeen = isColor(pixel, RED) || isColor(pixel, BLUE);
        await displayPage.waitForTimeout(200);
      }
      expect(deckSeen).toBe(true);
    } finally {
      await displayContext.close();
    }
  });
});
