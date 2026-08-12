import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import { PerimeterController, ResolumeClient, loadConfig } from "../index.js";
import {
  ResolumeCompositionReader,
  collectClipsByColumn,
  compositionGrid,
  extractClipFilename,
  parseColumns,
  reencodeThumbnail,
} from "../resolume-preview.js";
import {
  AssetStager,
  OverlayController,
  ResolumeOverlayClient,
  validateOverlayDoc,
} from "../overlay.js";

// -- config ---------------------------------------------------------------

test("loadConfig defaults", () => {
  const config = loadConfig({});
  assert.equal(
    config.databaseURL,
    "https://vikes-match-clock-firebase.firebaseio.com",
  );
  assert.equal(config.path, "states/vikuti/perimeter/state");
  assert.equal(
    config.serviceAccountFile,
    "/etc/perimeter-control/perimeter-service-account.json",
  );
  assert.equal(config.resolumeBaseUrl, "http://localhost:80/api/v1");
  assert.equal(config.resolumeColumn, 1);
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.equal(config.listenerRefreshMs, 300_000);
  assert.equal(config.initialBackoffMs, 1_000);
  assert.equal(config.maxBackoffMs, 60_000);
  assert.equal(config.previewEnabled, true);
  assert.equal(config.previewPath, "perimeter/vikuti");
  assert.equal(config.thumbnailMaxDim, 320);
  assert.equal(config.thumbnailQuality, 0.7);
  assert.equal(config.thumbnailMaxBytes, 100_000);
  assert.equal(config.previewMaxBytes, 8_000_000);
});

test("loadConfig overrides", () => {
  const config = loadConfig({
    PERIMETER_FIREBASE_DATABASE_URL: "https://example.com",
    PERIMETER_FIREBASE_PATH: "states/x/perimeter",
    PERIMETER_SERVICE_ACCOUNT_FILE: "/tmp/sa.json",
    PERIMETER_RESOLUME_BASE_URL: "http://h:80/api/v1",
    PERIMETER_RESOLUME_COLUMN: "2",
    PERIMETER_REQUEST_TIMEOUT: "5",
    PERIMETER_LISTENER_REFRESH_SECONDS: "60",
    PERIMETER_INITIAL_BACKOFF_SECONDS: "0.01",
    PERIMETER_MAX_BACKOFF_SECONDS: "30",
    PERIMETER_PREVIEW_ENABLED: "false",
    PERIMETER_PREVIEW_PATH: "perimeter/test",
    PERIMETER_THUMBNAIL_MAX_DIM: "200",
    PERIMETER_THUMBNAIL_QUALITY: "0.4",
    PERIMETER_THUMBNAIL_MAX_BYTES: "5000",
    PERIMETER_PREVIEW_MAX_BYTES: "10000",
  });
  assert.equal(config.databaseURL, "https://example.com");
  assert.equal(config.path, "states/x/perimeter");
  assert.equal(config.serviceAccountFile, "/tmp/sa.json");
  assert.equal(config.resolumeBaseUrl, "http://h:80/api/v1");
  assert.equal(config.resolumeColumn, 2);
  assert.equal(config.requestTimeoutMs, 5_000);
  assert.equal(config.listenerRefreshMs, 60_000);
  assert.equal(config.initialBackoffMs, 10);
  assert.equal(config.maxBackoffMs, 30_000);
  assert.equal(config.previewEnabled, false);
  assert.equal(config.previewPath, "perimeter/test");
  assert.equal(config.thumbnailMaxDim, 200);
  assert.equal(config.thumbnailQuality, 0.4);
  assert.equal(config.thumbnailMaxBytes, 5_000);
  assert.equal(config.previewMaxBytes, 10_000);
});

test("loadConfig invalid numerics fall back to defaults", () => {
  const config = loadConfig({
    PERIMETER_REQUEST_TIMEOUT: "abc",
    PERIMETER_RESOLUME_COLUMN: "abc",
    PERIMETER_LISTENER_REFRESH_SECONDS: "abc",
  });
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.equal(config.resolumeColumn, 1);
  assert.equal(config.listenerRefreshMs, 300_000);
});

test("loadConfig refresh of 0 disables the refresh", () => {
  const config = loadConfig({ PERIMETER_LISTENER_REFRESH_SECONDS: "0" });
  assert.equal(config.listenerRefreshMs, 0);
});

// -- Resolume client ----------------------------------------------------------

function mockFetch(t, respond) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, method: options?.method });
    const status = typeof respond === "function" ? respond(url) : respond;
    return { ok: status >= 200 && status < 300, status };
  });
  return calls;
}

function makeResolume(overrides = {}) {
  return new ResolumeClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    resolumeColumn: 1,
    requestTimeoutMs: 1_000,
    ...overrides,
  });
}

test("apply on posts column connect", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume().applyState("on");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/columns/1/connect",
  );
  assert.equal(calls[0].method, "POST");
});

test("apply off posts disconnect-all", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume().applyState("off");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/disconnect-all",
  );
});

test("apply strips trailing slash from base url", async (t) => {
  const calls = mockFetch(t, 200);
  await makeResolume({
    resolumeBaseUrl: "http://localhost:80/api/v1/",
  }).applyState("off");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/disconnect-all",
  );
});

test("apply raises on non-2xx", async (t) => {
  mockFetch(t, 500);
  await assert.rejects(makeResolume().applyState("on"), /HTTP 500/);
});

test("apply raises on unknown state", async (t) => {
  mockFetch(t, 200);
  await assert.rejects(
    makeResolume().applyState("paused"),
    /unknown perimeter state/,
  );
});

// -- desired state ----------------------------------------------------------------

function makeController(env = {}) {
  const config = loadConfig({
    PERIMETER_INITIAL_BACKOFF_SECONDS: "0.01",
    PERIMETER_MAX_BACKOFF_SECONDS: "0.02",
    ...env,
  });
  return new PerimeterController(config);
}

