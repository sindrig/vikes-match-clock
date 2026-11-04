// Developer-only proof; pass an isolated, dependency-installed copy of the
// reviewed base's perimeter-control directory. Never pass an installed gateway.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as current from "../index.js";
import { SCENARIOS, runScenario } from "./helpers/retained-scenarios.js";

assert.equal(
  process.argv.length,
  3,
  "usage: node tests/compare-baseline.mjs /isolated/base/perimeter-control",
);
const baselineDir = path.resolve(process.argv[2]);
const currentDir = fileURLToPath(new URL("../", import.meta.url));
assert.notEqual(baselineDir, path.resolve(currentDir));
const baseline = await import(
  pathToFileURL(path.join(baselineDir, "index.js"))
);
assert.equal(
  baseline.loadConfig({ PERIMETER_RESOLUME_ENABLED: "false" }).resolumeEnabled,
  false,
);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const unchanged = [];
for (const file of [
  "brightness.js",
  "auto-brightness.js",
  "weather.js",
  "vnnox.js",
  ...["brightness", "auto-brightness", "weather", "vnnox"].map(
    (name) => `tests/${name}.test.js`,
  ),
]) {
  const bytes = fs.readFileSync(path.join(currentDir, file));
  assert.deepEqual(
    bytes,
    fs.readFileSync(path.join(baselineDir, file)),
    `${file} unchanged`,
  );
  unchanged.push({ file, sha256: hash(bytes) });
}
const configCases = [
  {},
  { PERIMETER_RESOLUME_ENABLED: "true" },
  { PERIMETER_RESOLUME_ENABLED: "false" },
  {
    PERIMETER_FIREBASE_PATH: "states/fixture/perimeter",
    PERIMETER_SERVICE_ACCOUNT_FILE: "/synthetic/account.json",
    PERIMETER_BRIGHTNESS_ENABLED: "true",
    PERIMETER_AUTO_BRIGHTNESS_ENABLED: "true",
    PERIMETER_BRIGHTNESS_PATH: "states/fixture/perimeter/brightness",
    PERIMETER_BRIGHTNESS_STATUS_PATH: "perimeter/fixture/brightnessStatus",
    PERIMETER_AUTO_BRIGHTNESS_PATH: "states/fixture/perimeter/brightnessAuto",
    PERIMETER_BRIGHTNESS_CALIBRATION_PATH:
      "perimeter/fixture/brightnessCalibration",
    PERIMETER_LAT: "63.1",
    PERIMETER_LNG: "-20.1",
    PERIMETER_LISTENER_REFRESH_SECONDS: "0",
    PERIMETER_AUTO_MAX_SLEW: "7",
    PERIMETER_AUTO_SKIP_WHEN_OFF: "false",
  },
  {
    PERIMETER_LAT: "",
    PERIMETER_LNG: "invalid",
    PERIMETER_LISTENER_REFRESH_SECONDS: "-1",
    PERIMETER_VNNOX_TIMEOUT: "0",
    PERIMETER_INITIAL_BACKOFF_SECONDS: "invalid",
  },
];
for (const env of configCases) {
  const old = baseline.loadConfig(env);
  for (const [key, value] of Object.entries(current.loadConfig(env)))
    assert.deepEqual(value, old[key], key);
}
// Real workers/models, controlled inputs, and no external transports. Suppress
// routine logs so the output contains only proof metadata, never configuration.
const original = { log: console.log, warn: console.warn, error: console.error };
const originalFetch = globalThis.fetch;
const scenarios = [];
try {
  for (const key of Object.keys(original)) console[key] = () => {};
  globalThis.fetch = () => {
    throw new Error("Unexpected network access");
  };
  for (const name of SCENARIOS) {
    const before = await runScenario(baseline, name);
    const after = await runScenario(current, name);
    assert.deepEqual(after, before, `${name} traces identical`);
    scenarios.push({
      name,
      firebaseEvents: after.firebase.length,
      deviceEvents: after.device.length,
      sha256: hash(JSON.stringify(after)),
    });
  }
} finally {
  Object.assign(console, original);
  globalThis.fetch = originalFetch;
}
console.log(
  JSON.stringify(
    {
      baselineEntrypointSha256: hash(
        fs.readFileSync(path.join(baselineDir, "index.js")),
      ),
      configCases: configCases.length,
      unchanged,
      scenarios,
    },
    null,
    2,
  ),
);
