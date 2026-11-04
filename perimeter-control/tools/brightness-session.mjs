// Reference commands for BRIGHTNESS_SMOKE_TEST.md; mock-verified, not field-qualified.
// Import only the device client: never start the daemon or load an Admin credential.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { normalizeBrightness, VnnoxClient } from "../vnnox.js";

// Only diagnostics created here may reach stderr. The final boundary never
// inspects an unknown error's message, cause, stack or assertion values.
const diagnostics = new WeakMap();
let context = "setup";

function fail(message) {
  const error = new Error();
  diagnostics.set(error, message);
  throw error;
}

function validate(condition, message) {
  if (!condition) fail(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function required(name) {
  const value = process.env[name];
  if (!value || value.includes("REPLACE_WITH_")) {
    fail(`Set ${name} explicitly for the authorized environment`);
  }
  return value;
}

function key(name) {
  const value = required(name);
  validate(!/[.#$\[\]/\s]/u.test(value), `Invalid ${name}`);
  return value;
}

async function main() {
  const database = new URL(required("FIREBASE_DATABASE_URL"));
  validate(
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
  validate(
    path.isAbsolute(directory),
    "BRIGHTNESS_SESSION_DIR must be absolute",
  );
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
  validate(
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
    validate(
      process.env.BRIGHTNESS_WORKER_STOPPED === "true",
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
      fail("Firebase REST transport failed; no automatic retry");
    }
    // Do not interpolate even HTTP metadata until its primitive type is checked.
    const status = response.status;
    validate(
      Number.isInteger(status) && status >= 100 && status <= 599,
      "Firebase REST returned an invalid HTTP status; no automatic retry",
    );
    validate(
      response.ok === true,
      `Firebase REST denied/failed (HTTP ${status})`,
    );
    try {
      return await response.json();
    } catch {
      // A response body or stream error can also reflect the authenticated URL.
      fail(
        `Firebase REST response body unreadable or invalid JSON (HTTP ${status}); no automatic retry`,
      );
    }
  }

  async function intent() {
    const state = await firebase(`states/${location}/perimeter`);
    validate(
      state === null || isRecord(state),
      "Firebase perimeter state must be an object or null",
    );
    const value = {
      brightness: state?.brightness ?? null,
      brightnessAuto: state?.brightnessAuto ?? null,
    };
    validateIntent(value);
    return value;
  }

  function validateIntent(value) {
    validate(
      isRecord(value) &&
        Object.hasOwn(value, "brightness") &&
        Object.hasOwn(value, "brightnessAuto") &&
        (value.brightness === null ||
          (Number.isInteger(value.brightness) &&
            value.brightness >= 0 &&
            value.brightness <= 100)) &&
        (value.brightnessAuto === null ||
          (isRecord(value.brightnessAuto) &&
            typeof value.brightnessAuto.enabled === "boolean")),
      "Firebase intent or saved intent has an invalid brightness/auto shape",
    );
  }

  async function readStatus() {
    const status = await firebase(`perimeter/${location}/brightnessStatus`);
    validate(
      status === null ||
        (isRecord(status) &&
          ["pending", "applied", "failed", "shadow"].includes(status.phase) &&
          Number.isFinite(status.updatedAt)),
      "Firebase brightness status has an invalid shape",
    );
    return status;
  }

  async function readSaved(file, label) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      fail(`${label} file unreadable or invalid JSON; no automatic retry`);
    }
  }

  async function loadSnapshot() {
    const saved = await readSaved(snapshotFile, "Snapshot");
    validate(isRecord(saved), "Snapshot file has an invalid shape");
    validate(
      isDeepStrictEqual(saved.scope, scope),
      "Snapshot environment/device scope differs",
    );
    return saved;
  }

  function validateSavedIntent(saved) {
    validateIntent(saved.intent);
    validate(
      typeof saved.sessionId === "string" && saved.sessionId.length > 0,
      "Snapshot file has an invalid session shape",
    );
  }

  function validateSavedHardware(saved) {
    validate(
      isRecord(saved.hardware) &&
        ["ratio", "ratioScale", "nit", "nitType"].every((field) =>
          Number.isFinite(saved.hardware[field]),
        ) &&
        saved.hardware.ratioScale > 0 &&
        Array.isArray(saved.otherScreens),
      "Snapshot file has an invalid hardware shape",
    );
  }

  async function save(file, data, flag = "w") {
    try {
      await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, {
        flag,
        mode: 0o600,
      });
    } catch (error) {
      // Select a fixed diagnostic; never print or coerce the filesystem code.
      if (flag === "wx" && error?.code === "EEXIST")
        fail("Snapshot file already exists (EEXIST); never overwritten");
      fail("Session file could not be saved; no automatic retry");
    }
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
    validate(
      Number.isFinite(recorded?.timestamp),
      "Audit readback missing timestamp",
    );
    validate(
      isDeepStrictEqual(recorded, { ...audit, timestamp: recorded.timestamp }),
      "Audit exact readback differs; no automatic retry",
    );
    return recorded;
  }

  function raw(brightness) {
    const { ratio, ratioScale, nit, nitType } = brightness;
    return { ratio, ratioScale, nit, nitType };
  }

  async function deviceOperation(operation, perform) {
    try {
      return await perform();
    } catch {
      // Context is a fixed label from this helper, never input or response data.
      // Client errors (including native header validation and decode failures)
      // can contain credentials. Do not forward their message, body or cause.
      fail(`Vnnox ${operation} failed; no automatic retry`);
    }
  }

  async function readHardware() {
    const screens = await deviceOperation("screen read/login", () =>
      client.readScreens(),
    );
    const target = screens.find((s) => s.guid === device.vnnoxPerimeterGuid);
    validate(target !== undefined, "Vnnox perimeter screen GUID not found");
    for (const field of ["nit", "nitType"]) {
      const value = target.brightness?.[field];
      validate(
        value === undefined || Number.isFinite(value),
        `Cannot preserve nonnumeric ${field}; stop before changing brightness`,
      );
    }
    return {
      hardware: await deviceOperation("target brightness validation", () =>
        raw(normalizeBrightness(target.brightness)),
      ),
      otherScreens: screens.filter((s) => s.guid !== device.vnnoxPerimeterGuid),
    };
  }

  async function verifyHardware(saved, expected) {
    const actual = await readHardware();
    // Boolean assertions preserve exact equality without printing response data
    // (screen metadata can reflect a credential even when JSON decoding succeeds).
    validate(
      isDeepStrictEqual(actual.hardware, expected),
      "Vnnox exact target brightness readback differs; no automatic retry",
    );
    validate(
      isDeepStrictEqual(actual.otherScreens, saved.otherScreens),
      "Non-target screens changed; no automatic retry",
    );
  }

  const [action, argument] = process.argv.slice(2);
  // The context is selected from fixed literals, never echoed from argv.
  context =
    new Map([
      ["snapshot", "snapshot"],
      ["prepare", "prepare"],
      ["command", "command"],
      ["verify-command", "verify-command"],
      ["restore-intent", "restore-intent"],
      ["restore-hardware", "restore-hardware"],
    ]).get(action) ?? "command selection";
  switch (action) {
    case "snapshot": {
      stopped();
      validate(
        (await firebase(`auth/${key("FIREBASE_UID")}/${location}`)) === true,
        "Operator needs auth/{uid}/{location} == true",
      );
      const saved = {
        scope,
        sessionId: randomUUID(),
        intent: await intent(),
        // Observational only: never restore daemon-owned telemetry.
        status: await readStatus(),
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
      validateSavedIntent(saved);
      validate(
        isDeepStrictEqual(await intent(), saved.intent),
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
      validate(
        prepared.brightness === null,
        "Prepared manual brightness readback differs",
      );
      if (brightnessAuto === null)
        validate(
          prepared.brightnessAuto === null,
          "Prepared auto deletion readback differs",
        );
      else {
        validate(
          Number.isFinite(prepared.brightnessAuto?.updatedAt),
          "Prepared auto readback missing timestamp",
        );
        validate(
          isDeepStrictEqual(prepared.brightnessAuto, {
            ...brightnessAuto,
            updatedAt: prepared.brightnessAuto.updatedAt,
          }),
          "Prepared auto exact readback differs",
        );
      }
      console.log(
        "Prepared: no retained command, auto disabled; worker stays stopped",
      );
      break;
    }
    case "command": {
      validate(
        process.env.BRIGHTNESS_WORKER_STOPPED === "false",
        "Worker must be running",
      );
      validate(
        /^\d+$/u.test(argument ?? ""),
        "Command must be an integer 0–100",
      );
      const percent = Number(argument);
      validate(percent <= 100, "Command must be an integer 0–100");
      const saved = await loadSnapshot();
      validateSavedIntent(saved);
      const current = await intent();
      validate(
        current.brightnessAuto?.enabled !== true,
        "Prepare manual mode first",
      );
      validate(
        current.brightness !== percent,
        "Use a different command to generate a value event",
      );
      const recorded = await audited(
        saved,
        { brightness: percent },
        "perimeter.brightness-smoke.command",
      );
      await save(commandFile, { percent, timestamp: recorded.timestamp });
      validate(
        (await intent()).brightness === percent,
        "Command intent readback differs",
      );
      console.log(
        "Command accepted by Firebase; hardware verification still required",
      );
      break;
    }
    case "verify-command": {
      const saved = await loadSnapshot();
      validateSavedHardware(saved);
      const command = await readSaved(commandFile, "Command");
      validate(
        isRecord(command) &&
          Number.isInteger(command.percent) &&
          command.percent >= 0 &&
          command.percent <= 100 &&
          Number.isFinite(command.timestamp),
        "Command file has an invalid percent/timestamp shape",
      );
      const status = await readStatus();
      validate(status?.phase === "applied", "Status phase is not applied");
      validate(
        status.requestedPercent === command.percent,
        "Status requested percent differs",
      );
      validate(
        status.appliedPercent === command.percent,
        "Status applied percent differs",
      );
      validate(
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
      validateSavedIntent(saved);
      await audited(saved, saved.intent, "perimeter.brightness-smoke.restore");
      validate(
        isDeepStrictEqual(await intent(), saved.intent),
        "Restored intent exact readback differs",
      );
      console.log(
        "Saved Firebase intent restored and audited; worker stays stopped",
      );
      break;
    }
    case "restore-hardware": {
      stopped();
      const saved = await loadSnapshot();
      validateSavedHardware(saved);
      // Works for integer AND fractional percentages, without a Firebase request.
      await deviceOperation("exact hardware restore write/login", () =>
        client.restoreBrightness(saved.hardware),
      );
      await verifyHardware(saved, saved.hardware);
      console.log(
        "Exact ratio/ratioScale/nit/nitType restored and read back; worker stays stopped",
      );
      break;
    }
    default:
      fail(
        "Use snapshot, prepare, command N, verify-command, restore-intent or restore-hardware",
      );
  }
}

try {
  await main();
} catch (error) {
  // Flush the one safe line before exiting, even if a failed client call left
  // a timer/handle alive. No operation or retry may continue after failure.
  process.stderr.write(
    `Brightness session ${context}: ${diagnostics.get(error) ?? "Unexpected local or response error; no automatic retry"}\n`,
    () => process.exit(1),
  );
}