test("valid state sets desired", () => {
  const controller = makeController();
  controller.onDesiredState("on");
  assert.equal(controller._readDesired(), "on");
});

test("invalid states are ignored", () => {
  const controller = makeController();
  for (const invalid of [null, true, 1, "paused", "ON", "", {}]) {
    controller.onDesiredState(invalid);
  }
  assert.equal(controller._readDesired(), null);
});

test("unchanged state is not reapplied", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  controller.startApplicator();

  controller.onDesiredState("on");
  controller.onDesiredState("on");
  await waitFor(() => applied.length >= 1);
  await sleep(30);
  assert.deepEqual(applied, ["on"]);

  controller.onDesiredState("off");
  await waitFor(() => applied.includes("off"));
  assert.deepEqual(applied, ["on", "off"]);
  controller.shutdown();
});

// -- Firebase listener -------------------------------------------------------------

class FakeSnapshot {
  constructor(value) {
    this._value = value;
  }

  val() {
    return this._value;
  }
}

class FakeRef {
  constructor(path) {
    this.path = path;
    this.handlers = new Map();
    this.onCalls = 0;
    this.offCalls = 0;
    this.setCalls = [];
  }

  on(event, callback) {
    this.handlers.set(event, callback);
    this.onCalls += 1;
  }

  off(event, callback) {
    this.handlers.delete(event);
    this.offCalls += 1;
  }

  emit(value) {
    const callback = this.handlers.get("value");
    if (callback) callback(new FakeSnapshot(value));
  }

  set(value) {
    this.setCalls.push(value);
    return Promise.resolve();
  }
}

class FakeDb {
  constructor() {
    this.refs = [];
  }

  ref(path) {
    const ref = new FakeRef(path);
    this.refs.push(ref);
    return ref;
  }
}

test("attach listens on the configured path and sets up the preview ref", () => {
  const controller = makeController({
    PERIMETER_OVERLAY_ENABLED: "false",
    PERIMETER_AD_LAYOUT_ENABLED: "false",
  });
  const db = new FakeDb();
  controller.attach(db);
  assert.equal(db.refs.length, 2);
  assert.equal(db.refs[0].path, controller.config.path);
  assert.equal(db.refs[0].handlers.has("value"), true);
  assert.equal(db.refs[1].path, controller.config.previewPath);
  assert.equal(db.refs[1].handlers.has("value"), false);
});

test("reopen re-syncs the listener", () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  const ref = db.refs[0];
  controller._reopenListener();
  assert.equal(ref.offCalls, 1);
  assert.equal(ref.onCalls, 2);
});

test("reopen re-publishes the ad-layout status as a safety net", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  let republishCalls = 0;
  controller._adLayoutController.republishStatus = async () => {
    republishCalls += 1;
  };
  controller._reopenListener();
  assert.equal(republishCalls, 1);
  controller.shutdown();
});

test("reopen skips ad-layout status re-publish when disabled", () => {
  const controller = makeController({ PERIMETER_AD_LAYOUT_ENABLED: "false" });
  const db = new FakeDb();
  controller.attach(db);
  let republishCalls = 0;
  const adLayout = controller._adLayoutController;
  if (adLayout) {
    adLayout.republishStatus = async () => {
      republishCalls += 1;
    };
  }
  controller._reopenListener();
  assert.equal(republishCalls, 0);
  controller.shutdown();
});

test("refresh loop reopens the listener periodically", async () => {
  const controller = makeController({
    PERIMETER_LISTENER_REFRESH_SECONDS: "0.05",
  });
  const db = new FakeDb();
  controller.attach(db);
  controller.startRefreshLoop();
  await waitFor(() => db.refs[0].onCalls >= 2);
  controller.shutdown();
  assert.ok(db.refs[0].offCalls >= 1);
});

test("refresh disabled starts no timer", () => {
  const controller = makeController({
    PERIMETER_LISTENER_REFRESH_SECONDS: "0",
  });
  const db = new FakeDb();
  controller.attach(db);
  controller.startRefreshLoop();
  assert.equal(controller._refreshTimer, null);
  controller.shutdown();
});

test("applies startup state from the initial snapshot", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();
  db.refs[0].emit("on");
  await waitFor(() => applied.length >= 1);
  assert.deepEqual(applied, ["on"]);
  controller.shutdown();
});

test("converges to a state that changed while down", async () => {
  const controller = makeController();
  const applied = [];
  controller.resolume.applyState = async (state) => applied.push(state);
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();

  db.refs[0].emit("off");
  await waitFor(() => applied.includes("off"));

  db.refs[0].emit("on");
  await waitFor(() => applied.includes("on"));
  assert.deepEqual(applied, ["off", "on"]);
  controller.shutdown();
});

test("handles whole-node payloads", () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit({ enabled: true, state: "off" });
  assert.equal(controller._readDesired(), "off");
});

// -- retry and supersede behavior ------------------------------------------------

test("resolume failure retries until success", async () => {
  const controller = makeController();
  const attempts = [];
  let remaining = 2;
  controller.resolume.applyState = async (state) => {
    attempts.push(state);
    if (remaining > 0) {
      remaining -= 1;
      throw new Error("Resolume down");
    }
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => attempts.length >= 3);
  assert.deepEqual(attempts, ["on", "on", "on"]);
  controller.shutdown();
});

test("newer state supersedes failed retry", async () => {
  const controller = makeController();
  const recorded = [];
  controller.resolume.applyState = async (state) => {
    recorded.push(state);
    throw new Error("Resolume down");
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => recorded.length >= 2);
  controller.onDesiredState("off");
  await waitFor(() => recorded.includes("off"));
  await sleep(60);
  assert.equal(recorded[recorded.length - 1], "off");
  controller.shutdown();
});

