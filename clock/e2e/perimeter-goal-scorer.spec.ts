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
  ensureEmulatorUser,
  test,
} from "./fixtures/test-helpers";

const OWNER_HEADERS = { Authorization: "Bearer owner" };

// -- Storage fixtures (portrait, crest, base ads) -----------------------------

const storageRules = readFileSync(
  resolve(__dirname, "../../storage.rules"),
  "utf8",
);

const portraitBytes = readFileSync(
  resolve(__dirname, "../src/perimeter/__fixtures__/portrait-fagn.png"),
);
const crestBytes = readFileSync(
  resolve(__dirname, "../src/perimeter/__fixtures__/crest.png"),
);

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 90, 255, 255] as const;
const CELEBRATION_COLOR = [255, 40, 40] as const;
const CREST_COLOR = [220, 160, 20] as const;

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

// A dedicated small web venue: two 1920x108 strips side by side with a fast
// cue (400 ms) so base advancement is observable inside a test.
const scorerMapping = {
  version: 1,
  revision: "scorer-e2e-1",
  renderer: "web",
  framebuffer: { width: 3840, height: 108, background: "black" },
  logicalScreens: {
    "screen-west": {
      id: "screen-west",
      name: "West",
      width: 1920,
      height: 108,
    },
    "screen-east": {
      id: "screen-east",
      name: "East",
      width: 1920,
      height: 108,
    },
  },
  compatibilityKeys: {
    base: { "1": "screen-west", "3": "screen-east" },
    overlay: { "2": "screen-west", "4": "screen-east" },
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
    {
      id: "east-region",
      logicalScreenId: "screen-east",
      source: { x: 0, y: 0, width: 1920, height: 108 },
      destination: { x: 1920, y: 0, width: 1920, height: 108 },
      transform: {
        rotation: 0,
        flipX: false,
        flipY: false,
        allowScaling: false,
        allowClipping: false,
        allowSourceOverlap: false,
        allowDestinationOverlap: false,
        zIndex: 1,
      },
    },
  ],
  playback: { cueDurationMs: 400, videoPolicy: "fit-to-cue" },
};

async function patch(_page: Page, path: string, data: unknown): Promise<void> {
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
  );
  return (await response.json()) as Record<string, unknown>;
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

const isColor = (
  actual: number[],
  expected: readonly number[],
  tolerance = 28,
) =>
  actual.length === 4 &&
  [0, 1, 2].every(
    (channel) => Math.abs(actual[channel]! - expected[channel]!) <= tolerance,
  );

