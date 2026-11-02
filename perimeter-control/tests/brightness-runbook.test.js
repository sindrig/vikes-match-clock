import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const environmentSetup = blocks.environment;

function selectEnvironment(block, environment) {
  return block.replace(
    /export (\w+)="[^"]*REPLACE_WITH_[^"]*"/gu,
    (_, name) =>
      `export ${name}='${(environment[name] ?? "").replaceAll("'", "'\\''")}'`,
  );
}
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
  ["environment", "firebase-credentials", "shell", ...sequence],
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
  assert.equal(fences.length, 13);
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
    RUNBOOK_PRIVATE_MARKER: randomUUID(),
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
  const executions = [];
  async function execute(script, overrides = {}, clean = false) {
    const state = await read();
    const result = spawnSync("/bin/bash", ["-c", script], {
      cwd: root,
      env: {
        ...(clean
          ? {
              PATH: environment.PATH,
              NODE_OPTIONS: environment.NODE_OPTIONS,
              RUNBOOK_MOCK_STATE: stateFile,
              RUNBOOK_PRIVATE_MARKER: environment.RUNBOOK_PRIVATE_MARKER,
              PERIMETER_VNNOX_PASSWORD: environment.PERIMETER_VNNOX_PASSWORD,
            }
          : {
              ...environment,
              BRIGHTNESS_WORKER_STOPPED: String(!state.workerRunning),
            }),
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
      environment.RUNBOOK_PRIVATE_MARKER,
      Buffer.from(environment.PERIMETER_VNNOX_PASSWORD).toString("base64"),
      overrides.FIREBASE_ID_TOKEN,
      overrides.PERIMETER_VNNOX_PASSWORD,
    ]) {
      if (secret)
        assert(
          !output.includes(secret),
          "Command output exposed a synthetic credential",
        );
    }
    for (const privateContent of [
      "private-response-body",
      "private-device-response",
      "?auth=",
      "<html>",
      "https://firebase.invalid",
      "http://vnnox.invalid",
    ])
      assert(
        !output.includes(privateContent),
        "Command output exposed a Firebase response body or URL",
      );
    assert(
      !/https:\/\/firebase\.invalid\/\S*\.json/u.test(output),
      "Command output exposed a Firebase request URL",
    );
    executions.push({
      exit: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
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
  const runSetup = (names, overrides = {}, clean = false) => {
    const needsFirebase = names.some((name) =>
      [
        "snapshot",
        "prepare",
        "command",
        "verify-command",
        "restore-intent",
      ].includes(name),
    );
    return execute(
      [
        "set -euo pipefail",
        ...(clean
          ? [
              'test "${FIREBASE_ID_TOKEN+x}" != x',
              'test "${FIREBASE_UID+x}" != x',
              'test "${BRIGHTNESS_WORKER_STOPPED+x}" != x',
            ]
          : []),
        selectEnvironment(environmentSetup, { ...environment, ...overrides }),
        ...(needsFirebase
          ? [
              selectEnvironment(blocks["firebase-credentials"], {
                ...environment,
                ...overrides,
              }),
            ]
          : []),
        ...(clean && !needsFirebase
          ? [
              'test "${FIREBASE_ID_TOKEN+x}" != x',
              'test "${FIREBASE_UID+x}" != x',
            ]
          : []),
        blocks.shell,
        ...names.map((name) => blocks[name]),
      ].join("\n"),
      overrides,
      clean,
    );
  };
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
            executions,
            events: state.events,
            finalHardware: state.screens,
            finalIntent: state.db.states["test-venue"].perimeter,
            workerRunning: state.workerRunning,
          },
          null,
          2,
        ).replaceAll(
          environment.RUNBOOK_PRIVATE_MARKER,
          "[redacted synthetic credential]",
        ),
      );
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    run,
    runSetup,
    execute,
    read,
    edit,
    original: structuredClone(original),
    session,
    privateMarker: environment.RUNBOOK_PRIVATE_MARKER,
  };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function failure(result, pattern) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
}

