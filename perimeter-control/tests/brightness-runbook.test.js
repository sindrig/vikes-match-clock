import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mockModule = new URL("helpers/brightness-runbook-io.mjs", import.meta.url)
  .href;
const guide = await readFile(
  new URL("../BRIGHTNESS_SMOKE_TEST.md", import.meta.url),
  "utf8",
);
const blocks = Object.fromEntries(
  [
    ...guide.matchAll(
      /<!-- brightness-session: ([\w-]+) -->\s*```bash\n([\s\S]*?)```/gu,
    ),
  ].map((match) => [match[1], match[2]]),
);
const sequence = [
  "stop-before-snapshot",
  "snapshot",
  "prepare",
  "start",
  "command",
  "verify-command",
  "stop-before-restore",
  "restore-intent",
  "restore-hardware",
];
assert.deepEqual(
  Object.keys(blocks),
  ["shell", ...sequence],
  "Every marked command must be exercised",
);

const auto = {
  enabled: true,
  min: 3,
  max: 89,
  exponent: 0.42,
  cloudWeight: 0.7,
  luxMin: 4,
  luxMax: 87000,
  updatedAt: 1000,
};
const defaultHardware = {
  ratio: 450,
  ratioScale: 10000,
  nit: 17.5,
  nitType: 2,
};