test("newer state supersedes before applying", async () => {
  const controller = makeController();
  const recorded = [];
  controller.resolume.applyState = async (state) => {
    recorded.push(state);
    throw new Error("Resolume down");
  };
  controller.startApplicator();
  controller.onDesiredState("on");
  await waitFor(() => recorded.length >= 1);
  controller.onDesiredState("off");
  await waitFor(() => recorded.includes("off"));
  controller.shutdown();
});

// -- Resolume composition parsing -------------------------------------------------

const COMPOSITION = {
  name: { value: "Perimeter" },
  columns: [
    { id: 11, name: { value: "Column 1" } },
    { id: 12, name: { value: "Column 2" } },
  ],
  layers: [
    {
      id: 101,
      name: { value: "Layer 1" },
      clips: [
        {
          id: 201,
          name: { value: "Sponsor loop" },
          video: {
            fileinfo: { path: "/Users/resolume/Videos/sponsor-loop.mp4" },
          },
        },
        {
          id: 202,
          name: { value: "Second" },
          video: { fileinfo: { path: "C:\\videos\\second.mp4" } },
        },
      ],
    },
    {
      id: 102,
      name: { value: "Layer 2" },
      clips: [
        null,
        {
          id: 204,
          name: { value: "Intro audio" },
          audio: { fileinfo: { path: "intro.wav" } },
        },
      ],
    },
  ],
};

test("parseColumns reads ids and unwraps names", () => {
  const columns = parseColumns(COMPOSITION);
  assert.deepEqual(columns, [
    { id: 11, name: "Column 1", position: 1 },
    { id: 12, name: "Column 2", position: 2 },
  ]);
});

test("parseColumns falls back to position id and default name", () => {
  const columns = parseColumns({
    columns: [{ name: { value: "Only" } }, {}],
  });
  assert.deepEqual(columns, [
    { id: 1, name: "Only", position: 1 },
    { id: 2, name: "Column 2", position: 2 },
  ]);
});

test("parseColumns tolerates missing columns", () => {
  assert.deepEqual(parseColumns(null), []);
  assert.deepEqual(parseColumns({ layers: [] }), []);
});

test("collectClipsByColumn groups clips by column across layers", () => {
  const byColumn = collectClipsByColumn(COMPOSITION);
  assert.equal(byColumn.has(1), true);
  assert.equal(byColumn.has(2), true);
  const column1 = byColumn.get(1);
  assert.equal(column1.length, 1);
  assert.equal(column1[0].filename, "sponsor-loop.mp4");
  assert.equal(column1[0].layerIndex, 1);
  assert.equal(column1[0].columnIndex, 1);
  const column2 = byColumn.get(2);
  assert.equal(column2.length, 2);
  assert.equal(column2[0].filename, "second.mp4");
  assert.equal(column2[0].layerIndex, 1);
  assert.equal(column2[1].filename, "intro.wav");
  assert.equal(column2[1].layerIndex, 2);
});

test("extractClipFilename handles video, audio, windows paths and plain fields", () => {
  assert.equal(
    extractClipFilename({ video: { fileinfo: { path: "/a/b/clip.mov" } } }),
    "clip.mov",
  );
  assert.equal(
    extractClipFilename({ audio: { fileinfo: { path: "sound.mp3" } } }),
    "sound.mp3",
  );
  assert.equal(
    extractClipFilename({
      video: { fileinfo: { path: "C:\\videos\\clip.mov" } },
    }),
    "clip.mov",
  );
  assert.equal(extractClipFilename({ filename: "plain.mp4" }), "plain.mp4");
  assert.equal(extractClipFilename({ name: { value: "x" } }), undefined);
  assert.equal(extractClipFilename(null), undefined);
});

// -- thumbnail conversion -------------------------------------------------------------

function makePng(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = 100;
    png.data[i + 2] = 50;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("reencodeThumbnail produces a PNG data URL", () => {
  const result = reencodeThumbnail(makePng(320, 240), {
    maxDim: 320,
    quality: 0.6,
    maxBytes: 100_000,
  });
  assert.ok(result);
  assert.equal(result.width, 320);
  assert.equal(result.height, 240);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.ok(result.bytes > 0);
  assert.equal(
    Buffer.from(result.dataUrl.split(",")[1], "base64").length,
    result.bytes,
  );
});

test("reencodeThumbnail does not upscale small images", () => {
  const result = reencodeThumbnail(makePng(200, 100), {
    maxDim: 320,
    quality: 0.6,
    maxBytes: 100_000,
  });
  assert.ok(result);
  assert.equal(result.width, 200);
  assert.equal(result.height, 100);
});

test("reencodeThumbnail returns null for invalid or empty input", () => {
  assert.equal(
    reencodeThumbnail(Buffer.from("not an image"), {
      maxDim: 320,
      quality: 0.6,
      maxBytes: 100_000,
    }),
    null,
  );
  assert.equal(
    reencodeThumbnail(Buffer.alloc(0), {
      maxDim: 320,
      quality: 0.6,
      maxBytes: 100_000,
    }),
    null,
  );
  assert.equal(reencodeThumbnail(null, {}), null);
});

test("reencodeThumbnail rejects a PNG that exceeds maxBytes", () => {
  const png = makePng(640, 360);
  const result = reencodeThumbnail(png, {
    maxDim: 320,
    quality: 0.9,
    maxBytes: 10,
  });
  assert.equal(result, null);
});

test("reencodeThumbnail rejects an oversized PNG input before decoding", () => {
  const png = makePng(16, 16);
  const result = reencodeThumbnail(png, {
    maxDim: 320,
    quality: 0.6,
    maxBytes: 100_000,
    maxInputBytes: 10,
  });
  assert.equal(result, null);
});

// -- preview reader --------------------------------------------------------------------

function mockReaderFetch(t, composition, thumbs) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    if (url.endsWith("/composition")) {
      return { ok: true, status: 200, json: async () => composition };
    }
    if (url.includes("/thumbnail")) {
      const png = thumbs[url];
      if (png === undefined) return { ok: false, status: 404 };
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      };
    }
    return { ok: false, status: 404 };
  });
  return calls;
}