const jsonKinds = [
  "json-object",
  "json-string",
  "json-array",
  "json-number",
  "json-boolean",
  "json-null",
];
const nonNullKinds = jsonKinds.filter((kind) => kind !== "json-null");
const nonNumberKinds = jsonKinds.filter((kind) => kind !== "json-number");
const intentResource = "states/test-venue/perimeter";
const statusResource = "perimeter/test-venue/brightnessStatus";

// Each site specifies the complete permitted I/O sequence. A failed response
// must be last: no retry, later readback, device access, service start or save.
const firebaseSites = [
  {
    name: "snapshot authorization",
    action: "snapshot",
    setup: ["stop-before-snapshot"],
    resource: "auth/operator/test-venue",
    pattern: /Operator needs auth/u,
    events: ["firebase-read"],
  },
  {
    name: "snapshot state document",
    action: "snapshot",
    setup: ["stop-before-snapshot"],
    resource: intentResource,
    kinds: ["json-string", "json-array", "json-number", "json-boolean"],
    pattern: /state must be an object/u,
    events: ["firebase-read", "firebase-read"],
  },
  {
    name: "snapshot manual intent",
    action: "snapshot",
    setup: ["stop-before-snapshot"],
    resource: intentResource,
    field: "brightness",
    kinds: nonNullKinds,
    pattern: /invalid brightness\/auto shape/u,
    events: ["firebase-read", "firebase-read"],
  },
  {
    name: "snapshot automatic intent",
    action: "snapshot",
    setup: ["stop-before-snapshot"],
    resource: intentResource,
    field: "brightnessAuto",
    kinds: nonNullKinds,
    pattern: /invalid brightness\/auto shape/u,
    events: ["firebase-read", "firebase-read"],
  },
  {
    name: "snapshot observational status",
    action: "snapshot",
    setup: ["stop-before-snapshot"],
    resource: statusResource,
    kinds: nonNullKinds,
    pattern: /status has an invalid shape/u,
    events: ["firebase-read", "firebase-read", "firebase-read"],
  },
  {
    name: "prepare initial intent equality",
    action: "prepare",
    setup: ["stop-before-snapshot", "snapshot"],
    resource: intentResource,
    pattern: /Intent changed|state must be an object/u,
    events: ["firebase-read"],
  },
  {
    name: "command initial intent shape",
    action: "command",
    setup: sequence.slice(0, 4),
    resource: intentResource,
    field: "brightness",
    kinds: nonNullKinds,
    pattern: /invalid brightness\/auto shape/u,
    events: ["firebase-read"],
  },
  {
    name: "prepare manual deletion readback",
    action: "prepare",
    setup: ["stop-before-snapshot", "snapshot"],
    resource: intentResource,
    field: "brightness",
    skip: 1,
    kinds: nonNullKinds,
    pattern: /invalid brightness\/auto shape/u,
    events: [
      "firebase-read",
      "firebase-patch",
      "firebase-read",
      "firebase-read",
    ],
  },
  {
    name: "prepare automatic deletion readback",
    action: "prepare",
    setup: ["stop-before-snapshot", "snapshot"],
    fixture: { missing: true },
    resource: intentResource,
    field: "brightnessAuto",
    skip: 1,
    kinds: nonNullKinds,
    pattern: /invalid brightness\/auto shape/u,
    events: [
      "firebase-read",
      "firebase-patch",
      "firebase-read",
      "firebase-read",
    ],
  },
  {
    name: "prepare complete automatic readback",
    action: "prepare",
    setup: ["stop-before-snapshot", "snapshot"],
    resource: intentResource,
    field: "brightnessAuto.min",
    skip: 1,
    pattern: /Prepared auto exact readback differs/u,
    events: [
      "firebase-read",
      "firebase-patch",
      "firebase-read",
      "firebase-read",
    ],
  },
  {
    name: "prepare automatic timestamp readback",
    action: "prepare",
    setup: ["stop-before-snapshot", "snapshot"],
    resource: intentResource,
    field: "brightnessAuto.updatedAt",
    skip: 1,
    kinds: nonNumberKinds,
    pattern: /Prepared auto readback missing timestamp/u,
    events: [
      "firebase-read",
      "firebase-patch",
      "firebase-read",
      "firebase-read",
    ],
  },
  {
    name: "command intent readback",
    action: "command",
    setup: sequence.slice(0, 4),
    resource: intentResource,
    field: "brightness",
    skip: 1,
    pattern: /invalid brightness\/auto shape|Command intent readback differs/u,
    events: [
      "firebase-read",
      "firebase-patch",
      "simulated-worker-write",
      "firebase-read",
      "firebase-read",
    ],
  },
  {
    name: "restored complete intent readback",
    action: "restore-intent",
    setup: ["stop-before-snapshot", "snapshot"],
    resource: intentResource,
    pattern: /state must be an object|Restored intent exact readback differs/u,
    events: ["firebase-patch", "firebase-read", "firebase-read"],
  },
  ...[
    [
      undefined,
      jsonKinds,
      /status has an invalid shape|Status phase is not applied/u,
    ],
    ["phase", jsonKinds, /status has an invalid shape/u],
    ["requestedPercent", jsonKinds, /Status requested percent differs/u],
    ["appliedPercent", jsonKinds, /Status applied percent differs/u],
    ["updatedAt", nonNumberKinds, /status has an invalid shape/u],
  ].map(([field, kinds, pattern]) => ({
    name: `verify-command status ${field ?? "document"}`,
    action: "verify-command",
    setup: sequence.slice(0, 5),
    resource: statusResource,
    field,
    kinds,
    pattern,
    events: ["firebase-read"],
  })),
  ...["prepare", "command", "restore-intent"].flatMap((action) =>
    [
      [undefined, jsonKinds, /Audit readback missing timestamp/u],
      ["uid", jsonKinds, /Audit exact readback differs/u],
      ["timestamp", nonNumberKinds, /Audit readback missing timestamp/u],
    ].map(([field, kinds, pattern]) => ({
      name: `${action} audit ${field ?? "document"}`,
      action,
      setup:
        action === "command"
          ? sequence.slice(0, 4)
          : ["stop-before-snapshot", "snapshot"],
      resource: "audit",
      field,
      kinds,
      pattern,
      events: [
        ...(action === "restore-intent" ? [] : ["firebase-read"]),
        "firebase-patch",
        ...(action === "command" ? ["simulated-worker-write"] : []),
        "firebase-read",
      ],
    })),
  ),
];

