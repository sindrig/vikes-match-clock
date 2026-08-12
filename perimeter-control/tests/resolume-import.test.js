import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateAdLayout } from "../ad-layout.js";
import { extractClipSourcePath } from "../resolume-preview.js";
import {
  buildAdLayoutFromComposition,
  ResolumeImportController,
} from "../resolume-import.js";

const BUCKET = "vikes-match-clock-firebase.appspot.com";
const LOCATION = "vikuti";
const LANES = ["1", "3"];

function emptyClip() {
  return { id: 900 + Math.floor(Math.random() * 100), connected: { value: "Empty" } };
}

function clip(pathStr) {
  return {
    id: 800 + Math.floor(Math.random() * 100),
    name: { value: path.basename(pathStr) },
    video: { fileinfo: { path: pathStr } },
  };
}

// A faithful miniature of the Víkin deck: layers 1 and 3 are the base layers,
// column 2 is empty (skipped), column 1 and 3 hold paired clips.
function deckComposition() {
  const layer1 = Array(3).fill(0).map(() => emptyClip());
  const layer3 = Array(3).fill(0).map(() => emptyClip());
  layer1[0] = clip("C:\\Users\\User\\Desktop\\Efni\\Freyja 48 4608x192_Draumur 2.mp4");
  layer3[0] = clip("C:\\Users\\User\\Desktop\\Efni\\Freyja 40 3840x192_Draumur 2.mp4");
  layer1[2] = clip("C:/Users/User/Desktop/Efni/Martex 48 _Skilti 4608_192 Nýtt.jpg");
  layer3[2] = clip("C:/Users/User/Desktop/Efni/Martex 40 _Skilti 3840_192 Nýtt.jpg");
  return {
    name: { value: "Perimeter" },
    columns: Array(3).fill(0).map((_, i) => ({ id: i + 1, name: { value: `Column ${i + 1}` } })),
    layers: [
      { name: { value: "48 skjáir" }, clips: layer1 },
      { name: { value: "Overlay" }, clips: Array(3).fill(0).map(() => emptyClip()) },
      { name: { value: "40 skjáir" }, clips: layer3 },
      { name: { value: "Overlay" }, clips: Array(3).fill(0).map(() => emptyClip()) },
    ],
  };
}

function makeController(overrides = {}) {
  const config = {
    resolumeBaseUrl: "http://localhost:80/api/v1",
    requestTimeoutMs: 1_000,
    overlayProjectId: "test",
    serviceAccountFile: "/tmp/sa.json",
    overlayCacheDir: mkdtempSync(path.join(os.tmpdir(), "import-test-")),
    overlaySshKey: "/tmp/key",
    overlaySshHost: "10.0.0.1",
    overlaySshUser: "user",
    adLayoutPath: `states/${LOCATION}/perimeter/adLayout`,
    adLayoutBucket: BUCKET,
    adMaxFileBytes: 250 * 1024 * 1024,
    adLaneIds: LANES,
    importPath: `states/${LOCATION}/perimeter/import`,
    importStatusPath: `perimeter/${LOCATION}/importStatus`,
    ...overrides,
  };
  return new ResolumeImportController(config);
}

// -- extractClipSourcePath ---------------------------------------------------

test("extractClipSourcePath returns the video path and falls back to filename", () => {
  assert.equal(
    extractClipSourcePath({
      video: { fileinfo: { path: "C:\\videos\\a.mp4" } },
    }),
    "C:\\videos\\a.mp4",
  );
  assert.equal(
    extractClipSourcePath({ audio: { fileinfo: { path: "s.mp3" } } }),
    "s.mp3",
  );
  assert.equal(extractClipSourcePath({ filename: "plain.mp4" }), "plain.mp4");
  assert.equal(extractClipSourcePath({ name: { value: "x" } }), undefined);
  assert.equal(extractClipSourcePath(null), undefined);
});

// -- buildAdLayoutFromComposition --------------------------------------------