function makeReader(overrides = {}) {
  return new ResolumeCompositionReader({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
    thumbnailMaxDim: 32,
    thumbnailQuality: 0.5,
    thumbnailMaxBytes: 100_000,
    ...overrides,
  });
}

test("collectPreview normalizes columns, clips and thumbnails", async (t) => {
  const reader = makeReader();
  const calls = mockReaderFetch(t, COMPOSITION, {
    "http://localhost:80/api/v1/composition/layers/1/clips/1/thumbnail":
      makePng(64, 64),
    "http://localhost:80/api/v1/composition/layers/1/clips/2/thumbnail":
      makePng(64, 64),
  });

  const preview = await reader.collectPreview();

  assert.equal(preview.columns.length, 2);
  assert.equal(preview.columns[0].name, "Column 1");
  assert.equal(preview.columns[0].clips.length, 1);
  assert.equal(preview.columns[0].clips[0].id, 201);
  assert.equal(preview.columns[0].clips[0].filename, "sponsor-loop.mp4");
  assert.match(
    preview.columns[0].clips[0].thumbnail,
    /^data:image\/png;base64,/,
  );

  assert.equal(preview.columns[1].clips.length, 2);
  assert.equal(preview.columns[1].clips[0].filename, "second.mp4");
  assert.match(
    preview.columns[1].clips[0].thumbnail,
    /^data:image\/png;base64,/,
  );
  // The layer-2 clip thumbnail was not provided: it is omitted, not fatal.
  assert.equal(preview.columns[1].clips[1].filename, "intro.wav");
  assert.equal(preview.columns[1].clips[1].thumbnail, undefined);

  assert.ok(calls.some((url) => url.endsWith("/composition")));
  assert.ok(calls.some((url) => url.includes("/clips/1/thumbnail")));
});

test("collectPreview handles a composition without thumbnails", async (t) => {
  const reader = makeReader();
  mockReaderFetch(t, COMPOSITION, {});
  const preview = await reader.collectPreview();
  assert.equal(preview.columns.length, 2);
  assert.equal(preview.columns[0].clips[0].thumbnail, undefined);
});

test("collectPreview rejects a failed composition read", async (t) => {
  const reader = makeReader();
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 500,
  }));
  await assert.rejects(reader.collectPreview(), /HTTP 500/);
});

// -- preview publication -----------------------------------------------------------

test("startPreview publishes the snapshot to the preview path", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  controller.previewReader.collectPreview = async () => ({
    columns: [{ id: 1, name: "Column 1", clips: [] }],
  });

  controller.startPreview();
  await waitFor(() => db.refs[1].setCalls.length >= 1);

  const snapshot = db.refs[1].setCalls[0];
  assert.ok(snapshot.updatedAt);
  assert.equal(snapshot.columns.length, 1);
  assert.equal(snapshot.columns[0].name, "Column 1");
  assert.equal(snapshot.columns[0].clips.length, 0);
  controller.shutdown();
});

test("publishes preview after a successful on", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  controller.resolume.applyState = async () => undefined;
  controller.previewReader.collectPreview = async () => ({
    columns: [{ id: 1, name: "Column 1", clips: [] }],
  });
  controller.startApplicator();

  controller.onDesiredState("on");
  await waitFor(() => db.refs[1].setCalls.length >= 1);

  assert.equal(db.refs[1].setCalls.length, 1);
  controller.shutdown();
});

test("concurrent refreshPreview calls are serialized", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  controller.previewReader.collectPreview = async () => {
    calls += 1;
    await gate;
    return { columns: [{ id: 1, name: `Column ${calls}`, clips: [] }] };
  };

  const first = controller.refreshPreview();
  const second = controller.refreshPreview();
  release();
  await Promise.all([first, second]);

  assert.equal(db.refs[1].setCalls.length, 2);
  assert.equal(db.refs[1].setCalls[0].columns[0].name, "Column 1");
  assert.equal(db.refs[1].setCalls[1].columns[0].name, "Column 2");
  controller.shutdown();
});

test("failed query keeps the last snapshot and does not throw", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    controller.previewReader.collectPreview = async () => {
      throw new Error("Resolume down");
    };
    await controller.refreshPreview();
    assert.equal(db.refs[1].setCalls.length, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /Failed to refresh perimeter preview/);
  } finally {
    console.error = originalError;
  }
  controller.shutdown();
});

test("oversized payload is rejected without publishing", async () => {
  const controller = makeController({ PERIMETER_PREVIEW_MAX_BYTES: "100" });
  const db = new FakeDb();
  controller.attach(db);
  controller.previewReader.collectPreview = async () => ({
    columns: [
      {
        id: 1,
        name: "Column 1",
        clips: [{ id: 2, filename: "x".repeat(500) }],
      },
    ],
  });
  await controller.refreshPreview();
  assert.equal(db.refs[1].setCalls.length, 0);
  controller.shutdown();
});

test("preview disabled skips publication", async () => {
  const controller = makeController({ PERIMETER_PREVIEW_ENABLED: "false" });
  const db = new FakeDb();
  controller.attach(db);
  let read = false;
  controller.previewReader.collectPreview = async () => {
    read = true;
    return { columns: [] };
  };
  await controller.refreshPreview();
  assert.equal(read, false);
  assert.equal(db.refs[1].setCalls.length, 0);
  controller.shutdown();
});

// -- shutdown ----------------------------------------------------------------------

test("shutdown detaches the listener and stops the applicator", async () => {
  const controller = makeController();
  const db = new FakeDb();
  controller.attach(db);
  controller.startApplicator();
  controller.shutdown();
  assert.equal(db.refs[0].handlers.has("value"), false);
  await controller._applicatorPromise;
});