for (const site of firebaseSites) {
  for (const kind of site.kinds ?? jsonKinds) {
    test(`${site.name} rejects HTTP 200 ${kind} without exposing values`, async (t) => {
      const f = await fixture(t, site.fixture);
      success(await f.run(site.setup));
      await f.edit((state) => {
        state.firebaseResponseFailure = {
          resource: site.resource,
          kind,
          field: site.field,
          skip: site.skip,
          ...(site.name === "snapshot authorization" && kind === "json-boolean"
            ? { value: false }
            : {}),
        };
      });
      const before = await f.read();
      const snapshotText =
        site.action === "snapshot"
          ? null
          : await readFile(path.join(f.session, "snapshot.json"), "utf8");
      const commandText =
        site.action === "verify-command"
          ? await readFile(path.join(f.session, "command.json"), "utf8")
          : null;
      const result = await f.run([site.action]);
      failure(result, site.pattern);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(
        result.stderr.split("\n").length,
        2,
        "Only one safe diagnostic line",
      );
      assert(
        !/AssertionError|TypeError|\[cause\]|actual:|expected:/u.test(
          result.stderr,
        ),
      );
      const state = await f.read();
      const events = state.events.slice(before.events.length);
      assert.deepEqual(
        events.map((e) => e.type),
        [...site.events, "firebase-response-failure"],
      );
      assert.equal(state.workerRunning, before.workerRunning);
      const patches = events.filter((e) => e.type === "firebase-patch");
      assert(patches.length <= 1, "No retry of a possibly committed write");
      if (patches.length === 0) {
        assert.deepEqual(state.db, before.db);
        assert.deepEqual(state.screens, before.screens);
      } else {
        assert.deepEqual(
          state.db.states["other-venue"],
          before.db.states["other-venue"],
        );
        assert.deepEqual(
          state.db.audit["test-venue"].old,
          before.db.audit["test-venue"].old,
        );
        assert.deepEqual(state.screens.slice(1), before.screens.slice(1));
      }
      if (site.action === "snapshot")
        await assert.rejects(stat(f.session), { code: "ENOENT" });
      else
        assert.equal(
          await readFile(path.join(f.session, "snapshot.json"), "utf8"),
          snapshotText,
        );
      if (site.action === "verify-command")
        assert.equal(
          await readFile(path.join(f.session, "command.json"), "utf8"),
          commandText,
        );
      else if (site.action === "command" && site.skip === 1) {
        const savedCommand = JSON.parse(
          await readFile(path.join(f.session, "command.json"), "utf8"),
        );
        assert.equal(savedCommand.percent, 7);
        assert.equal(typeof savedCommand.timestamp, "number");
      } else if (site.action !== "snapshot")
        await assert.rejects(stat(path.join(f.session, "command.json")), {
          code: "ENOENT",
        });
    });
  }
}