test("builder maps deck columns onto lanes with gs:// sources", () => {
  const { columns, skipped, errors, sources } = buildAdLayoutFromComposition(
    deckComposition(),
    { laneIds: LANES, bucket: BUCKET, location: LOCATION },
  );
  assert.equal(errors.length, 0);
  assert.equal(columns.length, 2);

  const col1 = columns[0];
  assert.deepEqual(col1.files["1"], {
    name: "Freyja 48 4608x192_Draumur 2.mp4",
    source: `gs://${BUCKET}/${LOCATION}/perimeter/Freyja 48 4608x192_Draumur 2.mp4`,
  });
  assert.deepEqual(col1.files["3"], {
    name: "Freyja 40 3840x192_Draumur 2.mp4",
    source: `gs://${BUCKET}/${LOCATION}/perimeter/Freyja 40 3840x192_Draumur 2.mp4`,
  });
  assert.equal(columns[1].files["1"].name, "Martex 48 _Skilti 4608_192 Nýtt.jpg");

  assert.deepEqual(sources, {
    "Freyja 48 4608x192_Draumur 2.mp4": "C:\\Users\\User\\Desktop\\Efni\\Freyja 48 4608x192_Draumur 2.mp4",
    "Freyja 40 3840x192_Draumur 2.mp4": "C:\\Users\\User\\Desktop\\Efni\\Freyja 40 3840x192_Draumur 2.mp4",
    "Martex 48 _Skilti 4608_192 Nýtt.jpg": "C:/Users/User/Desktop/Efni/Martex 48 _Skilti 4608_192 Nýtt.jpg",
    "Martex 40 _Skilti 3840_192 Nýtt.jpg": "C:/Users/User/Desktop/Efni/Martex 40 _Skilti 3840_192 Nýtt.jpg",
  });

  // Column 2 has no clips on either lane: skipped, never abort-all.
  assert.deepEqual(skipped, [{ column: 2, laneId: "1", reason: "clip has no file path" }]);
});

test("builder skips a column when one lane is missing a valid clip", () => {
  const composition = deckComposition();
  composition.layers[2].clips[0] = null; // drop the 40-screen clip of column 1
  const { columns, skipped } = buildAdLayoutFromComposition(composition, {
    laneIds: LANES,
    bucket: BUCKET,
    location: LOCATION,
  });
  assert.equal(columns.length, 1);
  assert.equal(columns[0].files["1"].name, "Martex 48 _Skilti 4608_192 Nýtt.jpg");
  assert.equal(skipped.length, 2); // column 1 (missing lane) + column 2 (empty)
  assert.equal(skipped[0].column, 1);
  assert.equal(skipped[0].laneId, "3");
});

test("builder skips a column when the filename is invalid", () => {
  const composition = deckComposition();
  composition.layers[0].clips[0] = clip("C:/x/bad%name.mp4");
  const { columns, skipped } = buildAdLayoutFromComposition(composition, {
    laneIds: LANES,
    bucket: BUCKET,
    location: LOCATION,
  });
  assert.equal(columns.length, 1);
  assert.match(skipped[0].reason, /invalid filename/);
});

test("builder caps the number of columns", () => {
  const layers = [
    { clips: Array(25).fill(0).map((_, i) => clip(`C:/x/col-${i}-48.mp4`)) },
    { clips: [] },
    { clips: Array(25).fill(0).map((_, i) => clip(`C:/x/col-${i}-40.mp4`)) },
    { clips: [] },
  ];
  const composition = {
    columns: Array(25).fill(0).map((_, i) => ({ id: i + 1 })),
    layers,
  };
  const { columns, errors } = buildAdLayoutFromComposition(composition, {
    laneIds: LANES,
    bucket: BUCKET,
    location: LOCATION,
  });
  assert.equal(columns.length, 20);
  assert.match(errors[0], /capped at 20/);
});