test("every documented Bash block parses, including the placeholder setup", () => {
  const fences = [...guide.matchAll(/```bash\n([\s\S]*?)```/gu)];
  assert.equal(fences.length, 12);
  for (const [, block] of fences) {
    const result = spawnSync("/bin/bash", ["-n"], {
      input: block,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
});

async function fixture(
  t,
  {
    hardware = defaultHardware,
    missing = false,
    automatic = true,
    disabled = false,
  } = {},
) {
  const artifacts = process.env.BRIGHTNESS_RUNBOOK_ARTIFACTS;
  const parent = artifacts || os.tmpdir();
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "brightness-runbook-"));
  const session = path.join(directory, "session");
  const bin = path.join(directory, "bin");
  const stateFile = path.join(directory, "mock-state.json");
  await mkdir(bin);
  await writeFile(path.join(bin, "sudo"), '#!/bin/bash\nexec "$@"\n', {
    mode: 0o700,
  });
  await writeFile(
    path.join(bin, "systemctl"),
    `#!/bin/bash\nexec node --input-type=module - "$@" <<'NODE'\nimport { systemctl } from ${JSON.stringify(mockModule)};\nsystemctl(process.argv.slice(2));\nNODE\n`,
    { mode: 0o700 },
  );
  const perimeter = {
    state: "off",
    enabled: true,
    adLayout: { sentinel: "preserve-media" },
  };
  if (!missing)
    Object.assign(perimeter, {
      brightness: 6,
      brightnessAuto: { ...auto, enabled: automatic },
    });
  const original = {
    location: "test-venue",
    uid: "operator",
    guid: "perimeter-guid",
    now: 2000,
    featureEnabled: !disabled,
    workerRunning: !disabled,
    events: [],
    screens: [
      { guid: "perimeter-guid", name: "Perimeter", brightness: hardware },
      {
        guid: "mvr-guid",
        name: "MVR",
        brightness: { ratio: 0, ratioScale: 0, nit: 72, nitType: 3 },
      },
      {
        guid: "other-guid",
        name: "Other screen",
        brightness: { ratio: 610, ratioScale: 10000 },
      },
    ],
    db: {
      auth: { operator: { "test-venue": true } },
      admins: { outsider: true },
      states: {
        "test-venue": { perimeter, match: { sentinel: "preserve-match" } },
        "other-venue": { perimeter: { brightness: 79 } },
      },
      perimeter: {
        "test-venue": {
          brightnessStatus: {
            phase: "applied",
            requestedPercent: 43,
            appliedPercent: 43,
            updatedAt: 1000,
          },
          brightnessCalibration: { old: { sentinel: "preserve-calibration" } },
          legacy: { sentinel: "preserve-telemetry" },
        },
      },
      audit: {
        "test-venue": {
          old: {
            uid: "operator",
            timestamp: 1000,
            sessionId: "old-session",
            action: "old-action",
            stateArea: "perimeter",
            changes: "{}",
          },
        },
      },
    },
  };
  await writeFile(stateFile, JSON.stringify(original));
  const environment = {
    PATH: `${bin}:${process.env.PATH}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${mockModule}`,
    RUNBOOK_MOCK_STATE: stateFile,
    FIREBASE_DATABASE_URL: "https://firebase.invalid",
    FIREBASE_LOCATION: "test-venue",
    FIREBASE_UID: "operator",
    FIREBASE_ID_TOKEN: "synthetic-operator-token",
    BRIGHTNESS_SESSION_DIR: session,
    SMOKE_PERCENT: "7",
    PERIMETER_VNNOX_BASE_URL: "http://vnnox.invalid",
    PERIMETER_VNNOX_IP: "192.0.2.10",
    PERIMETER_VNNOX_PORT: "8088",
    PERIMETER_VNNOX_PROTOCOL: "http",
    PERIMETER_VNNOX_SN: "synthetic-device-serial",
    PERIMETER_VNNOX_PROJECT_ID: "synthetic-project",
    PERIMETER_VNNOX_PERIMETER_GUID: "perimeter-guid",
    PERIMETER_VNNOX_USERNAME: "synthetic-device-user",
    PERIMETER_VNNOX_PASSWORD: "synthetic-device-password",
  };
  const read = async () => JSON.parse(await readFile(stateFile, "utf8"));
  const edit = async (mutate) => {
    const current = await read();
    mutate(current);
    await writeFile(stateFile, JSON.stringify(current));
  };
  async function execute(script, overrides = {}) {
    const state = await read();
    const result = spawnSync("/bin/bash", ["-c", script], {
      cwd: root,
      env: {
        ...environment,
        BRIGHTNESS_WORKER_STOPPED: String(!state.workerRunning),
        ...overrides,
      },
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    for (const secret of [
      "synthetic-operator-token",
      "synthetic-device-password",
      "synthetic-device-token",
      overrides.FIREBASE_ID_TOKEN,
      overrides.PERIMETER_VNNOX_PASSWORD,
    ]) {
      if (secret)
        assert(
          !output.includes(secret),
          "Command output exposed a synthetic credential",
        );
    }
    for (const privateContent of ["private-response-body", "?auth=", "<html>"])
      assert(
        !output.includes(privateContent),
        "Command output exposed a Firebase response body or URL",
      );
    assert(
      !/https:\/\/firebase\.invalid\/\S*\.json/u.test(output),
      "Command output exposed a Firebase request URL",
    );
    return result;
  }
  const run = (names, overrides) =>
    execute(
      [
        blocks.shell,
        ...names.map((name) => {
          assert(blocks[name]);
          return blocks[name];
        }),
      ].join("\n"),
      overrides,
    );
  t.after(async () => {
    if (artifacts) {
      const state = await read();
      await writeFile(
        path.join(artifacts, `${path.basename(directory)}-proof.json`),
        JSON.stringify(
          {
            test: t.name,
            mockOnly: true,
            physicalQualification: "HOLD",
            events: state.events,
            finalHardware: state.screens,
            finalIntent: state.db.states["test-venue"].perimeter,
            workerRunning: state.workerRunning,
          },
          null,
          2,
        ),
      );
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    run,
    execute,
    read,
    edit,
    original: structuredClone(original),
    session,
  };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function failure(result, pattern) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
}

for (const [label, hardware, automatic, missing] of [
  [
    "integer manual snapshot",
    { ratio: 600, ratioScale: 10000, nit: 0, nitType: 0 },
    false,
    false,
  ],
  ["4.5% automatic snapshot with nondefault nit", defaultHardware, true, false],
  [
    "12.34% manual snapshot with nondefault nit",
    { ratio: 1234, ratioScale: 10000, nit: 412.75, nitType: 4 },
    false,
    false,
  ],
  [
    "integer snapshot with another raw scale",
    { ratio: 1200, ratioScale: 20000, nit: 500, nitType: 7 },
    true,
    false,
  ],
  ["absent manual and auto intent", defaultHardware, false, true],
]) {
  test(`documented full sequence: ${label}`, async (t) => {
    const f = await fixture(t, { hardware, automatic, missing });
    success(await f.run(sequence));
    const state = await f.read();
    assert.equal(state.workerRunning, false);
    assert.deepEqual(
      state.screens,
      f.original.screens,
      "Raw target and every non-target restored",
    );
    assert.deepEqual(
      state.db.states,
      f.original.db.states,
      "Other venue, media and match untouched",
    );
    assert.deepEqual(
      state.db.perimeter["test-venue"].brightnessCalibration,
      f.original.db.perimeter["test-venue"].brightnessCalibration,
    );
    assert.deepEqual(
      state.db.perimeter["test-venue"].legacy,
      f.original.db.perimeter["test-venue"].legacy,
    );
    assert.equal(
      state.db.perimeter["test-venue"].brightnessStatus.appliedPercent,
      7,
      "Do not restore observed telemetry",
    );
    assert.deepEqual(
      state.db.audit["test-venue"].old,
      f.original.db.audit["test-venue"].old,
    );
    const snapshotText = await readFile(
      path.join(f.session, "snapshot.json"),
      "utf8",
    );
    const saved = JSON.parse(snapshotText);
    assert.deepEqual(saved.hardware, hardware);
    assert(!/synthetic-.*(?:token|password)/u.test(snapshotText));
    assert.equal(
      (await stat(path.join(f.session, "snapshot.json"))).mode & 0o777,
      0o600,
    );
    assert.equal((await stat(f.session)).mode & 0o777, 0o700);
    const patches = state.events.filter(
      (event) => event.type === "firebase-patch",
    );
    assert.equal(patches.length, 3);
    for (const [index, patch] of patches.entries()) {
      assert(patch.permitted);
      assert.equal(patch.workerRunning, index === 1);
      const auditPaths = Object.keys(patch.updates).filter((key) =>
        key.startsWith("audit/test-venue/"),
      );
      assert.equal(auditPaths.length, 6);
      const eventId = auditPaths[0].split("/")[2];
      const event = state.db.audit["test-venue"][eventId];
      assert.equal(event.uid, "operator");
      assert.equal(event.sessionId, saved.sessionId);
      assert.equal(event.stateArea, "perimeter");
      assert.equal(typeof event.timestamp, "number");
      const diff = Object.fromEntries(
        Object.entries(patch.updates)
          .filter(([key]) => key.startsWith("states/"))
          .map(([key, value]) => [key.split("/").at(-1), value]),
      );
      assert.deepEqual(
        JSON.parse(event.changes),
        diff,
        "Audit preserves the exact diff including nulls",
      );
    }
    assert.equal(
      patches[0].updates["states/test-venue/perimeter/brightness"],
      null,
    );
    assert.deepEqual(
      patches[2].updates["states/test-venue/perimeter/brightnessAuto"],
      saved.intent.brightnessAuto,
    );
    const direct = state.events.findIndex(
      (event) => event.type === "direct-restore",
    );
    const stop = state.events.findLastIndex(
      (event) => event.type === "service-stop-and-simulated-drain",
    );
    const restoreIntent = state.events.findLastIndex(
      (event) => event.type === "firebase-patch",
    );
    assert(stop < restoreIntent && restoreIntent < direct);
    assert(
      state.events
        .filter((event) => event.type === "firebase-read")
        .every((event) => event.authenticated),
    );
    assert(
      !state.events.some((event) => event.type === "unexpected-network-denied"),
    );
  });
}

test("feature-disabled worker: direct restoration still runs, without Firebase credentials", async (t) => {
  const f = await fixture(t, { disabled: true });
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  await f.edit((state) => {
    state.screens[0].brightness = {
      ratio: 7700,
      ratioScale: 10000,
      nit: 0,
      nitType: 0,
    };
  });
  const before = await f.read();
  success(
    await f.run(["stop-before-restore", "restore-hardware"], {
      FIREBASE_ID_TOKEN: "",
      FIREBASE_UID: "",
    }),
  );
  const state = await f.read();
  assert.deepEqual(state.screens, f.original.screens);
  assert.deepEqual(state.db, f.original.db);
  assert.equal(
    state.events.filter((e) => e.type.startsWith("firebase-")).length,
    before.events.filter((e) => e.type.startsWith("firebase-")).length,
  );
  assert(
    !state.events.some(
      (e) => e.type === "service-start" || e.type === "simulated-worker-write",
    ),
  );
});

test("denied Firebase intent restoration does not block independent exact hardware restore", async (t) => {
  const f = await fixture(t);
  success(await f.run(sequence.slice(0, 7)));
  const before = await f.read();
  failure(
    await f.run(["restore-intent"], {
      FIREBASE_ID_TOKEN: "synthetic-expired-token",
    }),
    /HTTP 401/u,
  );
  assert.deepEqual(
    (await f.read()).db,
    before.db,
    "Rejected atomic patch changed nothing",
  );
  success(
    await f.run(["restore-hardware"], {
      FIREBASE_ID_TOKEN: "",
      FIREBASE_UID: "",
    }),
  );
  assert.deepEqual((await f.read()).screens, f.original.screens);
  assert.equal((await f.read()).workerRunning, false);
});

for (const kind of ["malformed-json", "body-read-rejection"]) {
  const resources = [
    "auth/operator/test-venue",
    "states/test-venue/perimeter",
    "perimeter/test-venue/brightnessStatus",
  ];
  for (const [index, resource] of resources.entries()) {
    test(`snapshot sanitizes ${kind} at ${resource} before downstream I/O`, async (t) => {
      const f = await fixture(t);
      success(await f.run(["stop-before-snapshot"]));
      await f.edit((state) => {
        state.firebaseResponseFailure = { resource, kind };
      });
      const result = await f.run(sequence.slice(1));
      failure(
        result,
        /Firebase REST response body unreadable or invalid JSON \(HTTP 200\); no automatic retry/u,
      );
      assert.equal(result.stdout, "");
      const state = await f.read();
      assert.deepEqual(state.db, f.original.db);
      assert.deepEqual(state.screens, f.original.screens);
      assert.equal(state.workerRunning, false);
      assert.deepEqual(
        state.events,
        [
          { type: "service-stop-and-simulated-drain" },
          ...resources.slice(0, index + 1).map((readResource) => ({
            type: "firebase-read",
            resource: readResource,
            authenticated: true,
            permitted: true,
          })),
          { type: "firebase-response-failure", kind, resource, method: "GET" },
        ],
        "No retries, device I/O, Firebase writes or service starts after failure",
      );
      await assert.rejects(stat(f.session), { code: "ENOENT" });
    });
  }

  test(`denied HTTP status is preserved with ${kind}`, async (t) => {
    const f = await fixture(t);
    await f.edit((state) => {
      state.firebaseResponseFailure = {
        resource: "auth/operator/test-venue",
        kind,
      };
    });
    failure(
      await f.run(["stop-before-snapshot", "snapshot"], {
        FIREBASE_ID_TOKEN: "synthetic-expired-token",
      }),
      /Firebase REST denied\/failed \(HTTP 401\)/u,
    );
    const state = await f.read();
    assert.deepEqual(state.db, f.original.db);
    assert.deepEqual(state.screens, f.original.screens);
    assert.equal(
      state.events.filter((e) => e.type === "firebase-read").length,
      1,
    );
    assert(!state.events.some((e) => e.type === "device-request"));
    await assert.rejects(stat(f.session), { code: "ENOENT" });
  });

  test(`ambiguous restore acknowledgement with ${kind} is not retried and hardware restore remains independent`, async (t) => {
    const f = await fixture(t);
    success(await f.run(sequence.slice(0, 7)));
    await f.edit((state) => {
      state.firebaseResponseFailure = { resource: "", method: "PATCH", kind };
    });
    const before = await f.read();
    const result = await f.run(["restore-intent"]);
    failure(
      result,
      /Firebase REST response body unreadable or invalid JSON \(HTTP 200\); no automatic retry/u,
    );
    assert.equal(result.stdout, "");
    const state = await f.read();
    assert.deepEqual(
      state.events.slice(before.events.length).map((e) => e.type),
      ["firebase-patch", "firebase-response-failure"],
      "One committed patch, no retry or readback after its ambiguous response",
    );
    assert.deepEqual(state.db.states, f.original.db.states);
    assert.equal(state.workerRunning, false);
    success(
      await f.run(["restore-hardware"], {
        FIREBASE_ID_TOKEN: "",
        FIREBASE_UID: "",
      }),
    );
    assert.deepEqual((await f.read()).screens, f.original.screens);
    assert.equal((await f.read()).workerRunning, false);
  });
}

for (const [label, overrides] of [
  ["missing ID token", { FIREBASE_ID_TOKEN: "" }],
  ["expired ID token", { FIREBASE_ID_TOKEN: "synthetic-expired-token" }],
  [
    "admin without venue membership",
    { FIREBASE_ID_TOKEN: "synthetic-outsider-token" },
  ],
]) {
  test(`snapshot fails closed: ${label}`, async (t) => {
    const f = await fixture(t);
    failure(
      await f.run(["stop-before-snapshot", "snapshot"], overrides),
      /ID_TOKEN|HTTP 401/u,
    );
    const state = await f.read();
    assert.deepEqual(state.db, f.original.db);
    assert(!state.events.some((e) => e.type === "device-request"));
  });
}

test("snapshot GUID not present fails without fallback or writes", async (t) => {
  const f = await fixture(t);
  failure(
    await f.run(["stop-before-snapshot", "snapshot"], {
      PERIMETER_VNNOX_PERIMETER_GUID: "missing-guid",
    }),
    /GUID not found/u,
  );
  assert(
    !(await f.read()).events.some(
      (e) => e.type === "direct-restore" || e.type === "firebase-patch",
    ),
  );
});

test("nonnumeric nit fields fail snapshot instead of silently defaulting raw values", async (t) => {
  const f = await fixture(t);
  for (const [field, value] of [
    ["nit", "17.5"],
    ["nitType", null],
  ]) {
    await f.edit((state) => {
      state.screens[0].brightness = { ...defaultHardware, [field]: value };
    });
    failure(
      await f.run(["stop-before-snapshot", "snapshot"]),
      /Cannot preserve nonnumeric/u,
    );
  }
  assert(
    !(await f.read()).events.some(
      (e) => e.type === "firebase-patch" || e.type === "direct-restore",
    ),
  );
});

test("missing environment selection or GUID cannot fall back to live defaults", async (t) => {
  const f = await fixture(t, { disabled: true });
  for (const overrides of [
    { FIREBASE_DATABASE_URL: "" },
    { FIREBASE_LOCATION: "" },
    { PERIMETER_VNNOX_PERIMETER_GUID: "" },
    { PERIMETER_VNNOX_BASE_URL: "http://REPLACE_WITH_UCENTER_HOST_AND_PORT" },
  ]) {
    failure(await f.run(["snapshot"], overrides), /Set .* explicitly/u);
  }
  assert.deepEqual((await f.read()).events, []);
});

test("snapshot scope rejects another database, venue, serial or GUID before restoration I/O", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const before = (await f.read()).events.length;
  for (const [name, value] of Object.entries({
    FIREBASE_DATABASE_URL: "https://other.invalid",
    FIREBASE_LOCATION: "other-venue",
    PERIMETER_VNNOX_SN: "other-serial",
    PERIMETER_VNNOX_PERIMETER_GUID: "mvr-guid",
  })) {
    failure(
      await f.run(["restore-hardware"], { [name]: value }),
      /Snapshot environment\/device scope differs/u,
    );
  }
  assert.equal((await f.read()).events.length, before);
});

test("refuses snapshot overwrite and restoration without stopped-worker declaration", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const original = await readFile(
    path.join(f.session, "snapshot.json"),
    "utf8",
  );
  failure(await f.run(["snapshot"]), /EEXIST/u);
  assert.equal(
    await readFile(path.join(f.session, "snapshot.json"), "utf8"),
    original,
  );
  const before = (await f.read()).events.length;
  for (const action of ["prepare", "restore-intent", "restore-hardware"]) {
    failure(
      await f.run([action], { BRIGHTNESS_WORKER_STOPPED: "false" }),
      /Stop and confirm all workers drained/u,
    );
  }
  assert.equal((await f.read()).events.length, before);
});

test("fractional and out-of-range commands are rejected before a REST write", async (t) => {
  const f = await fixture(t);
  success(await f.run(sequence.slice(0, 4)));
  const before = (await f.read()).events.length;
  for (const value of ["4.5", "101", "-1", "", "NaN"]) {
    failure(
      await f.run(["command"], { SMOKE_PERCENT: value }),
      /integer 0–100/u,
    );
  }
  assert.equal((await f.read()).events.length, before);
  success(await f.run(sequence.slice(6)));
});

test("old applied status is not accepted as a current hardware verification", async (t) => {
  const f = await fixture(t);
  success(await f.run(sequence.slice(0, 5)));
  await f.edit((state) => {
    state.db.perimeter["test-venue"].brightnessStatus.updatedAt = 1;
  });
  failure(await f.run(["verify-command"]), /Status predates this command/u);
  success(await f.run(sequence.slice(6)));
});

for (const [flag, expected] of [
  ["ignoreRestore", /Expected values to be strictly deep-equal/u],
  ["changeOtherScreen", /Non-target screens changed/u],
  ["ambiguousRestore", /Synthetic ambiguous response after write/u],
  ["rejectDeviceAuth", /code 8273/u],
]) {
  test(`restoration failure cannot claim success or retry dispatch: ${flag}`, async (t) => {
    const f = await fixture(t);
    success(await f.run(sequence.slice(0, 7)));
    await f.edit((state) => {
      state[flag] = true;
    });
    const result = await f.run(["restore-hardware"]);
    failure(result, expected);
    assert(!result.stdout.includes("restored and read back"));
    const state = await f.read();
    assert.equal(state.workerRunning, false);
    assert.equal(
      state.events.filter(
        (e) =>
          e.type === "device-request" &&
          e.method === "POST" &&
          e.resource.endsWith("/brightness"),
      ).length,
      1,
    );
  });
}

test("current rule expressions deny invalid auto documents, forged/reused audit and telemetry writes atomically", async (t) => {
  const f = await fixture(t);
  const event = {
    timestamp: { ".sv": "timestamp" },
    uid: "operator",
    sessionId: "mock-session",
    action: "mock",
    stateArea: "perimeter",
    changes: '{"brightness":8}',
  };
  const cases = [
    { "states/test-venue/perimeter/brightnessAuto": { enabled: false } },
    {
      "states/test-venue/perimeter/brightnessAuto": {
        ...auto,
        min: 90,
        max: 3,
      },
    },
    {
      "states/test-venue/perimeter/brightnessAuto": {
        ...auto,
        unexpected: true,
      },
    },
    {
      "audit/test-venue/new": { ...event, uid: "forged-user" },
      "states/test-venue/perimeter/brightness": 8,
    },
    {
      "audit/test-venue/old": event,
      "states/test-venue/perimeter/brightness": 8,
    },
    { "perimeter/test-venue/brightnessStatus": { phase: "applied" } },
  ];
  for (const updates of cases) {
    const result = await f.execute(
      `node --input-type=module <<'NODE'\nconst url = new URL("https://firebase.invalid/.json");\nurl.searchParams.set("auth", process.env.FIREBASE_ID_TOKEN);\nconst response = await fetch(url, {method: "PATCH", redirect: "error", body: JSON.stringify(${JSON.stringify(updates)})});\nif (response.status !== 401) throw new Error("Expected rule denial");\nNODE`,
    );
    success(result);
    assert.deepEqual((await f.read()).db, f.original.db);
  }
});

test("unexpected network is denied, never passed through to a real transport", async (t) => {
  const f = await fixture(t);
  failure(
    await f.execute(
      "node --input-type=module -e 'await fetch(\"https://unapproved.invalid/\")'",
    ),
    /Unexpected network access denied/u,
  );
  assert.deepEqual((await f.read()).events, [
    { type: "unexpected-network-denied" },
  ]);
});