for (const kind of [
  "transport",
  "http",
  "invalid-status",
  "type-exception",
  "body-shape-exception",
  "thrown-primitive",
  "inspection-trap",
]) {
  test(`final boundary and REST diagnostics sanitize ${kind} without downstream I/O`, async (t) => {
    const f = await fixture(t);
    success(await f.run(["stop-before-snapshot"]));
    const resource =
      kind === "body-shape-exception"
        ? intentResource
        : "auth/operator/test-venue";
    await f.edit((state) => {
      state.firebaseResponseFailure = { resource, kind };
    });
    const result = await f.run(["snapshot"]);
    failure(
      result,
      /Firebase REST transport failed|HTTP 503|invalid HTTP status|Unexpected local or response error/u,
    );
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.split("\n").length, 2);
    const state = await f.read();
    assert.deepEqual(state.db, f.original.db);
    assert.deepEqual(state.screens, f.original.screens);
    assert.deepEqual(
      state.events.slice(1).map((e) => e.type),
      [
        "firebase-read",
        ...(kind === "body-shape-exception" ? ["firebase-read"] : []),
        "firebase-response-failure",
      ],
    );
    await assert.rejects(stat(f.session), { code: "ENOENT" });
  });
}

for (const field of ["FIREBASE_DATABASE_URL", "PERIMETER_VNNOX_BASE_URL"]) {
  test(`setup sanitizes credential-bearing invalid ${field} URL exceptions`, async (t) => {
    const f = await fixture(t);
    const result = await f.run(["snapshot"], {
      [field]: `private-response-body ${f.privateMarker}`,
    });
    failure(
      result,
      /Brightness session setup: Unexpected local or response error/u,
    );
    assert.equal(result.stdout, "");
    assert.deepEqual((await f.read()).events, []);
  });
}

for (const [field, expected] of [
  ["BRIGHTNESS_WORKER_STOPPED", /Stop and confirm all workers drained/u],
  ["FIREBASE_UID", /Invalid FIREBASE_UID/u],
]) {
  test(`validation never attaches raw ${field} environment values`, async (t) => {
    const f = await fixture(t);
    failure(
      await f.run(["snapshot"], {
        BRIGHTNESS_WORKER_STOPPED: "true",
        [field]: `private-response-body ${f.privateMarker}`,
      }),
      expected,
    );
    assert.deepEqual((await f.read()).events, []);
  });
}

test("unknown action and invalid argument diagnostics never echo argv", async (t) => {
  const f = await fixture(t);
  failure(
    await f.execute('node tools/brightness-session.mjs "$RUNBOOK_ACTION"', {
      RUNBOOK_ACTION: f.privateMarker,
    }),
    /Use snapshot/u,
  );
  failure(
    await f.run(["command"], {
      BRIGHTNESS_WORKER_STOPPED: "false",
      SMOKE_PERCENT: f.privateMarker,
    }),
    /integer 0–100/u,
  );
  assert.deepEqual((await f.read()).events, []);
});

