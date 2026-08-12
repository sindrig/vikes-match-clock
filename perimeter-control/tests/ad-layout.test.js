import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAdLayout,
  validateFileName,
  validateGcsSource,
  ResolumeAdClient,
  AdLayoutController,
} from "../ad-layout.js";

const BUCKET = "vikes-match-clock-firebase.appspot.com";
const LOCATION = "vikuti";

function validLayout() {
  return {
    version: 1,
    revision: "9f04a3f8-7c2a-4f1e-8d4b-2a1f3c5d7e9b",
    columns: [
      {
        id: "col-1",
        files: {
          2: {
            name: "ad-48.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-48.png`,
          },
          4: {
            name: "ad-40.mp4",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-40.mp4`,
          },
        },
      },
    ],
  };
}

const LANES = ["2", "4"];

// -- validateFileName ---------------------------------------------------------

test("validateFileName accepts a normal basename", () => {
  assert.equal(validateFileName("ad-48.png"), true);
  assert.equal(validateFileName("my ad (2).mp4"), true);
});

test("validateFileName rejects traversal and dot entries", () => {
  assert.equal(validateFileName(".."), false);
  assert.equal(validateFileName("."), false);
  assert.equal(validateFileName("../../etc/passwd"), false);
});

test("validateFileName rejects Windows-reserved characters", () => {
  for (const name of [
    "a:b.png",
    "a?b.png",
    "a*b.png",
    'a"b.png',
    "a<b.png",
    "a>b.png",
    "a|b.png",
  ]) {
    assert.equal(validateFileName(name), false, name);
  }
});

test("validateFileName rejects Windows-reserved device names", () => {
  assert.equal(validateFileName("CON"), false);
  assert.equal(validateFileName("con.png"), false);
  assert.equal(validateFileName("COM1"), false);
  assert.equal(validateFileName("lpt9.txt"), false);
  assert.equal(validateFileName("AUX"), false);
});

test("validateFileName rejects trailing dots and spaces", () => {
  assert.equal(validateFileName("ad-48.png."), false);
  assert.equal(validateFileName("ad-48 "), false);
});

test("validateFileName rejects control chars, quotes, and oversize names", () => {
  assert.equal(validateFileName("ad\u0000x.png"), false);
  assert.equal(validateFileName('ad"x.png'), false);
  assert.equal(validateFileName("a".repeat(256)), false);
});

// -- validateGcsSource --------------------------------------------------------

test("validateGcsSource accepts an approved bucket object under location prefix", () => {
  assert.equal(
    validateGcsSource(
      `gs://${BUCKET}/${LOCATION}/perimeter/ad-48.png`,
      BUCKET,
      LOCATION,
    ),
    true,
  );
});

test("validateGcsSource rejects wrong bucket", () => {
  assert.equal(
    validateGcsSource(
      "gs://vikes-match-clock-staging.appspot.com/vikuti/perimeter/ad.png",
      BUCKET,
      LOCATION,
    ),
    false,
  );
});

test("validateGcsSource rejects a source outside the location perimeter prefix", () => {
  assert.equal(
    validateGcsSource(
      `gs://${BUCKET}/other/perimeter/ad.png`,
      BUCKET,
      LOCATION,
    ),
    false,
  );
  assert.equal(
    validateGcsSource(
      `gs://${BUCKET}/${LOCATION}/other/ad.png`,
      BUCKET,
      LOCATION,
    ),
    false,
  );
});

test("validateGcsSource rejects non-gs sources and missing paths", () => {
  assert.equal(
    validateGcsSource("https://example.com/ad.png", BUCKET, LOCATION),
    false,
  );
  assert.equal(validateGcsSource(`gs://${BUCKET}`, BUCKET, LOCATION), false);
  assert.equal(validateGcsSource("", BUCKET, LOCATION), false);
});

// -- validateAdLayout ---------------------------------------------------------

test("validateAdLayout accepts a valid layout", () => {
  const result = validateAdLayout(validLayout(), LANES, BUCKET, LOCATION);
  assert.equal(result.valid, true);
  assert.equal(result.clear, false);
  assert.equal(result.revision, validLayout().revision);
});

test("validateAdLayout treats null and empty columns as a clear", () => {
  assert.deepEqual(validateAdLayout(null, LANES, BUCKET, LOCATION), {
    valid: true,
    clear: true,
  });
  const empty = validateAdLayout(
    { ...validLayout(), columns: [] },
    LANES,
    BUCKET,
    LOCATION,
  );
  assert.equal(empty.valid, true);
});

test("validateAdLayout rejects an unsupported version", () => {
  const result = validateAdLayout(
    { ...validLayout(), version: 2 },
    LANES,
    BUCKET,
    LOCATION,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /unsupported version/);
});

test("validateAdLayout rejects a missing or oversized revision", () => {
  const noRev = { ...validLayout() };
  delete noRev.revision;
  assert.equal(validateAdLayout(noRev, LANES, BUCKET, LOCATION).valid, false);
  assert.equal(
    validateAdLayout(
      { ...validLayout(), revision: "x".repeat(65) },
      LANES,
      BUCKET,
      LOCATION,
    ).valid,
    false,
  );
});

test("validateAdLayout rejects too many columns", () => {
  const many = {
    ...validLayout(),
    columns: Array.from({ length: 21 }, (_, i) => ({
      id: `col-${i}`,
      files: {
        2: {
          name: "ad-48.png",
          source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-48.png`,
        },
        4: {
          name: "ad-40.png",
          source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-40.png`,
        },
      },
    })),
  };
  assert.equal(validateAdLayout(many, LANES, BUCKET, LOCATION).valid, false);
});

test("validateAdLayout rejects duplicate column ids", () => {
  const dup = validLayout();
  dup.columns.push({ ...dup.columns[0], files: { ...dup.columns[0].files } });
  assert.equal(validateAdLayout(dup, LANES, BUCKET, LOCATION).valid, false);
});

test("validateAdLayout rejects wrong lane counts and missing required lanes", () => {
  const missingLane = validLayout();
  missingLane.columns[0].files = { 2: missingLane.columns[0].files["2"] };
  assert.equal(
    validateAdLayout(missingLane, LANES, BUCKET, LOCATION).valid,
    false,
  );
  const extraLane = validLayout();
  extraLane.columns[0].files["6"] = {
    name: "ad-60.png",
    source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-60.png`,
  };
  assert.equal(
    validateAdLayout(extraLane, LANES, BUCKET, LOCATION).valid,
    false,
  );
});

test("validateAdLayout rejects unsafe filenames and duplicate filenames", () => {
  const badName = validLayout();
  badName.columns[0].files["2"].name = "..";
  assert.equal(validateAdLayout(badName, LANES, BUCKET, LOCATION).valid, false);

  const dupName = validLayout();
  dupName.columns[0].files["4"].name = dupName.columns[0].files["2"].name;
  assert.equal(validateAdLayout(dupName, LANES, BUCKET, LOCATION).valid, false);
});

test("validateAdLayout rejects sources outside the location prefix", () => {
  const badSource = validLayout();
  badSource.columns[0].files["2"].source =
    `gs://${BUCKET}/other/perimeter/x.png`;
  assert.equal(
    validateAdLayout(badSource, LANES, BUCKET, LOCATION).valid,
    false,
  );
});

test("validateAdLayout allows the same Storage object reused across lanes", () => {
  const shared = validLayout();
  shared.columns[0].files["4"] = { ...shared.columns[0].files["2"] };
  const result = validateAdLayout(shared, LANES, BUCKET, LOCATION);
  assert.equal(result.valid, true);
});

test("validateAdLayout rejects the same filename pointing at two different sources", () => {
  const clash = validLayout();
  clash.columns[0].files["4"] = {
    name: clash.columns[0].files["2"].name,
    source: `gs://${BUCKET}/${LOCATION}/perimeter/other.png`,
  };
  const result = validateAdLayout(clash, LANES, BUCKET, LOCATION);
  assert.equal(result.valid, false);
  assert.match(result.reason, /two different sources/);
});

// -- ResolumeAdClient.loadClip ------------------------------------------------

test("ResolumeAdClient.loadClip sends a file:// URL as a plain-text body", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({
      url,
      body: options?.body,
      contentType: options?.headers?.["Content-Type"],
    });
    return { ok: true, status: 200 };
  });
  const client = new ResolumeAdClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  await client.loadClip("2", 2, "C:/Content/ad-48.png");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/layers/2/clips/2/open",
  );
  assert.equal(calls[0].contentType, "text/plain");
  assert.match(calls[0].body, /file:\/\//);
  assert.match(calls[0].body, /ad-48\.png/);
});

