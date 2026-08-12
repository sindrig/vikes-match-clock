import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAdLayout,
  validateFileName,
  validateGcsSource,
  mapLayoutToDeckColumns,
  ResolumeAdClient,
  AdLayoutController,
  AdAssetStager,
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
          1: {
            name: "ad-48.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-48.png`,
          },
          3: {
            name: "ad-40.mp4",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-40.mp4`,
          },
        },
      },
    ],
  };
}

const LANES = ["1", "3"];

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
        1: {
          name: "ad-48.png",
          source: `gs://${BUCKET}/${LOCATION}/perimeter/ad-48.png`,
        },
        3: {
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
  missingLane.columns[0].files = { 1: missingLane.columns[0].files["1"] };
  assert.equal(
    validateAdLayout(missingLane, LANES, BUCKET, LOCATION).valid,
    false,
  );
  const extraLane = validLayout();
  extraLane.columns[0].files["5"] = {
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
  badName.columns[0].files["1"].name = "..";
  assert.equal(validateAdLayout(badName, LANES, BUCKET, LOCATION).valid, false);

  const dupName = validLayout();
  dupName.columns[0].files["3"].name = dupName.columns[0].files["1"].name;
  assert.equal(validateAdLayout(dupName, LANES, BUCKET, LOCATION).valid, false);
});

test("validateAdLayout rejects sources outside the location prefix", () => {
  const badSource = validLayout();
  badSource.columns[0].files["1"].source =
    `gs://${BUCKET}/other/perimeter/x.png`;
  assert.equal(
    validateAdLayout(badSource, LANES, BUCKET, LOCATION).valid,
    false,
  );
});

test("validateAdLayout allows the same Storage object reused across lanes", () => {
  const shared = validLayout();
  shared.columns[0].files["3"] = { ...shared.columns[0].files["1"] };
  const result = validateAdLayout(shared, LANES, BUCKET, LOCATION);
  assert.equal(result.valid, true);
});

test("validateAdLayout rejects the same filename pointing at two different sources", () => {
  const clash = validLayout();
  clash.columns[0].files["3"] = {
    name: clash.columns[0].files["1"].name,
    source: `gs://${BUCKET}/${LOCATION}/perimeter/other.png`,
  };
  const result = validateAdLayout(clash, LANES, BUCKET, LOCATION);
  assert.equal(result.valid, false);
  assert.match(result.reason, /two different sources/);
});

// -- mapLayoutToDeckColumns ---------------------------------------------------

test("mapLayoutToDeckColumns maps each layout column to one deck column", () => {
  assert.deepEqual(mapLayoutToDeckColumns(12, 17), [
    [1],
    [2],
    [3],
    [4],
    [5],
    [6],
    [7],
    [8],
    [9],
    [10],
    [11],
    [12],
  ]);
});

test("mapLayoutToDeckColumns single layout column occupies deck column 1 only", () => {
  assert.deepEqual(mapLayoutToDeckColumns(1, 15), [[1]]);
});

test("mapLayoutToDeckColumns ignores surplus deck columns", () => {
  assert.deepEqual(mapLayoutToDeckColumns(5, 7), [[1], [2], [3], [4], [5]]);
});

test("mapLayoutToDeckColumns one column per layout column when counts match", () => {
  assert.deepEqual(
    mapLayoutToDeckColumns(15, 15),
    Array.from({ length: 15 }, (_, i) => [i + 1]),
  );
});

test("mapLayoutToDeckColumns returns an empty array for no layout columns", () => {
  assert.deepEqual(mapLayoutToDeckColumns(0, 15), []);
});

test("mapLayoutToDeckColumns handles more layout columns than deck columns", () => {
  assert.deepEqual(mapLayoutToDeckColumns(4, 3), [[1], [2], [3], []]);
});