test("intent comparison never prints credential-bearing saved expected values", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const file = path.join(f.session, "snapshot.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  saved.intent.brightnessAuto.min = f.privateMarker;
  await writeFile(file, JSON.stringify(saved));
  const before = await f.read();
  failure(await f.run(["prepare"]), /Intent changed since snapshot/u);
  const state = await f.read();
  assert.deepEqual(
    state.events.slice(before.events.length).map((e) => e.type),
    ["firebase-read"],
  );
  assert.deepEqual(state.db, before.db);
  assert.deepEqual(state.screens, before.screens);
});

for (const [file, action] of [
  ["snapshot.json", "restore-hardware"],
  ["command.json", "verify-command"],
]) {
  for (const kind of ["malformed-json", ...jsonKinds]) {
    test(`${file} ${kind} fails safely before any restoration or verification I/O`, async (t) => {
      const f = await fixture(t);
      success(await f.run(sequence.slice(0, 5)));
      success(await f.run(["stop-before-restore"]));
      const reflected = `private-response-body ${f.privateMarker}`;
      const value = {
        "json-object": { error: reflected },
        "json-string": reflected,
        "json-array": [reflected],
        "json-number": 37.25,
        "json-boolean": true,
        "json-null": null,
      }[kind];
      await writeFile(
        path.join(f.session, file),
        kind === "malformed-json" ? reflected : JSON.stringify(value),
      );
      const before = await f.read();
      const result = await f.run([action]);
      failure(
        result,
        /file unreadable or invalid JSON|file has an invalid|Snapshot environment\/device scope differs/u,
      );
      assert.equal(result.stdout, "");
      assert.deepEqual((await f.read()).events, before.events);
      assert.deepEqual((await f.read()).screens, before.screens);
      assert.deepEqual((await f.read()).db, before.db);
    });
  }
}

test("saved fields are checked before the operations that use them", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const file = path.join(f.session, "snapshot.json");
  const original = JSON.parse(await readFile(file, "utf8"));
  const before = await f.read();
  for (const [field, value, actions] of [
    ["intent", f.privateMarker, ["prepare", "restore-intent"]],
    [
      "hardware",
      { ...defaultHardware, ratio: f.privateMarker },
      ["restore-hardware"],
    ],
    ["otherScreens", f.privateMarker, ["restore-hardware"]],
  ]) {
    await writeFile(file, JSON.stringify({ ...original, [field]: value }));
    for (const action of actions)
      failure(
        await f.run([action]),
        /invalid brightness\/auto shape|invalid hardware shape/u,
      );
  }
  assert.deepEqual((await f.read()).events, before.events);
});

test("hardware-only restoration does not require valid saved Firebase intent or session identity", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const file = path.join(f.session, "snapshot.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  saved.intent = f.privateMarker;
  delete saved.sessionId;
  await writeFile(file, JSON.stringify(saved));
  await f.edit((state) => {
    state.screens[0].brightness.ratio = 7700;
  });
  const before = await f.read();
  success(
    await f.runSetup(["stop-before-restore", "restore-hardware"], {}, true),
  );
  const state = await f.read();
  assert.deepEqual(state.screens, f.original.screens);
  assert.deepEqual(state.db, before.db);
  assert(
    !state.events
      .slice(before.events.length)
      .some((e) => e.type.startsWith("firebase-")),
  );
});

test("filesystem failures do not expose session paths or cause a write retry", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const blocker = path.join(f.session, f.privateMarker);
  await writeFile(blocker, "owned fixture");
  failure(
    await f.run(["snapshot"], {
      BRIGHTNESS_SESSION_DIR: path.join(blocker, "session"),
    }),
    /Unexpected local or response error/u,
  );
  const privateDirectory = path.join(f.session, `session-${f.privateMarker}`);
  await mkdir(privateDirectory);
  const snapshot = path.join(privateDirectory, "snapshot.json");
  await writeFile(snapshot, "owned fixture");
  failure(
    await f.run(["snapshot"], { BRIGHTNESS_SESSION_DIR: privateDirectory }),
    /EEXIST/u,
  );
  assert.equal(await readFile(snapshot, "utf8"), "owned fixture");
  success(await f.run(["prepare", "start"]));
  await mkdir(path.join(f.session, "command.json"));
  const before = await f.read();
  failure(await f.run(["command"]), /Session file could not be saved/u);
  assert.deepEqual(
    (await f.read()).events.slice(before.events.length).map((e) => e.type),
    [
      "firebase-read",
      "firebase-patch",
      "simulated-worker-write",
      "firebase-read",
    ],
  );
});