test("ResolumeAdClient.setTransportDuration sends JSON", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({
      url,
      body: options?.body,
      contentType: options?.headers?.["Content-Type"],
    });
    return { ok: true, status: 200 };
  });
  const client = new ResolumeAdClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  await client.setTransportDuration("2", 2, 20_000);
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/layers/2/clips/2/transport/duration",
  );
  assert.equal(calls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(calls[0].body), { duration: 20000 });
});

test("ResolumeAdClient.getClipThumbnail returns bytes or null", async (t) => {
  const client = new ResolumeAdClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
  const bytes = await client.getClipThumbnail("2", 2);
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.length, 3);

  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }));
  assert.equal(await client.getClipThumbnail("2", 2), null);
});

// -- AdLayoutController snapshot flow ------------------------------------------

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
    this.setCalls = [];
  }
  on(event, callback) {
    this.handlers.set(event, callback);
  }
  off(event, callback) {
    this.handlers.delete(event);
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

function makeAdController() {
  const config = {
    adLayoutPath: `states/${LOCATION}/perimeter/adLayout`,
    adLayoutStatusPath: `perimeter/${LOCATION}/adLayout`,
    adLayoutBucket: BUCKET,
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
    thumbnailMaxDim: 320,
    thumbnailQuality: 0.7,
    thumbnailMaxBytes: 100_000,
  };
  return new AdLayoutController(config, ["2", "4"], { 2: 2, 4: 2 });
}

async function waitFor(cond, timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("waitFor timed out");
}

test("AdLayoutController attaches to the desired and status paths", () => {
  const controller = makeAdController();
  const db = new FakeDb();
  controller.attach(db);
  assert.equal(db.refs.length, 2);
  assert.equal(db.refs[0].path, `states/${LOCATION}/perimeter/adLayout`);
  assert.equal(db.refs[1].path, `perimeter/${LOCATION}/adLayout`);
  assert.equal(db.refs[0].handlers.has("value"), true);
  controller.shutdown();
});

test("AdLayoutController publishes an error status for an invalid layout", async () => {
  const controller = makeAdController();
  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit({ version: 99, revision: "r", columns: [] });
  await waitFor(() => db.refs[1].setCalls.length > 0);
  const status = db.refs[1].setCalls[0];
  assert.equal(status.phase, "error");
  assert.match(status.error, /unsupported version/);
  controller.shutdown();
});

test("AdLayoutController processes a valid layout and stages before playing", async () => {
  const controller = makeAdController();
  controller.stager.stageAsset = async (source, name) => `C:/Content/${name}`;
  const resolumeCalls = [];
  controller.resolume.loadClip = async (laneId, slot, winPath) => {
    resolumeCalls.push(`load:${laneId}:${winPath}`);
  };
  controller.resolume.setClipLoop = async () => {};
  controller.resolume.getClipInfo = async () => ({});
  controller.resolume.setTransportDuration = async () => {};
  controller.resolume.getClipThumbnail = async () => null;
  controller.resolume.connectClip = async (laneId) => {
    resolumeCalls.push(`connect:${laneId}`);
  };
  controller._getColumnDuration = () => 5;

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());

  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const statuses = db.refs[1].setCalls.map((s) => s.phase);
  assert.ok(statuses.includes("staging"));
  assert.ok(statuses.includes("playing"));
  assert.ok(resolumeCalls.some((c) => c.startsWith("load:")));
  assert.ok(resolumeCalls.some((c) => c.startsWith("connect:")));

  const playing = db.refs[1].setCalls.find((s) => s.phase === "playing");
  assert.equal(playing.activeColumn, 1);
  controller.shutdown();
});

