// Reference commands for BRIGHTNESS_SMOKE_TEST.md; mock-verified, not field-qualified.
// Import only the device client: never start the daemon or load an Admin credential.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeBrightness, VnnoxClient } from "../vnnox.js";

function required(name) {
  const value = process.env[name];
  if (!value || value.includes("REPLACE_WITH_")) {
    throw new Error(`Set ${name} explicitly for the authorized environment`);
  }
  return value;
}

function key(name) {
  const value = required(name);
  assert(!/[.#$\[\]/\s]/u.test(value), `Invalid ${name}`);
  return value;
}

const database = new URL(required("FIREBASE_DATABASE_URL"));
assert(
  database.protocol === "https:" &&
    !database.username &&
    !database.password &&
    database.pathname === "/" &&
    !database.search &&
    !database.hash,
  "FIREBASE_DATABASE_URL must be an explicit HTTPS database root",
);
const location = key("FIREBASE_LOCATION");
const directory = required("BRIGHTNESS_SESSION_DIR");
assert(path.isAbsolute(directory), "BRIGHTNESS_SESSION_DIR must be absolute");
const snapshotFile = path.join(directory, "snapshot.json");
const commandFile = path.join(directory, "command.json");

// No routing, identity or credential defaults. Password stays in process memory.
const device = Object.fromEntries(
  [
    ["vnnoxBaseUrl", "PERIMETER_VNNOX_BASE_URL"],
    ["vnnoxIp", "PERIMETER_VNNOX_IP"],
    ["vnnoxPort", "PERIMETER_VNNOX_PORT"],
    ["vnnoxProtocol", "PERIMETER_VNNOX_PROTOCOL"],
    ["vnnoxSerial", "PERIMETER_VNNOX_SN"],
    ["vnnoxProjectId", "PERIMETER_VNNOX_PROJECT_ID"],
    ["vnnoxPerimeterGuid", "PERIMETER_VNNOX_PERIMETER_GUID"],
  ].map(([field, name]) => [field, required(name)]),
);
const scope = { database: database.href, location, device };
const deviceUrl = new URL(device.vnnoxBaseUrl);
assert(
  ["http:", "https:"].includes(deviceUrl.protocol) &&
    !deviceUrl.username &&
    !deviceUrl.password &&
    !deviceUrl.search &&
    !deviceUrl.hash,
  "PERIMETER_VNNOX_BASE_URL must not contain credentials or query parameters",
);
const client = new VnnoxClient({
  ...device,
  vnnoxUsername: required("PERIMETER_VNNOX_USERNAME"),
  vnnoxPasswordSource: "env",
  vnnoxPassword: required("PERIMETER_VNNOX_PASSWORD"),
  vnnoxTimeoutMs: 10_000,
});

function stopped() {
  assert.equal(
    process.env.BRIGHTNESS_WORKER_STOPPED,
    "true",
    "Stop and confirm all workers drained; then set BRIGHTNESS_WORKER_STOPPED=true",
  );
}

async function firebase(resource, method = "GET", body) {
  const url = new URL(`${resource}.json`, database);
  url.searchParams.set("auth", required("FIREBASE_ID_TOKEN"));
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Never echo a credential-bearing URL or a transport error containing it.
    throw new Error("Firebase REST transport failed; no automatic retry");
  }
  assert(response.ok, `Firebase REST denied/failed (HTTP ${response.status})`);
  return response.json();
}

async function intent() {
  const state = await firebase(`states/${location}/perimeter`);
  return {
    brightness: state?.brightness ?? null,
    brightnessAuto: state?.brightnessAuto ?? null,
  };
}

async function loadSnapshot() {
  const saved = JSON.parse(await readFile(snapshotFile, "utf8"));
  assert.deepEqual(
    saved.scope,
    scope,
    "Snapshot environment/device scope differs",
  );
  return saved;
}

async function save(file, data, flag = "w") {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, {
    flag,
    mode: 0o600,
  });
}

async function audited(saved, diff, action) {
  const event = randomUUID();
  const audit = {
    timestamp: { ".sv": "timestamp" },
    uid: key("FIREBASE_UID"),
    sessionId: saved.sessionId,
    action,
    stateArea: "perimeter",
    changes: JSON.stringify(diff),
  };
  // Same leaf-path map and stringified changes as writeAuditedState().
  const updates = Object.fromEntries([
    ...Object.entries(diff).map(([field, value]) => [
      `states/${location}/perimeter/${field}`,
      value,
    ]),
    ...Object.entries(audit).map(([field, value]) => [
      `audit/${location}/${event}/${field}`,
      value,
    ]),
  ]);
  await firebase("", "PATCH", updates);
  const recorded = await firebase(`audit/${location}/${event}`);
  assert.equal(typeof recorded?.timestamp, "number", "Audit readback missing");
  assert.deepEqual(recorded, { ...audit, timestamp: recorded.timestamp });
  return recorded;
}

function raw(brightness) {
  const { ratio, ratioScale, nit, nitType } = brightness;
  return { ratio, ratioScale, nit, nitType };
}