test("mapLayoutToDeckColumns guards against invalid counts", () => {
  assert.deepEqual(mapLayoutToDeckColumns(3, 0), []);
  assert.deepEqual(mapLayoutToDeckColumns(-1, 15), []);
  assert.deepEqual(mapLayoutToDeckColumns(2.5, 15), []);
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
  await client.loadClip("1", 2, "C:/Content/ad-48.png");
  assert.equal(
    calls[0].url,
    "http://localhost:80/api/v1/composition/layers/1/clips/2/open",
  );
  assert.equal(calls[0].contentType, "text/plain");
  assert.match(calls[0].body, /file:\/\//);
  assert.match(calls[0].body, /ad-48\.png/);
});

test("ResolumeAdClient never offers transport endpoints", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, method: options?.method });
    return { ok: true, status: 200 };
  });
  const client = new ResolumeAdClient({
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
  });
  assert.equal(typeof client.connectClip, "undefined");
  assert.equal(typeof client.setClipLoop, "undefined");
  assert.equal(typeof client.setTransportDuration, "undefined");
  assert.equal(typeof client.getClipTransport, "undefined");
  assert.equal(typeof client.clearLayer, "undefined");
  await client.clearClip("1", 2);
  await client.loadClip("1", 2, "C:/Content/ad-48.png");
  const urls = calls.map((c) => c.url);
  assert.ok(urls.every((u) => !/transport|connect|loop/.test(u)));
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
  const bytes = await client.getClipThumbnail("1", 2);
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.length, 3);

  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }));
  assert.equal(await client.getClipThumbnail("1", 2), null);
});

// -- AdAssetStager.copyToWindows ----------------------------------------------