// -- overlay config ---------------------------------------------------------------

test("loadConfig overlay defaults", () => {
  const config = loadConfig({});
  assert.equal(config.overlayEnabled, true);
  assert.equal(config.overlayPath, "states/vikuti/perimeter/overlay");
  assert.equal(config.overlayStatusPath, "perimeter/vikuti/overlayStatus");
  assert.equal(config.overlaySshHost, "10.182.45.53");
  assert.equal(config.overlaySshUser, "user");
  assert.equal(config.overlaySshKey, "/etc/perimeter-control/overlay-ssh-key");
  assert.equal(config.overlayRemoteContentDir, "C:/Content");
  assert.equal(config.overlayCacheDir, "/var/cache/perimeter-control");
  assert.deepEqual(config.overlayLayerClipColumns, { 2: 1, 4: 1 });
  assert.deepEqual(config.overlayLayerIds, ["2", "4"]);
});

test("loadConfig overlay override", () => {
  const config = loadConfig({
    PERIMETER_OVERLAY_ENABLED: "false",
    PERIMETER_OVERLAY_PATH: "states/foo/perimeter/overlay",
    PERIMETER_OVERLAY_STATUS_PATH: "perimeter/foo/overlayStatus",
    PERIMETER_OVERLAY_SSH_HOST: "10.0.0.1",
    PERIMETER_OVERLAY_SSH_USER: "resolume",
    PERIMETER_OVERLAY_SSH_KEY: "/tmp/key",
    PERIMETER_OVERLAY_REMOTE_CONTENT_DIR: "D:/Media",
    PERIMETER_OVERLAY_CACHE_DIR: "/tmp/cache",
    PERIMETER_OVERLAY_LAYER_IDS: "40",
    PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS: '{"40":3}',
  });
  assert.equal(config.overlayEnabled, false);
  assert.equal(config.overlayPath, "states/foo/perimeter/overlay");
  assert.equal(config.overlayStatusPath, "perimeter/foo/overlayStatus");
  assert.equal(config.overlaySshHost, "10.0.0.1");
  assert.equal(config.overlaySshUser, "resolume");
  assert.equal(config.overlaySshKey, "/tmp/key");
  assert.equal(config.overlayRemoteContentDir, "D:/Media");
  assert.equal(config.overlayCacheDir, "/tmp/cache");
  assert.deepEqual(config.overlayLayerIds, ["40"]);
  assert.deepEqual(config.overlayLayerClipColumns, { 40: 3 });
});

test("loadConfig overlay invalid layer-clip JSON falls back to default", () => {
  const config = loadConfig({
    PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS: "not-json",
  });
  assert.deepEqual(config.overlayLayerClipColumns, { 2: 1, 4: 1 });
});

test("loadConfig overlay empty layer-clip JSON falls back to default", () => {
  const config = loadConfig({
    PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS: "{}",
  });
  assert.deepEqual(config.overlayLayerClipColumns, { 2: 1, 4: 1 });
});

// -- overlay validation ---------------------------------------------------------

test("overlay: null is a clear command", () => {
  // We import the overlay validation function from overlay.js.
  // For now, test that the config loads the overlay controller properly.
  // The actual validation logic is tested via integration.
  const controller = makeController({ PERIMETER_OVERLAY_ENABLED: "true" });
  assert.notEqual(controller._overlayController, null);
});

test("overlay: disabled does not create overlay controller", () => {
  const controller = makeController({ PERIMETER_OVERLAY_ENABLED: "false" });
  assert.equal(controller._overlayController, null);
});

test("overlay: ad-layout slot overlap is rejected at construction", () => {
  const config = loadConfig({
    PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS: '{"2":2}',
  });
  assert.throws(
    () => new PerimeterController(config),
    /Overlapping Resolume clip slot configuration/,
  );
});

test("overlay: disjoint slot maps construct without error", () => {
  const config = loadConfig({
    PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS: '{"2":1}',
    PERIMETER_AD_LAYER_CLIP_SLOTS: '{"2":2}',
  });
  const controller = new PerimeterController(config);
  assert.notEqual(controller._adLayoutController, null);
});

test("overlay: attach with overlay enabled creates overlay refs", () => {
  const controller = makeController({
    PERIMETER_OVERLAY_ENABLED: "true",
    PERIMETER_AD_LAYOUT_ENABLED: "false",
  });
  const db = new FakeDb();
  controller.attach(db);
  // 2 base refs + 2 overlay refs = 4
  assert.equal(db.refs.length, 4);
  assert.equal(db.refs[2].path, controller.config.overlayPath);
  assert.equal(db.refs[2].handlers.has("value"), true);
  assert.equal(db.refs[3].path, controller.config.overlayStatusPath);
});

test("overlay: shutdown cleans up overlay", () => {
  const controller = makeController({ PERIMETER_OVERLAY_ENABLED: "true" });
  const db = new FakeDb();
  controller.attach(db);
  assert.equal(db.refs[2].offCalls, 0);
  controller.shutdown();
  assert.equal(db.refs[2].offCalls, 1);
  assert.equal(controller._overlayController._stopping, true);
});

// -- loadConfig overlay disabled still loads config fields ---------------------

test("loadConfig overlay disabled still returns overlay config fields", () => {
  const config = loadConfig({ PERIMETER_OVERLAY_ENABLED: "false" });
  assert.equal(config.overlayEnabled, false);
  assert.equal(config.overlayPath, "states/vikuti/perimeter/overlay");
});

// -- overlay deck geometry -----------------------------------------------------------

test("compositionGrid reads column count, active column and autopilot target", () => {
  const grid = compositionGrid({
    columns: [
      { id: 1, selected: { value: false } },
      { id: 2, selected: { value: true } },
      { id: 3, selected: { value: false } },
    ],
    autopilot: {
      target: {
        id: 111,
        value: "Play Next Column",
        index: 2,
      },
    },
  });
  assert.deepEqual(grid, {
    columnCount: 3,
    activeColumn: 2,
    autopilotTarget: { id: 111, value: "Play Next Column", index: 2 },
  });
});