test("AdLayoutController deduplicates identical revisions", async () => {
  const controller = makeAdController();
  controller.stager.stageAsset = async () => "C:/Content/x.png";
  controller.resolume.loadClip = async () => {};
  controller.resolume.setClipLoop = async () => {};
  controller.resolume.getClipInfo = async () => ({});
  controller.resolume.setTransportDuration = async () => {};
  controller.resolume.getClipThumbnail = async () => null;
  controller.resolume.connectClip = async () => {};
  controller._getColumnDuration = () => 100;

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const countBefore = db.refs[1].setCalls.length;
  // Re-emit the same revision — must be ignored (no new staging).
  db.refs[0].emit(validLayout());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(db.refs[1].setCalls.length, countBefore);
  controller.shutdown();
});

test("AdLayoutController preserves the previous layout and cycle timer on a staging error", async () => {
  const controller = makeAdController();
  controller._sleep = async () => {};
  controller._getColumnDuration = () => 500;
  controller.stager.stageAsset = async (source, name) => `C:/Content/${name}`;
  controller.resolume.loadClip = async () => {};
  controller.resolume.setClipLoop = async () => {};
  controller.resolume.getClipInfo = async () => ({});
  controller.resolume.setTransportDuration = async () => {};
  controller.resolume.getClipThumbnail = async () => null;
  controller.resolume.connectClip = async () => {};

  const db = new FakeDb();
  controller.attach(db);

  // Apply the first revision successfully so there is a real applied layout.
  db.refs[0].emit(validLayout());
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const playing = db.refs[1].setCalls.find((s) => s.phase === "playing");
  assert.equal(playing.columns.length, 1);
  assert.equal(playing.columns[0].id, "col-1");

  // A newer revision fails during staging.
  controller.stager.stageAsset = async () => {
    throw new Error("scp failed");
  };
  const newer = { ...validLayout(), revision: "newer-revision" };
  db.refs[0].emit(newer);
  await waitFor(() =>
    db.refs[1].setCalls.some(
      (s) => s.phase === "error" && /scp failed/.test(s.error || ""),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  const error = db.refs[1].setCalls.find(
    (s) => s.phase === "error" && /scp failed/.test(s.error || ""),
  );
  // The previously applied columns survive the failed replacement...
  assert.equal(error.columns.length, 1);
  assert.equal(error.columns[0].id, "col-1");
  // ...and the previous cycle timer is restored so playback is not frozen.
  assert.notEqual(controller._columnTimer, null);
  assert.equal(
    controller._currentRevision,
    "9f04a3f8-7c2a-4f1e-8d4b-2a1f3c5d7e9b",
  );
  controller.shutdown();
});

test("AdLayoutController preserves the revision for an empty-columns clear", async () => {
  const controller = makeAdController();
  controller.stager.stageAsset = async () => "C:/Content/x.png";
  controller.resolume.clearClip = async () => {};
  controller.resolume.loadClip = async () => {};
  controller.resolume.setClipLoop = async () => {};
  controller.resolume.getClipInfo = async () => ({});
  controller.resolume.setTransportDuration = async () => {};
  controller.resolume.getClipThumbnail = async () => null;
  controller.resolume.connectClip = async () => {};

  const db = new FakeDb();
  controller.attach(db);

  const empty = { ...validLayout(), revision: "empty-rev", columns: [] };
  db.refs[0].emit(empty);
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "idle"));
  const idle = db.refs[1].setCalls.find((s) => s.phase === "idle");
  // The idle status carries the submitted revision, so the controller does not
  // report this successful clear as permanently pending...
  assert.equal(idle.revision, "empty-rev");
  // ...and re-delivery of the same empty revision is deduplicated.
  const countBefore = db.refs[1].setCalls.length;
  db.refs[0].emit(empty);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(db.refs[1].setCalls.length, countBefore);
  controller.shutdown();
});