test("generated doc passes validateAdLayout (real deck shape)", () => {
  // Recreate the real populated pairs (spaces, Icelandic characters, mixed
  // video/image) to confirm the imported document satisfies validation.
  const pairs = [
    ["Freyja 48 4608x192_Draumur 2.mp4", "Freyja 40 3840x192_Draumur 2.mp4"],
    ["Martex 48 _Skilti 4608_192 Nýtt.jpg", "Martex 40 _Skilti 3840_192 Nýtt.jpg"],
    ["Besta Deildin 48 BES_LED_V_4608x192.png", "Besta Deildin 40 BES_LED_V_3840x192.png"],
    ["Saffran 48 -B367-LEDskilti-4608x192.png", "Saffran 40 -B367-LEDskilti-3840x192.png"],
    ["Bæjarins B 48 4608_192_pixlar.png", "Bæjarins B 40 3840_192_pixlar.png"],
    ["FOSSINN 48 _4608X192.png", "FOSSINN 40 _3840X192.png"],
    ["Kjötbúðin 48 4608x192 1.mp4", "Kjötbúðin 40 3840x192 1.mp4"],
    ["VIKES 48 _4608X192.png", "VIKES 40 _3840X192.png"],
    ["Stofnhus 48 _4608x192_v1.png", "Stofnhus 40 _3840x192_v1.png"],
    ["Macron 48 4608x192.mp4", "Macron 40 3840x192.mp4"],
    ["Serrany 48 20 sek nýtt f.mp4", "Serrano 40 20 sek nýr.mp4"],
    ["hvitahusid-4608x192-KK.mp4", "hvitahusid-3840x192-KK.mp4"],
  ];
  const composition = {
    columns: pairs.map((_, i) => ({ id: i + 1 })),
    layers: [
      { clips: pairs.map(([a]) => clip(`C:\\Efni\\${a}`)) },
      { clips: [] },
      { clips: pairs.map(([, b]) => clip(`C:\\Efni\\${b}`)) },
      { clips: [] },
    ],
  };
  const built = buildAdLayoutFromComposition(composition, {
    laneIds: LANES,
    bucket: BUCKET,
    location: LOCATION,
  });
  assert.equal(built.columns.length, 12);
  const result = validateAdLayout(
    { version: 1, revision: "r1", columns: built.columns },
    LANES,
    BUCKET,
    LOCATION,
  );
  assert.equal(result.valid, true, result.reason);
});

// -- orchestration ------------------------------------------------------------

function makeFakeRef() {
  return { set: async () => {} };
}

test("import pulls and uploads only objects missing from GCS", async () => {
  const controller = makeController();
  controller.reader.readComposition = async () => deckComposition();
  controller._gcsObjectExists = async (bucket, object) =>
    object.endsWith("Freyja 48 4608x192_Draumur 2.mp4"); // already present
  const pulled = [];
  controller._pullAndUpload = async (name) => pulled.push(name);
  const writes = [];
  controller._desiredRef = {
    set: async (doc) => writes.push(doc),
  };
  const statuses = [];
  controller._statusRef = { set: async (s) => statuses.push(s) };

  await controller._runImport("cmd-1");

  // Only the three objects missing from GCS were pulled.
  assert.deepEqual(pulled.sort(), [
    "Freyja 40 3840x192_Draumur 2.mp4",
    "Martex 40 _Skilti 3840_192 Nýtt.jpg",
    "Martex 48 _Skilti 4608_192 Nýtt.jpg",
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].columns.length, 2);
  assert.ok(writes[0].revision.length > 0);

  const status = statuses[0];
  assert.equal(status.commandId, "cmd-1");
  assert.equal(status.phase, "done");
  assert.equal(status.columnsImported, 2);
  assert.equal(status.columnsSkipped, 1);
  assert.deepEqual(status.errors, []);
});

test("a failed pull skips only the column referencing that file", async () => {
  const controller = makeController();
  controller.reader.readComposition = async () => deckComposition();
  controller._gcsObjectExists = async () => false;
  controller._pullAndUpload = async (name) => {
    if (name.startsWith("Freyja 48")) throw new Error("scp failed");
  };
  const writes = [];
  controller._desiredRef = { set: async (doc) => writes.push(doc) };
  const statuses = [];
  controller._statusRef = { set: async (s) => statuses.push(s) };

  await controller._runImport("cmd-2");

  // Column 1 (Freyja) dropped, column 3 (Martex) survives.
  assert.equal(writes.length, 1);
  assert.equal(writes[0].columns.length, 1);
  assert.equal(writes[0].columns[0].files["1"].name, "Martex 48 _Skilti 4608_192 Nýtt.jpg");

  const status = statuses[0];
  assert.equal(status.phase, "done");
  assert.equal(status.columnsImported, 1);
  assert.ok(status.errors.some((e) => /Freyja 48/.test(e)));
});

test("import aborts with an error status when nothing is importable", async () => {
  const controller = makeController();
  controller.reader.readComposition = async () => ({
    columns: [{ id: 1 }],
    layers: [{ clips: [null] }, { clips: [] }, { clips: [null] }, { clips: [] }],
  });
  controller._gcsObjectExists = async () => false;
  controller._pullAndUpload = async () => {};
  let wrote = false;
  controller._desiredRef = { set: async () => { wrote = true; } };
  const statuses = [];
  controller._statusRef = { set: async (s) => statuses.push(s) };

  await controller._handleSnapshot({
    commandId: "cmd-3",
    command: "from-resolume",
  });
  assert.equal(wrote, false);
  assert.equal(statuses[0].phase, "error");
  assert.match(statuses[0].errors[0], /nothing importable/);
});