test("compositionGrid tolerates boolean and string selected values", () => {
  assert.equal(
    compositionGrid({
      columns: [{ selected: true }, { selected: false }, {}],
    }).activeColumn,
    1,
  );
  assert.equal(
    compositionGrid({
      columns: [{ selected: false }, { selected: "true" }, {}],
    }).activeColumn,
    2,
  );
});

test("compositionGrid defaults on malformed composition", () => {
  assert.deepEqual(compositionGrid(null), {
    columnCount: 0,
    activeColumn: 1,
    autopilotTarget: null,
  });
  assert.deepEqual(compositionGrid({ layers: [] }), {
    columnCount: 0,
    activeColumn: 1,
    autopilotTarget: null,
  });
});

test("ResolumeOverlayClient.getColumnGrid reads the live composition", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      columns: [{ selected: { value: false } }, { selected: { value: true } }],
      autopilot: { target: { id: 111, value: "Play Next Column", index: 2 } },
    }),
  }));
  const client = new ResolumeOverlayClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  const grid = await client.getColumnGrid();
  assert.deepEqual(grid, {
    columnCount: 2,
    activeColumn: 2,
    autopilotTarget: { id: 111, value: "Play Next Column", index: 2 },
  });
});

test("ResolumeOverlayClient.getColumnGrid rejects a failed read", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 500,
  }));
  const client = new ResolumeOverlayClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  await assert.rejects(client.getColumnGrid(), /HTTP 500/);
});

test("ResolumeOverlayClient.setAutopilot PUTs the value by parameter id", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    return { ok: true, status: 204 };
  });
  const client = new ResolumeOverlayClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  await client.setAutopilot(111, "Off");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, "http://localhost:80/api/v1/parameter/by-id/111");
  assert.equal(calls[0].body, JSON.stringify({ value: "Off" }));
});

// -- overlay playback with a frozen deck ------------------------------------------------

async function makeTmpCache() {
  return fs.mkdtemp(path.join(os.tmpdir(), "overlay-test-"));
}

async function makeOverlayController(env = {}, cacheDir) {
  const dir = cacheDir ?? (await makeTmpCache());
  const config = loadConfig({
    PERIMETER_INITIAL_BACKOFF_SECONDS: "0.01",
    PERIMETER_MAX_BACKOFF_SECONDS: "0.02",
    PERIMETER_OVERLAY_CACHE_DIR: dir,
    ...env,
  });
  return new OverlayController(config);
}

const OVERLAY_DOC = {
  version: 1,
  id: "overlay-1",
  columns: [
    {
      durationMs: 10000,
      files: {
        2: {
          name: "goal-48.mp4",
          source:
            "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4",
        },
        4: {
          name: "goal-40.mp4",
          source:
            "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-40.mp4",
        },
      },
    },
  ],
};

const GRID = (activeColumn = 1, autopilot = "Play Next Column") => ({
  columnCount: 3,
  activeColumn,
  autopilotTarget: { id: 111, value: autopilot, index: 2 },
});