for (const [name, action, field, value, options, pattern] of [
  [
    "manual deletion",
    "prepare",
    "brightness",
    41,
    {},
    /Prepared manual brightness readback differs/u,
  ],
  [
    "automatic deletion",
    "prepare",
    "brightnessAuto",
    { enabled: false },
    { missing: true },
    /Prepared auto deletion readback differs/u,
  ],
  [
    "command integer",
    "command",
    "brightness",
    41,
    {},
    /Command intent readback differs/u,
  ],
]) {
  test(`validly typed ${name} mismatch retains exact comparison`, async (t) => {
    const f = await fixture(t, options);
    success(
      await f.run(
        action === "command"
          ? sequence.slice(0, 4)
          : ["stop-before-snapshot", "snapshot"],
      ),
    );
    await f.edit((state) => {
      state.firebaseResponseFailure = {
        resource: intentResource,
        kind: "json-object",
        field,
        value,
        skip: 1,
      };
    });
    const before = await f.read();
    failure(await f.run([action]), pattern);
    const events = (await f.read()).events.slice(before.events.length);
    assert.equal(events.filter((e) => e.type === "firebase-patch").length, 1);
    assert.equal(events.at(-1).type, "firebase-response-failure");
  });
}

for (const kind of jsonKinds) {
  test(`valid JSON ${kind} PATCH acknowledgement still requires independent exact readbacks`, async (t) => {
    const f = await fixture(t);
    success(await f.run(["stop-before-snapshot", "snapshot"]));
    await f.edit((state) => {
      state.firebaseResponseFailure = { resource: "", method: "PATCH", kind };
    });
    success(await f.run(["prepare"]));
    const state = await f.read();
    assert.equal(
      state.events.filter((e) => e.type === "firebase-patch").length,
      1,
    );
    assert.equal(state.db.states["test-venue"].perimeter.brightness, undefined);
    assert.equal(
      state.db.states["test-venue"].perimeter.brightnessAuto.enabled,
      false,
    );
    assert.deepEqual(state.screens, f.original.screens);
  });
}

test("null Firebase state and status remain valid observations with exact null restoration", async (t) => {
  const f = await fixture(t);
  await f.edit((state) => {
    state.db.states["test-venue"].perimeter = null;
    state.db.perimeter["test-venue"].brightnessStatus = null;
  });
  success(
    await f.run([
      "stop-before-snapshot",
      "snapshot",
      "restore-intent",
      "restore-hardware",
    ]),
  );
  const saved = JSON.parse(
    await readFile(path.join(f.session, "snapshot.json"), "utf8"),
  );
  assert.deepEqual(saved.intent, { brightness: null, brightnessAuto: null });
  assert.equal(saved.status, null);
  assert.deepEqual((await f.read()).screens, f.original.screens);
});

test("new-shell recovery executes the full documented setup without Firebase credentials", async (t) => {
  const f = await fixture(t, { disabled: true });
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  await f.edit((state) => {
    state.screens[0].brightness.ratio = 7700;
  });
  const before = await f.read();
  success(
    await f.runSetup(["stop-before-restore", "restore-hardware"], {}, true),
  );
  const state = await f.read();
  assert.deepEqual(state.screens, f.original.screens);
  assert.deepEqual(state.db, f.original.db);
  assert.equal(state.workerRunning, false);
  assert(
    !state.events
      .slice(before.events.length)
      .some((e) => e.type.startsWith("firebase-")),
  );
  assert.equal(
    state.events[before.events.length].type,
    "service-stop-and-simulated-drain",
  );
});

test("documented Firebase identity setup requires a token for every Firebase action before I/O", async (t) => {
  const f = await fixture(t);
  for (const action of [
    "snapshot",
    "prepare",
    "command",
    "verify-command",
    "restore-intent",
  ])
    failure(await f.runSetup([action], {}, true), /FIREBASE_ID_TOKEN/u);
  assert.deepEqual((await f.read()).events, []);
});