test("import dedupe survives a restart via the persisted commandId", async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "import-dedupe-"));
  const controller = makeController({ overlayCacheDir: cacheDir });
  controller.reader.readComposition = async () => deckComposition();
  controller._gcsObjectExists = async () => true;
  const writes = [];
  controller._desiredRef = { set: async (doc) => writes.push(doc) };
  controller._statusRef = { set: async () => {} };

  await controller._handleSnapshot({
    commandId: "cmd-restart",
    command: "from-resolume",
  });
  assert.equal(writes.length, 1);

  // Simulate a daemon restart: a fresh controller on the same cache dir is
  // presented the same (left-in-place) command doc — it must not re-import.
  const controller2 = makeController({ overlayCacheDir: cacheDir });
  controller2.reader.readComposition = async () => deckComposition();
  controller2._gcsObjectExists = async () => true;
  const writes2 = [];
  controller2._desiredRef = { set: async (doc) => writes2.push(doc) };
  controller2._statusRef = { set: async () => {} };

  await controller2._handleSnapshot({
    commandId: "cmd-restart",
    command: "from-resolume",
  });
  assert.equal(writes2.length, 0);

  // A fresh commandId imports again.
  await controller2._handleSnapshot({
    commandId: "cmd-fresh",
    command: "from-resolume",
  });
  assert.equal(writes2.length, 1);
});

test("_handleSnapshot ignores malformed or unknown commands", async () => {
  const controller = makeController();
  let run = 0;
  controller._runImport = async () => {
    run += 1;
  };
  await controller._handleSnapshot(null);
  await controller._handleSnapshot("nope");
  await controller._handleSnapshot({ commandId: "x", command: "other" });
  await controller._handleSnapshot({ command: "from-resolume" });
  assert.equal(run, 0);
});

test("_pullAndUpload normalizes the remote path and uploads to Storage", async () => {
  const cacheDir = path.join(os.tmpdir(), `import-upload-${Math.random().toString(36).slice(2)}`);
  const controller = makeController({ overlayCacheDir: cacheDir });
  const scpCalls = [];
  controller._execFileAsync = async (cmd, args) => {
    scpCalls.push({ cmd, args });
    await fs.writeFile(args[args.length - 1], Buffer.alloc(16));
  };
  const saved = [];
  controller.storage = {
    bucket: () => ({
      file: (object) => ({
        async getMetadata() {
          const e = new Error("not found");
          e.code = 404;
          throw e;
        },
        async save(buffer) {
          saved.push({ object, buffer });
        },
      }),
    }),
  };

  await controller._pullAndUpload(
    "Freyja 48 4608x192_Draumur 2.mp4",
    "C:\\Users\\User\\Desktop\\Efni\\Freyja 48 4608x192_Draumur 2.mp4",
  );

  // SCP uses forward slashes for the remote path (backslashes + spaces break it).
  const scp = scpCalls[0];
  assert.equal(scp.cmd, "scp");
  const remote = scp.args.find((a) => a.startsWith("user@10.0.0.1:"));
  assert.equal(
    remote,
    "user@10.0.0.1:C:/Users/User/Desktop/Efni/Freyja 48 4608x192_Draumur 2.mp4",
  );
  const local = scp.args[scp.args.length - 1];
  assert.equal(
    path.dirname(local),
    path.join(cacheDir, "ad-layout-cache", "import"),
  );
  assert.equal(path.basename(local), "Freyja 48 4608x192_Draumur 2.mp4");

  assert.equal(saved.length, 1);
  assert.equal(saved[0].object, `${LOCATION}/perimeter/Freyja 48 4608x192_Draumur 2.mp4`);
});

test("_pullAndUpload enforces the file size cap", async () => {
  const controller = makeController({ adMaxFileBytes: 10 });
  controller._execFileAsync = async (cmd, args) => {
    await fs.writeFile(args[args.length - 1], Buffer.alloc(20));
  };
  controller.storage = {
    bucket: () => ({
      file: () => ({ async save() {} }),
    }),
  };
  await assert.rejects(
    controller._pullAndUpload("x.mp4", "C:/Efni/x.mp4"),
    /over the 10 byte limit/,
  );
});