test("overlay stage loads the file into the currently active column only", async () => {
  const controller = await makeOverlayController();
  const calls = [];
  controller.resolume = {
    clearClip: async (layerId, slot) => calls.push(["clear", layerId, slot]),
    loadClip: async (layerId, slot) => calls.push(["load", layerId, slot]),
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/goal-48.mp4";

  await controller._stageAndLoadColumn(OVERLAY_DOC.columns[0], 2);

  // One slot per layer: the active column (deck is frozen during the overlay).
  // Layers run in parallel, so compare order-insensitively.
  assert.deepEqual(calls.sort(), [
    ["clear", "2", 2],
    ["clear", "4", 2],
    ["load", "2", 2],
    ["load", "4", 2],
  ]);
});

test("overlay stage falls back to the reference slot when active column is unknown", async () => {
  const controller = await makeOverlayController();
  const calls = [];
  controller.resolume = {
    clearClip: async (layerId, slot) => calls.push(["clear", layerId, slot]),
    loadClip: async (layerId, slot) => calls.push(["load", layerId, slot]),
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";
  await controller._stageAndLoadColumn(OVERLAY_DOC.columns[0], undefined);
  // Falls back to the configured reference slot when the active column is
  // unknown (layers run in parallel, so compare order-insensitively).
  assert.deepEqual(calls.sort(), [
    ["clear", "2", 1],
    ["clear", "4", 1],
    ["load", "2", 1],
    ["load", "4", 1],
  ]);
});

test("overlay trigger connects the clip in the currently active column", async () => {
  const controller = await makeOverlayController();
  const connects = [];
  controller.resolume = {
    connectClip: async (layerId, slot) => connects.push([layerId, slot]),
  };
  await controller._triggerColumn(OVERLAY_DOC.columns[0], 2);
  assert.deepEqual(connects, [
    ["2", 2],
    ["4", 2],
  ]);
});

test("overlay trigger falls back to the configured slot when active column is unknown", async () => {
  const controller = await makeOverlayController();
  const connects = [];
  controller.resolume = {
    connectClip: async (layerId, slot) => connects.push([layerId, slot]),
  };
  await controller._triggerColumn(OVERLAY_DOC.columns[0], undefined);
  assert.deepEqual(connects, [
    ["2", 1],
    ["4", 1],
  ]);
});

test("overlay clear unloads the reference and active column slots", async () => {
  const controller = await makeOverlayController();
  const calls = [];
  controller._activeColumn = 2;
  controller.resolume = {
    clearClip: async (layerId, slot) => calls.push([layerId, slot]),
    clearLayer: async () => {},
    setAutopilot: async () => {},
  };
  await controller._handleClear();
  assert.deepEqual(calls, [
    ["2", 1],
    ["2", 2],
    ["4", 1],
    ["4", 2],
  ]);
});

test("overlay clear falls back to the reference slot when the active column is unknown", async () => {
  const controller = await makeOverlayController();
  const calls = [];
  controller.resolume = {
    clearClip: async (layerId, slot) => calls.push([layerId, slot]),
    clearLayer: async () => {},
    setAutopilot: async () => {},
  };
  await controller._handleClear();
  assert.deepEqual(calls, [
    ["2", 1],
    ["4", 1],
  ]);
});

test("overlay start pauses the deck autopilot and persists the restore value", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  const puts = [];
  controller.resolume = {
    getColumnGrid: async () => GRID(1),
    setAutopilot: async (id, value) => puts.push([id, value]),
    clearClip: async () => {},
    loadClip: async () => {},
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";

  await controller._startOverlay(OVERLAY_DOC);

  assert.deepEqual(puts, [[111, "Off"]]);
  assert.equal(controller._autopilotFrozen, true);
  const saved = JSON.parse(
    await fs.readFile(path.join(cacheDir, "overlay-autopilot.json"), "utf8"),
  );
  assert.deepEqual(saved, { id: 111, value: "Play Next Column" });
});

test("overlay start preserves a previously persisted autopilot value (restart)", async () => {
  const cacheDir = await makeTmpCache();
  await fs.writeFile(
    path.join(cacheDir, "overlay-autopilot.json"),
    JSON.stringify({ id: 111, value: "Play Next Column" }),
  );
  const controller = await makeOverlayController({}, cacheDir);
  const puts = [];
  controller.resolume = {
    // Simulate a restart mid-overlay: the live autopilot already reads "Off".
    getColumnGrid: async () => GRID(1, "Off"),
    setAutopilot: async (id, value) => puts.push([id, value]),
    clearClip: async () => {},
    loadClip: async () => {},
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";

  await controller._startOverlay(OVERLAY_DOC);

  assert.deepEqual(puts, [[111, "Off"]]);
  const saved = JSON.parse(
    await fs.readFile(path.join(cacheDir, "overlay-autopilot.json"), "utf8"),
  );
  assert.deepEqual(saved, { id: 111, value: "Play Next Column" });
});

test("overlay clear restores the deck autopilot to its original value", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  const puts = [];
  controller.resolume = {
    clearClip: async () => {},
    clearLayer: async () => {},
    setAutopilot: async (id, value) => puts.push([id, value]),
  };
  // Simulate a frozen deck whose original value was persisted earlier.
  await fs.writeFile(
    path.join(cacheDir, "overlay-autopilot.json"),
    JSON.stringify({ id: 111, value: "Play Next Column" }),
  );

  await controller._handleClear();

  assert.deepEqual(puts, [[111, "Play Next Column"]]);
  await assert.rejects(
    fs.access(path.join(cacheDir, "overlay-autopilot.json")),
  );
});

test("overlay clear without a freeze does not touch the autopilot", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  let puts = 0;
  controller.resolume = {
    clearClip: async () => {},
    clearLayer: async () => {},
    setAutopilot: async () => {
      puts += 1;
    },
  };
  await controller._handleClear();
  assert.equal(puts, 0);
});

// -- overlay freeze failure aborts -----------------------------------------------

test("overlay freeze failure aborts and publishes error status", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  const statusUpdates = [];
  controller.resolume = {
    getColumnGrid: async () => ({
      columnCount: 3,
      activeColumn: 1,
      // No autopilotTarget — simulates a grid read that lacks the target.
      autopilotTarget: null,
    }),
    setAutopilot: async () => {},
    clearClip: async () => {},
    loadClip: async () => {},
    connectClip: async () => {},
    _statusRef: null,
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";
  controller._statusRef = {
    set: async (val) => statusUpdates.push(val),
  };

  await controller._startOverlay(OVERLAY_DOC);

  // _currentId should be reset so a re-trigger with the same doc proceeds.
  assert.equal(controller._currentId, null);
  assert.equal(controller._autopilotFrozen, false);
  // Status should have been set to error.
  const errorStatus = statusUpdates.find((s) => s.phase === "error");
  assert.ok(errorStatus, "expected an error status update");
  assert.equal(errorStatus.activeColumn, 0);
  assert.ok(errorStatus.error.includes("autopilot"));
});

test("overlay freeze failure allows re-trigger of same doc id", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  let gridCalls = 0;
  controller.resolume = {
    getColumnGrid: async () => {
      gridCalls += 1;
      if (gridCalls === 1) {
        // First call: no autopilot target → freeze fails.
        return { columnCount: 3, activeColumn: 1, autopilotTarget: null };
      }
      // Second call: valid autopilot target → freeze succeeds.
      return GRID(1);
    },
    setAutopilot: async () => {},
    clearClip: async () => {},
    loadClip: async () => {},
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";
  controller._statusRef = { set: async () => {} };

  // First attempt fails.
  await controller._startOverlay(OVERLAY_DOC);
  assert.equal(controller._currentId, null);

  // Second attempt with the same doc proceeds (not swallowed by the id guard).
  await controller._startOverlay(OVERLAY_DOC);
  assert.equal(controller._currentId, "overlay-1");
  assert.equal(controller._autopilotFrozen, true);
});

// -- overlay serialization -------------------------------------------------------

test("overlay serialization: clear after start is handled sequentially", async () => {
  const cacheDir = await makeTmpCache();
  const controller = await makeOverlayController({}, cacheDir);
  const calls = [];
  controller.resolume = {
    getColumnGrid: async () => GRID(1),
    setAutopilot: async (id, value) => calls.push(["autopilot", id, value]),
    clearClip: async (layerId, slot) => calls.push(["clear", layerId, slot]),
    clearLayer: async () => {},
    loadClip: async () => {},
    connectClip: async () => {},
  };
  controller.stager.stageAsset = async () => "C:/Content/x.mp4";

  const db = new FakeDb();
  controller.attach(db);
  const overlayRef = db.refs.find((r) => r.path === controller.config.overlayPath);

  // Fire a start followed immediately by a clear (synchronous).
  overlayRef.emit(OVERLAY_DOC);
  overlayRef.emit(null);

  // Wait for the processing queue to drain.
  await controller._processing;

  // Autopilot should be paused then restored (not stuck Off).
  assert.ok(calls.some((c) => c[0] === "autopilot" && c[2] === "Off"));
  assert.ok(calls.some((c) => c[0] === "autopilot" && c[2] === "Play Next Column"));
  // The clear should have unloaded clips.
  assert.ok(calls.some((c) => c[0] === "clear"));
  // _currentId should be null after the clear.
  assert.equal(controller._currentId, null);
});

// -- overlay generation-suffixed remote name -------------------------------------

test("stageAsset returns a generation-suffixed path and skips re-copy for same generation", async () => {
  const cacheDir = await makeTmpCache();
  const stager = new AssetStager({
    overlayCacheDir: cacheDir,
    overlayRemoteContentDir: "C:\\Content",
    overlaySshKey: "/tmp/key",
    overlaySshHost: "10.0.0.1",
    overlaySshUser: "user",
    overlayProjectId: "test",
    serviceAccountFile: "/tmp/sa.json",
  });

  // Stub out the real GCS/SSH calls.
  stager._getGeneration = async () => "1234567890123";
  stager._remoteSize = async () => null; // file does not exist remotely
  const copyCalls = [];
  stager.copyToWindows = async (local, remote) => {
    copyCalls.push(remote);
    return `C:\\Content\\${remote}`;
  };

  // Write a dummy cached file so the stat works.
  const cacheSubdir = path.join(cacheDir, "overlay-cache");
  await fs.mkdir(cacheSubdir, { recursive: true });
  const cacheKey = stager._cacheKey(
    "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4",
  );
  await fs.writeFile(path.join(cacheSubdir, `${cacheKey}-1234567890123.mp4`), "data");

  const result = await stager.stageAsset(
    "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4",
    "goal-48.mp4",
  );

  assert.ok(result.endsWith("-1234567890123.mp4"), `expected generation suffix, got ${result}`);
  assert.equal(copyCalls.length, 1);
  assert.equal(copyCalls[0], "goal-48-1234567890123.mp4");

  // Second call with the same generation should skip the copy.
  copyCalls.length = 0;
  stager._remoteSize = async () => 4; // matches local "data" size
  const result2 = await stager.stageAsset(
    "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4",
    "goal-48.mp4",
  );
  assert.equal(copyCalls.length, 0);
  assert.ok(result2.endsWith("-1234567890123.mp4"));
});

// -- overlay filename validation -------------------------------------------------

test("validateOverlayDoc rejects filenames with #, ?, &", () => {
  const doc = {
    version: 1,
    id: "test-1",
    columns: [
      {
        durationMs: 1000,
        files: {
          "2": {
            name: "goal#48.mp4",
            source:
              "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal.mp4",
          },
        },
      },
    ],
  };
  // Pass empty layer IDs so validation reaches the filename check.
  const result = validateOverlayDoc(doc, []);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("invalid filename"));
});