test("AdLayoutController clears only the ad clip slots, not the whole layer", async () => {
  const controller = makeAdController();
  controller.resolume.clearLayer = async () => {
    throw new Error("must not clear the whole layer");
  };
  const cleared = [];
  controller.resolume.clearClip = async (laneId, slot) =>
    cleared.push([laneId, slot]);

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(null);
  await waitFor(() => cleared.length >= 2);
  assert.deepEqual(cleared.sort(), [
    ["2", 2],
    ["4", 2],
  ]);
  controller.shutdown();
});

test("AdLayoutController retries the idle status publish on a failed write", async () => {
  const controller = makeAdController();
  controller._sleep = async () => {};
  controller.resolume.clearClip = async () => {};
  controller._discoverLanes = async () => [
    { id: "2", name: "Lane 2" },
    { id: "4", name: "Lane 4" },
  ];
  const db = new FakeDb();
  controller.attach(db);
  const statusRef = db.refs[1];
  const writes = [];
  statusRef.set = (value) => {
    writes.push(value);
    if (writes.length === 1) return Promise.reject(new Error("write lost"));
    return Promise.resolve();
  };
  db.refs[0].emit(null);
  await waitFor(() => writes.length >= 2);
  const idle = writes.find((w) => w.phase === "idle");
  assert.equal(idle.phase, "idle");
  assert.equal(idle.activeColumn, 0);
  controller.shutdown();
});

test("AdLayoutController.republishStatus re-publishes the last status", async () => {
  const controller = makeAdController();
  controller.resolume.clearClip = async () => {};
  controller._discoverLanes = async () => [
    { id: "2", name: "Lane 2" },
    { id: "4", name: "Lane 4" },
  ];
  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(null);
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "idle"));
  const before = db.refs[1].setCalls.length;
  await controller.republishStatus();
  assert.equal(db.refs[1].setCalls.length, before + 1);
  const republished = db.refs[1].setCalls[before];
  assert.equal(republished.phase, "idle");
  assert.equal(republished.activeColumn, 0);
  controller.shutdown();
});

test("AdLayoutController.republishStatus is a no-op before any status publish", async () => {
  const controller = makeAdController();
  const db = new FakeDb();
  controller.attach(db);
  await controller.republishStatus();
  assert.equal(db.refs[1].setCalls.length, 0);
  controller.shutdown();
});

test("AdLayoutController._retryOp aborts when a newer generation supersedes during backoff", async () => {
  const controller = makeAdController();
  controller._sleep = async () => {};
  controller._generation = 1;
  const run = controller._retryOp(
    "test op",
    async () => {
      throw new Error("boom");
    },
    1,
  );
  controller._generation = 2;
  await assert.rejects(run, /superseded/);
  controller.shutdown();
});