async function readHardware() {
  const screens = await client.readScreens();
  const target = screens.find((s) => s.guid === device.vnnoxPerimeterGuid);
  assert(target, "Vnnox perimeter screen GUID not found");
  for (const field of ["nit", "nitType"]) {
    const value = target.brightness?.[field];
    assert(
      value === undefined || Number.isFinite(value),
      `Cannot preserve nonnumeric ${field}; stop before changing brightness`,
    );
  }
  return {
    hardware: raw(normalizeBrightness(target.brightness)),
    otherScreens: screens.filter((s) => s.guid !== device.vnnoxPerimeterGuid),
  };
}

async function verifyHardware(saved, expected) {
  const actual = await readHardware();
  assert.deepEqual(actual.hardware, expected);
  assert.deepEqual(
    actual.otherScreens,
    saved.otherScreens,
    "Non-target screens changed",
  );
}

const [action, argument] = process.argv.slice(2);
switch (action) {
  case "snapshot": {
    stopped();
    assert.equal(
      await firebase(`auth/${key("FIREBASE_UID")}/${location}`),
      true,
      "Operator needs auth/{uid}/{location} == true",
    );
    const saved = {
      scope,
      sessionId: randomUUID(),
      intent: await intent(),
      // Observational only: never restore daemon-owned telemetry.
      status: await firebase(`perimeter/${location}/brightnessStatus`),
      ...(await readHardware()),
    };
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await save(snapshotFile, saved, "wx");
    console.log(
      "Snapshot saved (no credentials); existing snapshot never overwritten",
    );
    break;
  }
  case "prepare": {
    stopped();
    const saved = await loadSnapshot();
    assert.deepEqual(
      await intent(),
      saved.intent,
      "Intent changed since snapshot",
    );
    const brightnessAuto = saved.intent.brightnessAuto
      ? {
          ...saved.intent.brightnessAuto,
          enabled: false,
          updatedAt: { ".sv": "timestamp" },
        }
      : null;
    await audited(
      saved,
      { brightness: null, brightnessAuto },
      "perimeter.brightness-smoke.prepare",
    );
    const prepared = await intent();
    assert.equal(prepared.brightness, null);
    if (brightnessAuto === null) assert.equal(prepared.brightnessAuto, null);
    else {
      assert.equal(typeof prepared.brightnessAuto?.updatedAt, "number");
      assert.deepEqual(prepared.brightnessAuto, {
        ...brightnessAuto,
        updatedAt: prepared.brightnessAuto.updatedAt,
      });
    }
    console.log(
      "Prepared: no retained command, auto disabled; worker stays stopped",
    );
    break;
  }
  case "command": {
    assert.equal(
      process.env.BRIGHTNESS_WORKER_STOPPED,
      "false",
      "Worker must be running",
    );
    assert(/^\d+$/u.test(argument ?? ""), "Command must be an integer 0–100");
    const percent = Number(argument);
    assert(percent <= 100, "Command must be an integer 0–100");
    const saved = await loadSnapshot();
    const current = await intent();
    assert(
      current.brightnessAuto?.enabled !== true,
      "Prepare manual mode first",
    );
    assert.notEqual(
      current.brightness,
      percent,
      "Use a different command to generate a value event",
    );
    const recorded = await audited(
      saved,
      { brightness: percent },
      "perimeter.brightness-smoke.command",
    );
    await save(commandFile, { percent, timestamp: recorded.timestamp });
    assert.equal((await intent()).brightness, percent);
    console.log(
      "Command accepted by Firebase; hardware verification still required",
    );
    break;
  }
  case "verify-command": {
    const saved = await loadSnapshot();
    const command = JSON.parse(await readFile(commandFile, "utf8"));
    const status = await firebase(`perimeter/${location}/brightnessStatus`);
    assert.equal(status?.phase, "applied");
    assert.equal(status.requestedPercent, command.percent);
    assert.equal(status.appliedPercent, command.percent);
    assert.equal(typeof status.updatedAt, "number");
    assert(
      status.updatedAt >= command.timestamp,
      "Status predates this command",
    );
    await verifyHardware(saved, {
      ratio: command.percent * 100,
      ratioScale: 10000,
      nit: 0,
      nitType: 0,
    });
    console.log(
      "Fresh applied status and exact command readback; other screens unchanged",
    );
    break;
  }
  case "restore-intent": {
    stopped();
    const saved = await loadSnapshot();
    await audited(saved, saved.intent, "perimeter.brightness-smoke.restore");
    assert.deepEqual(await intent(), saved.intent);
    console.log(
      "Saved Firebase intent restored and audited; worker stays stopped",
    );
    break;
  }
  case "restore-hardware": {
    stopped();
    const saved = await loadSnapshot();
    // Works for integer AND fractional percentages, without a Firebase request.
    await client.restoreBrightness(saved.hardware);
    await verifyHardware(saved, saved.hardware);
    console.log(
      "Exact ratio/ratioScale/nit/nitType restored and read back; worker stays stopped",
    );
    break;
  }
  default:
    throw new Error(
      "Use snapshot, prepare, command N, verify-command, restore-intent or restore-hardware",
    );
}