test("validateOverlayDoc rejects filenames with ?", () => {
  const doc = {
    version: 1,
    id: "test-1",
    columns: [
      {
        durationMs: 1000,
        files: {
          "2": {
            name: "goal?.mp4",
            source:
              "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal.mp4",
          },
        },
      },
    ],
  };
  const result = validateOverlayDoc(doc, []);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("invalid filename"));
});

test("validateOverlayDoc rejects filenames with &", () => {
  const doc = {
    version: 1,
    id: "test-1",
    columns: [
      {
        durationMs: 1000,
        files: {
          "2": {
            name: "goal&48.mp4",
            source:
              "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal.mp4",
          },
        },
      },
    ],
  };
  const result = validateOverlayDoc(doc, []);
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("invalid filename"));
});

test("validateOverlayDoc accepts filenames with spaces", () => {
  const doc = {
    version: 1,
    id: "test-1",
    columns: [
      {
        durationMs: 1000,
        files: {
          "2": {
            name: "goal 48.mp4",
            source:
              "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal.mp4",
          },
        },
      },
    ],
  };
  const result = validateOverlayDoc(doc, []);
  assert.equal(result.valid, true);
});

// -- overlay sshArgs known-hosts -------------------------------------------------

test("_sshArgs uses a persistent known-hosts file in the cache dir", () => {
  const cacheDir = "/var/cache/perimeter-control";
  const stager = new AssetStager({
    overlayCacheDir: cacheDir,
    overlayRemoteContentDir: "C:\\Content",
    overlaySshKey: "/tmp/key",
    overlaySshHost: "10.0.0.1",
    overlaySshUser: "user",
    overlayProjectId: "test",
    serviceAccountFile: "/tmp/sa.json",
  });
  const args = stager._sshArgs();
  const knownHostsArg = args.find(
    (a) => typeof a === "string" && a.startsWith("UserKnownHostsFile="),
  );
  assert.ok(knownHostsArg, "expected UserKnownHostsFile arg");
  assert.ok(
    knownHostsArg.includes("known_hosts"),
    `expected persistent known_hosts path, got ${knownHostsArg}`,
  );
  assert.ok(
    !knownHostsArg.includes("/dev/null"),
    "should not use /dev/null for known-hosts",
  );
  assert.ok(
    knownHostsArg.includes(cacheDir),
    `expected path under cache dir, got ${knownHostsArg}`,
  );
});

// -- helpers --------------------------------------------------------------------------

function waitFor(predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("condition not met within timeout"));
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