for (const action of ["snapshot", "verify-command", "restore-hardware"]) {
  test(`${action} sanitizes real native header rejection with no connection or retry`, async (t) => {
    const f = await fixture(t);
    if (action === "snapshot") success(await f.run(["stop-before-snapshot"]));
    else if (action === "verify-command")
      success(await f.run(sequence.slice(0, 5)));
    else success(await f.run(["stop-before-snapshot", "snapshot"]));
    await f.edit((state) => {
      state.nativeHeaderValidation = true;
    });
    const before = await f.read();
    const result = await f.run([action]);
    failure(
      result,
      action === "restore-hardware"
        ? /Vnnox exact hardware restore write\/login failed; no automatic retry/u
        : /Vnnox screen read\/login failed; no automatic retry/u,
    );
    assert.equal(result.stdout, "");
    const state = await f.read();
    const events = state.events.slice(before.events.length);
    assert.equal(events.filter((e) => e.type === "device-request").length, 1);
    assert.equal(
      events.filter((e) => e.type === "native-header-validation").length,
      1,
    );
    assert.deepEqual(
      events.find((e) => e.type === "native-header-rejection"),
      {
        type: "native-header-rejection",
        invalidHeader: true,
        reflectedCredential: true,
        connectionAttempts: 0,
      },
    );
    assert(
      !events.some(
        (e) =>
          e.type === "socket-connect-denied" ||
          e.type === "direct-restore" ||
          e.type === "firebase-patch",
      ),
    );
    assert.deepEqual(state.screens, before.screens);
    assert.deepEqual(state.db, before.db);
  });
}

test("native fetch with valid headers reaches the connection denial counter", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot"]));
  await f.edit((state) => {
    state.nativeHeaderValidation = true;
    state.validNativeHeader = true;
  });
  failure(
    await f.run(["snapshot"]),
    /Vnnox screen read\/login failed; no automatic retry/u,
  );
  const rejection = (await f.read()).events.find(
    (e) => e.type === "native-header-rejection",
  );
  assert.equal(rejection.invalidHeader, false);
  assert.equal(rejection.reflectedCredential, false);
  assert(
    rejection.connectionAttempts > 0,
    "Native connection attempts must be observable, never swallowed by fixture state saves",
  );
  await assert.rejects(stat(f.session), { code: "ENOENT" });
});

for (const [action, stages] of [
  ["snapshot", ["login", "read"]],
  ["verify-command", ["login", "read"]],
  ["restore-hardware", ["login", "write", "read"]],
]) {
  for (const stage of stages) {
    for (const kind of [
      "transport",
      "malformed-json",
      "body-read-rejection",
      "http",
      "auth-code",
      ...(stage === "login" ? ["missing-token"] : []),
      ...(stage === "write" ? [] : jsonKinds),
    ]) {
      test(`${action} safely fails once on ${stage} ${kind}`, async (t) => {
        const f = await fixture(t);
        if (action === "verify-command")
          success(await f.run(sequence.slice(0, 5)));
        else if (action === "restore-hardware")
          success(await f.run(["stop-before-snapshot", "snapshot"]));
        else success(await f.run(["stop-before-snapshot"]));
        const resource = {
          login: "/unico/v1/system/auth/login",
          read: "/unico/v1/ucenter/screen/normal-screen",
          write: "/unico/v1/ucenter/cabinet/brightness",
        }[stage];
        await f.edit((state) => {
          state.deviceResponseFailure = { resource, kind };
          if (action === "restore-hardware")
            state.screens[0].brightness.ratio = 7700;
        });
        const before = await f.read();
        const result = await f.run([action]);
        failure(
          result,
          action === "restore-hardware" && stage !== "read"
            ? /Vnnox exact hardware restore write\/login failed; no automatic retry/u
            : /Vnnox screen read\/login failed; no automatic retry/u,
        );
        assert.equal(result.stdout, "");
        const state = await f.read();
        const events = state.events.slice(before.events.length);
        assert.deepEqual(
          events
            .filter((e) => e.type === "device-request")
            .map((e) => e.resource),
          [
            "/unico/v1/system/auth/login",
            ...(stage === "login"
              ? []
              : [
                  ...(action === "restore-hardware"
                    ? ["/unico/v1/ucenter/cabinet/brightness"]
                    : []),
                  ...(stage === "write"
                    ? []
                    : ["/unico/v1/ucenter/screen/normal-screen"]),
                ]),
          ],
          "Stop at the failed operation; no retry or downstream device I/O",
        );
        assert.equal(
          events.filter((e) => e.type === "device-response-failure").length,
          1,
        );
        assert.equal(
          events.filter(
            (e) => e.type === "device-request" && e.resource === resource,
          ).length,
          1,
        );
        assert.equal(
          events.filter((e) => e.type === "direct-restore").length,
          action === "restore-hardware" && stage !== "login" ? 1 : 0,
        );
        assert(
          !events.some(
            (e) => e.type === "firebase-patch" || e.type === "service-start",
          ),
        );
        assert.deepEqual(state.db, before.db);
        if (action === "snapshot")
          await assert.rejects(stat(f.session), { code: "ENOENT" });
        if (action === "restore-hardware") {
          // An ambiguous committed write is never resent automatically. The
          // saved snapshot remains usable for a separately initiated recovery.
          await f.edit((current) => {
            delete current.deviceResponseFailure;
          });
          success(
            await f.runSetup(
              ["stop-before-restore", "restore-hardware"],
              {},
              true,
            ),
          );
          assert.deepEqual((await f.read()).screens, f.original.screens);
        }
      });
    }
  }
}