test("AdAssetStager.copyToWindows uses backslashes for the Windows move command", async () => {
  const stager = new AdAssetStager({
    overlayCacheDir: "/tmp/cache",
    overlayRemoteContentDir: "C:/Content",
    overlaySshKey: "/tmp/key",
    overlaySshHost: "10.0.0.1",
    overlaySshUser: "user",
    overlayProjectId: "test",
    serviceAccountFile: "/tmp/sa.json",
  });
  const calls = [];
  stager._execFileAsync = async (cmd, args) => {
    calls.push({ cmd, args });
  };

  await stager.copyToWindows("/tmp/foo.mp4", "Freyja 48 4608x192_Draumur 2.mp4");

  const scp = calls.find((c) => c.cmd === "scp");
  assert.ok(scp, "expected an scp call");
  assert.ok(
    scp.args.some((a) =>
      a.startsWith("user@10.0.0.1:C:/Content/Freyja 48 4608x192_Draumur 2.mp4.part"),
    ),
  );
  const ssh = calls.find((c) => c.cmd === "ssh");
  assert.ok(ssh, "expected an ssh move call");
  // Persistent known-hosts file (the service user has no home directory).
  assert.ok(
    ssh.args.some((a) => a === "UserKnownHostsFile=/tmp/cache/known_hosts"),
  );
  // cmd's `move` rejects forward slashes: backslashes required.
  assert.match(
    ssh.args[ssh.args.length - 1],
    /move \/Y "C:\\Content\\Freyja 48 4608x192_Draumur 2\.mp4\.part" "C:\\Content\\Freyja 48 4608x192_Draumur 2\.mp4"/,
  );
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
  return new AdLayoutController(config, ["1", "3"]);
}

async function waitFor(cond, timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("waitFor timed out");
}

// The composition mock used for lane/column discovery. Layer "1" is the
// "48 skjáir" base layer, layer "3" the "40 skjáir" base layer, with a
// 15-column deck.
function mockComposition() {
  return {
    layers: [
      { id: 1781190959609, name: { value: "48 skjáir" } },
      { id: 1786467697195, name: { value: "Overlay" } },
      { id: 1781190959748, name: { value: "40 skjáir" } },
      { id: 1786467695334, name: { value: "Overlay" } },
    ],
    columns: Array.from({ length: 15 }, (_, i) => ({
      id: 1000 + i,
      name: { value: `Column ${i + 1}` },
    })),
  };
}

function instrumentResolume(controller, composition = mockComposition()) {
  const calls = [];
  controller._discoverComposition = async () => {
    const layers = composition.layers;
    const lanes = ["1", "3"].map((id) => {
      const layer = layers[parseInt(id, 10) - 1];
      return {
        id,
        name: layer?.name?.value ?? `Lane ${id}`,
      };
    });
    return { lanes, columnCount: composition.columns.length };
  };
  controller.stager.stageAsset = async (source, name) => `C:/Content/${name}`;
  controller.resolume.loadClip = async (laneId, slot, winPath) => {
    calls.push(`load:${laneId}:${slot}:${winPath}`);
  };
  controller.resolume.clearClip = async (laneId, slot) => {
    calls.push(`clear:${laneId}:${slot}`);
  };
  controller.resolume.getClipThumbnail = async () => null;
  return calls;
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

test("AdLayoutController loads a valid layout into a single deck column", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());

  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const statuses = db.refs[1].setCalls.map((s) => s.phase);
  assert.ok(statuses.includes("loading"));
  assert.ok(statuses.includes("playing"));

  // Single layout column: the ad is loaded into deck column 1 only on both
  // lanes. Surplus deck columns stay empty (the autopilot skips them).
  for (const laneId of ["1", "3"]) {
    assert.ok(
      calls.includes(
        `load:${laneId}:1:C:/Content/${laneId === "1" ? "ad-48.png" : "ad-40.mp4"}`,
      ),
      `missing load on lane ${laneId} slot 1`,
    );
    assert.ok(
      !calls.includes(
        `load:${laneId}:2:C:/Content/${laneId === "1" ? "ad-48.png" : "ad-40.mp4"}`,
      ),
      `unexpected load beyond slot 1 on lane ${laneId}`,
    );
  }
  // The deck is cleared before loading (clear-then-load).
  assert.ok(calls.some((c) => c.startsWith("clear:1:")));
  assert.ok(calls.some((c) => c.startsWith("clear:3:")));

  const playing = db.refs[1].setCalls.find((s) => s.phase === "playing");
  assert.equal(playing.lanes.length, 2);
  assert.equal(playing.lanes[0].name, "48 skjáir");
  assert.equal(playing.lanes[1].name, "40 skjáir");
  assert.equal(playing.columns.length, 1);
  assert.equal(playing.columns[0].id, "col-1");
  assert.deepEqual(playing.columns[0].deckColumns, [1]);
  assert.equal(playing.columns[0].files["1"].name, "ad-48.png");
  assert.equal(playing.columns[0].files["3"].name, "ad-40.mp4");
  controller.shutdown();
});

test("AdLayoutController maps each layout column to its own deck column", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);

  const layout = {
    ...validLayout(),
    revision: "multi-rev",
    columns: [
      {
        id: "col-a",
        files: {
          1: {
            name: "a-48.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/a-48.png`,
          },
          3: {
            name: "a-40.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/a-40.png`,
          },
        },
      },
      {
        id: "col-b",
        files: {
          1: {
            name: "b-48.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/b-48.png`,
          },
          3: {
            name: "b-40.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/b-40.png`,
          },
        },
      },
      {
        id: "col-c",
        files: {
          1: {
            name: "c-48.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/c-48.png`,
          },
          3: {
            name: "c-40.png",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/c-40.png`,
          },
        },
      },
    ],
  };

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(layout);

  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const playing = db.refs[1].setCalls.find((s) => s.phase === "playing");
  assert.deepEqual(
    playing.columns.map((c) => c.deckColumns),
    [[1], [2], [3]],
  );
  // Each ad lands in exactly its own deck column on lane 1.
  assert.ok(calls.includes("load:1:1:C:/Content/a-48.png"));
  assert.ok(!calls.includes("load:1:2:C:/Content/a-48.png"));
  assert.ok(calls.includes("load:1:2:C:/Content/b-48.png"));
  assert.ok(calls.includes("load:1:3:C:/Content/c-48.png"));
  controller.shutdown();
});

test("AdLayoutController refuses a layout that does not fit the deck", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);

  // 16 layout columns on the mock 15-column deck cannot fit 1:1.
  const layout = {
    ...validLayout(),
    revision: "too-big",
    columns: Array.from({ length: 16 }, (_, i) => ({
      id: `col-${i}`,
      files: {
        1: {
          name: `a-${i}-48.png`,
          source: `gs://${BUCKET}/${LOCATION}/perimeter/a-${i}-48.png`,
        },
        3: {
          name: `a-${i}-40.png`,
          source: `gs://${BUCKET}/${LOCATION}/perimeter/a-${i}-40.png`,
        },
      },
    })),
  };

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(layout);
  await waitFor(() =>
    db.refs[1].setCalls.some(
      (s) => s.phase === "error" && /does not fit/.test(s.error || ""),
    ),
  );
  // Nothing was loaded or cleared.
  assert.equal(calls.some((c) => c.startsWith("load:")), false);
  assert.equal(calls.some((c) => c.startsWith("clear:")), false);
  controller.shutdown();
});

