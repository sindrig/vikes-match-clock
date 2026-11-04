#!/usr/bin/env node
/* Perimeter brightness gateway.
 *
 * Firebase is authoritative for manual/automatic brightness and the power-state
 * gate. The Admin SDK uses RTDB's WebSocket transport; periodically reopening
 * the listener bounds stalls and republishes the last brightness status.
 * Browser displays own media playback at every venue. This service only runs
 * the Vnnox brightness worker and the optional sun/weather scheduler.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { BrightnessController } from "./brightness.js";
import {
  AutoBrightnessScheduler,
  buildOpenMeteoUrl,
} from "./auto-brightness.js";
import { OpenMeteoCloudCover } from "./weather.js";

export const VALID_STATES = new Set(["on", "off"]);

const DEFAULT_DATABASE_URL =
  "https://vikes-match-clock-firebase.firebaseio.com";
const DEFAULT_FIREBASE_PATH = "states/vikuti/perimeter/state";
const DEFAULT_SERVICE_ACCOUNT_FILE =
  "/etc/perimeter-control/perimeter-service-account.json";
const DEFAULT_LISTENER_REFRESH_MS = 300_000;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

// Brightness (Vnnox) defaults. Vnnox brightness handling is OFF unless
// explicitly enabled with PERIMETER_BRIGHTNESS_ENABLED=true — absent
// commands and missing configuration must stay inert.
const DEFAULT_BRIGHTNESS_PATH = "states/vikuti/perimeter/brightness";
const DEFAULT_BRIGHTNESS_STATUS_PATH = "perimeter/vikuti/brightnessStatus";
const DEFAULT_VNNOX_BASE_URL = "http://localhost:81";
const DEFAULT_VNNOX_IP = "10.182.45.40";
const DEFAULT_VNNOX_PORT = "8088";
const DEFAULT_VNNOX_PROTOCOL = "http";
const DEFAULT_VNNOX_PROJECT_ID = "defaultProject-vx";
const DEFAULT_VNNOX_USERNAME = "admin";
const DEFAULT_VNNOX_PASSWORD_SOURCE = "env";
const DEFAULT_VNNOX_TIMEOUT_MS = 10_000;
const DEFAULT_BRIGHTNESS_MAX_RETRIES = 3;
const DEFAULT_BRIGHTNESS_VERIFY_ATTEMPTS = 6;
const DEFAULT_BRIGHTNESS_VERIFY_TOLERANCE = 1;
const DEFAULT_BRIGHTNESS_VERIFY_INTERVAL_MS = 1_000;

// Automatic brightness (sun + weather prediction) defaults. Auto writes go
// through the same Vnnox brightness worker, so the feature additionally
// requires PERIMETER_BRIGHTNESS_ENABLED=true. The location defaults to
// Fossvogur, Reykjavík — a ±1 km error is < 0.01° of sun elevation, which is
// irrelevant for brightness. Weather comes from Open-Meteo (no API key,
// free for non-commercial use — attribution required:
// "Weather data by Open-Meteo.com").
const DEFAULT_AUTO_BRIGHTNESS_PATH = "states/vikuti/perimeter/brightnessAuto";
const DEFAULT_BRIGHTNESS_CALIBRATION_PATH =
  "perimeter/vikuti/brightnessCalibration";
const DEFAULT_AUTO_LAT = 64.117;
const DEFAULT_AUTO_LNG = -21.91;
const DEFAULT_AUTO_TICK_MS = 60_000;
const DEFAULT_AUTO_WEATHER_POLL_MS = 15 * 60_000;
const DEFAULT_AUTO_MAX_SLEW = 15;
const DEFAULT_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_AUTO_TIMEZONE = "Atlantic/Reykjavik";
// Grace period for the process signal handler to await an in-flight
// brightness write's verify/restore before exiting (see `main()`).
const SHUTDOWN_GRACE_MS = 30_000;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// A finite number from an env var, falling back for absent/blank/garbage
// values (Number("") is 0, so blank strings must be excluded explicitly).
function finiteNumber(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveMs(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * 1000 : fallback;
}

function nonNegativeMs(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n * 1000 : fallback;
}

export function loadConfig(environ = process.env) {
  return {
    databaseURL:
      environ.PERIMETER_FIREBASE_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    path: environ.PERIMETER_FIREBASE_PATH ?? DEFAULT_FIREBASE_PATH,
    serviceAccountFile:
      environ.PERIMETER_SERVICE_ACCOUNT_FILE ?? DEFAULT_SERVICE_ACCOUNT_FILE,
    listenerRefreshMs: nonNegativeMs(
      environ.PERIMETER_LISTENER_REFRESH_SECONDS,
      DEFAULT_LISTENER_REFRESH_MS,
    ),
    initialBackoffMs: positiveMs(
      environ.PERIMETER_INITIAL_BACKOFF_SECONDS,
      DEFAULT_INITIAL_BACKOFF_MS,
    ),
    maxBackoffMs: positiveMs(
      environ.PERIMETER_MAX_BACKOFF_SECONDS,
      DEFAULT_MAX_BACKOFF_MS,
    ),
    // Brightness (Vnnox) settings. Enabled ONLY when explicitly set to
    // "true"; all other values keep brightness handling off.
    brightnessEnabled: environ.PERIMETER_BRIGHTNESS_ENABLED === "true",
    brightnessPath:
      environ.PERIMETER_BRIGHTNESS_PATH ?? DEFAULT_BRIGHTNESS_PATH,
    brightnessStatusPath:
      environ.PERIMETER_BRIGHTNESS_STATUS_PATH ??
      DEFAULT_BRIGHTNESS_STATUS_PATH,
    vnnoxBaseUrl: environ.PERIMETER_VNNOX_BASE_URL ?? DEFAULT_VNNOX_BASE_URL,
    vnnoxIp: environ.PERIMETER_VNNOX_IP ?? DEFAULT_VNNOX_IP,
    vnnoxPort: environ.PERIMETER_VNNOX_PORT ?? DEFAULT_VNNOX_PORT,
    vnnoxProtocol: environ.PERIMETER_VNNOX_PROTOCOL ?? DEFAULT_VNNOX_PROTOCOL,
    vnnoxSerial: environ.PERIMETER_VNNOX_SN ?? null,
    vnnoxProjectId:
      environ.PERIMETER_VNNOX_PROJECT_ID ?? DEFAULT_VNNOX_PROJECT_ID,
    vnnoxPerimeterGuid: environ.PERIMETER_VNNOX_PERIMETER_GUID ?? null,
    vnnoxUsername: environ.PERIMETER_VNNOX_USERNAME ?? DEFAULT_VNNOX_USERNAME,
    vnnoxPasswordSource:
      environ.PERIMETER_VNNOX_PASSWORD_SOURCE ?? DEFAULT_VNNOX_PASSWORD_SOURCE,
    vnnoxPassword: environ.PERIMETER_VNNOX_PASSWORD ?? null,
    vnnoxPasswordFile: environ.PERIMETER_VNNOX_PASSWORD_FILE ?? null,
    vnnoxTimeoutMs: positiveMs(
      environ.PERIMETER_VNNOX_TIMEOUT,
      DEFAULT_VNNOX_TIMEOUT_MS,
    ),
    brightnessMaxRetries: positiveInt(
      environ.PERIMETER_BRIGHTNESS_MAX_RETRIES,
      DEFAULT_BRIGHTNESS_MAX_RETRIES,
    ),
    brightnessVerifyAttempts: positiveInt(
      environ.PERIMETER_BRIGHTNESS_VERIFY_ATTEMPTS,
      DEFAULT_BRIGHTNESS_VERIFY_ATTEMPTS,
    ),
    brightnessVerifyTolerance: positiveInt(
      environ.PERIMETER_BRIGHTNESS_VERIFY_TOLERANCE,
      DEFAULT_BRIGHTNESS_VERIFY_TOLERANCE,
    ),
    brightnessVerifyIntervalMs: positiveMs(
      environ.PERIMETER_BRIGHTNESS_VERIFY_INTERVAL_SECONDS,
      DEFAULT_BRIGHTNESS_VERIFY_INTERVAL_MS,
    ),
    // Automatic brightness (sun + weather prediction) settings. The feature
    // flag works together with PERIMETER_BRIGHTNESS_ENABLED: without the
    // brightness worker there is nothing to dispatch auto writes through.
    autoBrightnessEnabled: environ.PERIMETER_AUTO_BRIGHTNESS_ENABLED === "true",
    autoBrightnessPath:
      environ.PERIMETER_AUTO_BRIGHTNESS_PATH ?? DEFAULT_AUTO_BRIGHTNESS_PATH,
    brightnessCalibrationPath:
      environ.PERIMETER_BRIGHTNESS_CALIBRATION_PATH ??
      DEFAULT_BRIGHTNESS_CALIBRATION_PATH,
    autoBrightnessLat: finiteNumber(environ.PERIMETER_LAT, DEFAULT_AUTO_LAT),
    autoBrightnessLng: finiteNumber(environ.PERIMETER_LNG, DEFAULT_AUTO_LNG),
    autoTickMs: positiveMs(
      environ.PERIMETER_AUTO_TICK_SECONDS,
      DEFAULT_AUTO_TICK_MS,
    ),
    autoWeatherPollMs: positiveMs(
      environ.PERIMETER_AUTO_WEATHER_POLL_SECONDS,
      DEFAULT_AUTO_WEATHER_POLL_MS,
    ),
    autoMaxSlew: positiveInt(
      environ.PERIMETER_AUTO_MAX_SLEW,
      DEFAULT_AUTO_MAX_SLEW,
    ),
    // Skip auto writes while the perimeter state is "off" (avoid pointless
    // hardware writes on a dark screen); recompute immediately on off → on.
    autoSkipWhenOff: environ.PERIMETER_AUTO_SKIP_WHEN_OFF !== "false",
    openMeteoUrl: environ.PERIMETER_OPEN_METEO_URL ?? DEFAULT_OPEN_METEO_URL,
    autoTimezone: (
      environ.PERIMETER_AUTO_TIMEZONE || DEFAULT_AUTO_TIMEZONE
    ).trim(),
  };
}
export class PerimeterController {
  constructor(config) {
    this.config = config;
    this._lastSeen = null;
    this._ref = null;
    this._refreshTimer = null;
    this._brightnessController = null;
    this._autoScheduler = null;
    if (config.brightnessEnabled) {
      this._brightnessController = new BrightnessController(config);
      if (config.autoBrightnessEnabled) {
        // Open-Meteo cloud cover feeds the empirical brightness model. The
        // fetcher caches its last good response on weather failures (worst
        // case for predictions: a conservative fixed cloud fraction).
        const weather = new OpenMeteoCloudCover({
          url: buildOpenMeteoUrl(
            config.openMeteoUrl,
            config.autoBrightnessLat,
            config.autoBrightnessLng,
            config.autoTimezone,
          ),
          pollMs: config.autoWeatherPollMs,
        });
        this._autoScheduler = new AutoBrightnessScheduler({
          controller: this._brightnessController,
          weather,
          lat: config.autoBrightnessLat,
          lng: config.autoBrightnessLng,
          tickMs: config.autoTickMs,
          maxSlew: config.autoMaxSlew,
          skipWhenOff: config.autoSkipWhenOff,
        });
        this._brightnessController.attachAutoScheduler(this._autoScheduler);
      }
    }
  }
  // The power state only gates automatic brightness. Manual commands retain
  // their existing semantics; browser displays handle media power/playback.
  onDesiredState(state) {
    if (typeof state !== "string" || !VALID_STATES.has(state)) {
      console.warn(
        `Ignoring invalid perimeter state: ${JSON.stringify(state)}`,
      );
      return;
    }
    if (state === this._lastSeen) return;
    this._lastSeen = state;
    console.log(`New desired perimeter state: ${state}`);
    this._brightnessController?.onPerimeterState(state);
  }

  _handleSnapshot = (snapshot) => {
    const data = snapshot.val();
    const state = data !== null && typeof data === "object" ? data.state : data;
    this.onDesiredState(state);
  };

  attach(db) {
    this._ref = db.ref(this.config.path);
    this._ref.on("value", this._handleSnapshot);
    console.log(`Listening on Firebase path: ${this.config.path}`);
    if (this._brightnessController) {
      this._brightnessController.attach(db);
    }
  }

  _reopenListener() {
    this._ref.off("value", this._handleSnapshot);
    this._ref.on("value", this._handleSnapshot);
    // Recover a lost terminal status without replaying a hardware write.
    if (this._brightnessController) {
      void this._brightnessController.republishStatus();
    }
    console.log("Refreshed Firebase listener");
  }

  startBrightness() {
    if (this._brightnessController) {
      this._brightnessController.startWorker();
    }
    if (this._autoScheduler) {
      // Starts the Open-Meteo poll loop and the prediction tick timer.
      this._autoScheduler.start();
    }
  }
  // -- refresh ----------------------------------------------------------------

  startRefreshLoop() {
    if (this.config.listenerRefreshMs <= 0) return;
    this._refreshTimer = setInterval(() => {
      try {
        this._reopenListener();
      } catch (err) {
        console.error(`Failed to refresh Firebase listener: ${err.message}`);
      }
    }, this.config.listenerRefreshMs);
  }
  // Let an in-flight irreversible write finish verification/restoration.
  // The process signal handler bounds this drain with SHUTDOWN_GRACE_MS.
  shutdown() {
    if (this._refreshTimer !== null) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._ref !== null) {
      this._ref.off("value", this._handleSnapshot);
    }
    if (this._brightnessController) {
      return Promise.resolve(this._brightnessController.shutdown());
    }
    return Promise.resolve();
  }
}

function main() {
  const config = loadConfig();
  if (!fs.existsSync(config.serviceAccountFile)) {
    console.error(
      `Firebase service account file not found: ${config.serviceAccountFile}`,
    );
    process.exit(1);
  }
  if (config.autoBrightnessEnabled && !config.brightnessEnabled) {
    console.warn(
      "PERIMETER_AUTO_BRIGHTNESS_ENABLED=true but PERIMETER_BRIGHTNESS_ENABLED " +
        "is not enabled; automatic brightness stays inert (auto writes are " +
        "dispatched through the brightness worker)",
    );
  }

  const app = initializeApp({
    credential: cert(config.serviceAccountFile),
    databaseURL: config.databaseURL,
  });

  const controller = new PerimeterController(config);
  controller.attach(getDatabase(app));
  controller.startBrightness();
  controller.startRefreshLoop();

  // Waits up to SHUTDOWN_GRACE_MS for graceful drain (letting an in-flight
  // brightness write verify or restore) before forcing the process to exit.
  // Idempotent: a second/third signal (e.g. an impatient double Ctrl-C) is a
  // no-op instead of re-entering shutdown or racing a second exit.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      console.log(`Received ${signal} again while shutting down; ignoring`);
      return;
    }
    shuttingDown = true;
    console.log(`Shutting down (${signal})`);
    const drained = Promise.resolve(controller.shutdown()).catch((err) => {
      console.error(`Error during shutdown: ${err.message}`);
    });
    const timeout = new Promise((resolve) => {
      setTimeout(resolve, SHUTDOWN_GRACE_MS);
    });
    Promise.race([drained, timeout]).then(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