// Controller login for a venue that also offers a Perimeter entry: the
// scoreboard button ("{label} {screen name}") is targeted exactly so the
// strict-mode locator does not collide with the Perimeter button.
async function loginController(page: Page): Promise<void> {
  await page.getByPlaceholder("E-mail").waitFor({ state: "visible" });
  await page.getByPlaceholder("E-mail").fill(`e2e-test-0@test.com`);
  await page.getByPlaceholder("Lykilorð").fill("testpassword123");
  await page.getByRole("button", { name: "Innskrá", exact: true }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { __firebaseAuthUID?: string }).__firebaseAuthUID,
    null,
    { timeout: 15000 },
  );
  const realUID = await page.evaluate(
    () =>
      (window as unknown as { __firebaseAuthUID?: string }).__firebaseAuthUID ??
      null,
  );
  if (!realUID) throw new Error("No Firebase auth UID after login.");
  await fetch(
    `http://127.0.0.1:9000/auth/${realUID}/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
    {
      method: "PUT",
      headers: OWNER_HEADERS,
      body: "true",
    },
  );
  const scoreboardButton = page.getByRole("button", {
    name: `Test Location ${TEST_LISTEN_PREFIX.replace("test-location-", "")} Display 1`,
  });
  await scoreboardButton.waitFor({ state: "visible", timeout: 15000 });
  await scoreboardButton.click({ force: true });
  await page
    .getByRole("button", { name: "Biðröð" })
    .waitFor({ state: "visible", timeout: 10000 });
}

test.describe("Web perimeter goal scorer", () => {
  let storageEnv: RulesTestEnvironment;

  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await ensureEmulatorUser();
    storageEnv = await testEnvPromise;
  });

  test.beforeEach(async ({ clockPage }) => {
    await clearEmulatorData();
    const redGeneration = await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-red.png`,
      pngBytes(64, 32, RED),
    );
    const blueGeneration = await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-blue.png`,
      pngBytes(64, 32, BLUE),
    );
    // Personalized celebration image for player 10; player 999 has none, so
    // selecting them exercises the crest fallback.
    await seedObject(
      storageEnv,
      `${TEST_LISTEN_PREFIX}/players/10-fagn.png`,
      portraitBytes,
    );
    await seedObject(storageEnv, `${TEST_LISTEN_PREFIX}/crest.png`, crestBytes);

    await patch(clockPage, `locations/${TEST_LISTEN_PREFIX}`, {
      label: `Test Location ${TEST_LISTEN_PREFIX.replace("test-location-", "")}`,
      screens: [{ name: "Display 1" }],
      perimeterDisplay: scorerMapping,
    });
    await patch(clockPage, `states/${TEST_LISTEN_PREFIX}/perimeter/adLayout`, {
      version: 1,
      revision: "ads-scorer-e2e",
      columns: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          files: {
            "1": {
              name: "scorer-e2e-red.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-red.png`,
              generation: redGeneration,
            },
            "3": {
              name: "scorer-e2e-red.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-red.png`,
              generation: redGeneration,
            },
          },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          files: {
            "1": {
              name: "scorer-e2e-blue.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-blue.png`,
              generation: blueGeneration,
            },
            "3": {
              name: "scorer-e2e-blue.png",
              source: `gs://vikes-match-clock-test.appspot.com/${TEST_LISTEN_PREFIX}/perimeter/scorer-e2e-blue.png`,
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
      queues: {},
      activeQueueId: null,
      playing: false,
      assetView: "assets",
      view: "match",
      roster: {
        home: [
          { id: 10, name: "Jón", number: 7, show: true, role: "FW" },
          { id: 999, name: "Anna", number: 8, show: true, role: "MF" },
        ],
        away: [],
      },
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
      goalGif1: "https://storage.example.com/goal.gif",
    });
  });

  test("selects a scorer, renders the semantic overlay, falls back, and clears", async ({
    browser,
    clockPage,
  }) => {
    // -- The anonymous perimeter display -----------------------------------
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

      // -- The controller selects a scorer --------------------------------
      await clockPage.goto("/");
      await loginController(clockPage);
      await clockPage
        .locator(".view-mode-buttons")
        .getByText("Match", { exact: true })
        .click();

      await clockPage
        .locator(".preview-score-buttons")
        .first()
        .getByRole("button")
        .first()
        .click({ force: true });
      await clockPage.getByText("Veldu leikmann sem skoraði").waitFor();
      await clockPage.getByText("Jón", { exact: true }).click();

      // The perimeter receives the semantic scorer command (the generic
      // goal command may still be visible until the write lands).
      await expect
        .poll(
          async () => {
            const doc = await readRtdb(
              `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
            );
            return doc.version;
          },
          { timeout: 15_000, intervals: [300, 500, 1_000] },
        )
        .toBe(2);
      const overlayDoc = await readRtdb(
        `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
      );
      expect(overlayDoc.kind).toBe("goal-scorer");
      expect(overlayDoc.player).toEqual({
        id: "10",
        name: "Jón",
        number: "7",
      });

      // The complete composed overlay is visible above the base: the
      // personalized celebration image (red portrait fixture) covers the
      // start of the west strip.
      await expect
        .poll(
          async () => {
            const pixel = await samplePixel(displayPage, 20, 54);
            return isColor(pixel, CELEBRATION_COLOR);
          },
          { timeout: 20_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // -- Fallback: select the crest-only player --------------------------
      await clockPage
        .locator(".preview-score-buttons")
        .first()
        .getByRole("button")
        .first()
        .click({ force: true });
      await clockPage.getByText("Veldu leikmann sem skoraði").waitFor();
      await clockPage.getByText("Anna", { exact: true }).click();

      // Player 999 has no celebration image: the band composes the venue
      // crest (gold) instead. The new command supersedes the previous one.
      await expect
        .poll(
          async () => {
            const doc = await readRtdb(
              `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
            );
            return doc.player ? (doc.player as Record<string, unknown>).id : "";
          },
          { timeout: 15_000, intervals: [300, 500, 1_000] },
        )
        .toBe("999");
      const fallbackDoc = await readRtdb(
        `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
      );
      expect(fallbackDoc.version).toBe(2);

      // Player 999 has no celebration image: the band composes the venue
      // crest (gold) instead.
      await expect
        .poll(
          async () => {
            const pixel = await samplePixel(displayPage, 20, 54);
            return isColor(pixel, CREST_COLOR);
          },
          { timeout: 20_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);

      // -- Clear: the advancing base playlist becomes visible again -------
      await patch(
        clockPage,
        `states/${TEST_LISTEN_PREFIX}/perimeter/overlay`,
        null,
      );
      await expect
        .poll(
          async () => {
            const pixel = await samplePixel(displayPage, 20, 54);
            return isColor(pixel, RED) || isColor(pixel, BLUE);
          },
          { timeout: 10_000, intervals: [500, 1_000, 1_000, 2_000] },
        )
        .toBe(true);
    } finally {
      await displayContext.close();
    }
  });
});