test("AdLayoutController deduplicates identical revisions", async () => {
  const controller = makeAdController();
  instrumentResolume(controller);

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  const countBefore = db.refs[1].setCalls.length;
  db.refs[0].emit(validLayout());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(db.refs[1].setCalls.length, countBefore);
  controller.shutdown();
});

test("AdLayoutController publishes an error status and clears slots on a staging error", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);
  controller._sleep = async () => {};
  controller.stager.stageAsset = async () => {
    throw new Error("scp failed");
  };

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());
  await waitFor(() =>
    db.refs[1].setCalls.some(
      (s) => s.phase === "error" && /scp failed/.test(s.error || ""),
    ),
  );
  const error = db.refs[1].setCalls.find((s) => s.phase === "error");
  assert.equal(error.columns.length, 0);
  // Clear-then-load: the old slots were cleared even though staging failed.
  assert.ok(calls.some((c) => c.startsWith("clear:")));
  controller.shutdown();
});

test("AdLayoutController preserves the revision for an empty-columns clear", async () => {
  const controller = makeAdController();
  instrumentResolume(controller);

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

test("AdLayoutController clears every deck column on clear, not just one slot", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(null);
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "idle"));
  // Both lanes cleared across all 15 deck columns.
  for (const laneId of ["1", "3"]) {
    for (let slot = 1; slot <= 15; slot += 1) {
      assert.ok(
        calls.includes(`clear:${laneId}:${slot}`),
        `missing clear on lane ${laneId} slot ${slot}`,
      );
    }
  }
  controller.shutdown();
});

test("AdLayoutController never calls transport endpoints during load or clear", async () => {
  const controller = makeAdController();
  const calls = instrumentResolume(controller);

  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(validLayout());
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "playing"));
  db.refs[0].emit(null);
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "idle"));

  for (const call of calls) {
    assert.ok(!/connect|transport|loop/.test(call), `unexpected call: ${call}`);
  }
  controller.shutdown();
});

test("AdLayoutController retries the idle status publish on a failed write", async () => {
  const controller = makeAdController();
  instrumentResolume(controller);
  controller._sleep = async () => {};
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
  controller.shutdown();
});

test("AdLayoutController.republishStatus re-publishes the last status", async () => {
  const controller = makeAdController();
  instrumentResolume(controller);
  const db = new FakeDb();
  controller.attach(db);
  db.refs[0].emit(null);
  await waitFor(() => db.refs[1].setCalls.some((s) => s.phase === "idle"));
  const before = db.refs[1].setCalls.length;
  await controller.republishStatus();
  assert.equal(db.refs[1].setCalls.length, before + 1);
  const republished = db.refs[1].setCalls[before];
  assert.equal(republished.phase, "idle");
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