for (const field of ["ratio", "ratioScale", "nit", "nitType"]) {
  test(`snapshot rejects credential-bearing ${field} without echoing readback`, async (t) => {
    const f = await fixture(t);
    await f.edit((state) => {
      state.screens[0].brightness[field] = f.privateMarker;
    });
    failure(
      await f.run(["stop-before-snapshot", "snapshot"]),
      /Vnnox|Cannot preserve nonnumeric/u,
    );
    await assert.rejects(stat(f.session), { code: "ENOENT" });
  });
}

for (const target of [true, false]) {
  test(`restore mismatch on ${target ? "target" : "non-target"} never prints credential-bearing response values`, async (t) => {
    const f = await fixture(t);
    success(await f.run(["stop-before-snapshot", "snapshot"]));
    await f.edit((state) => {
      if (target) {
        state.ignoreRestore = true;
        state.screens[0].brightness.ratio = f.privateMarker;
      } else state.screens[1].brightness.ratio = f.privateMarker;
    });
    failure(
      await f.run(["restore-hardware"]),
      /Vnnox|Non-target screens changed/u,
    );
    assert.equal((await f.read()).workerRunning, false);
  });
}

test("scope rejection never includes credential-bearing header values", async (t) => {
  const f = await fixture(t);
  success(await f.run(["stop-before-snapshot", "snapshot"]));
  const before = await f.read();
  failure(
    await f.run(["restore-hardware"], { PERIMETER_VNNOX_IP: f.privateMarker }),
    /Snapshot environment\/device scope differs/u,
  );
  assert.deepEqual((await f.read()).events, before.events);
});

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
    success(await f.runSetup(sequence));
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
    PERIMETER_VNNOX_BASE_URL: "http://other.invalid",
    PERIMETER_VNNOX_IP: "192.0.2.11",
    PERIMETER_VNNOX_PORT: "8089",
    PERIMETER_VNNOX_PROTOCOL: "https",
    PERIMETER_VNNOX_SN: "other-serial",
    PERIMETER_VNNOX_PROJECT_ID: "other-project",
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
  ["ignoreRestore", /Vnnox exact target brightness readback differs/u],
  ["changeOtherScreen", /Non-target screens changed/u],
  [
    "ambiguousRestore",
    /Vnnox exact hardware restore write\/login failed; no automatic retry/u,
  ],
  [
    "rejectDeviceAuth",
    /Vnnox exact hardware restore write\/login failed; no automatic retry/u,
  ],
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
