#!/usr/bin/env node
/* Perimeter Resolume control daemon.
 *
 * Listens for the perimeter state in Firebase Realtime Database via the
 * Firebase Admin SDK and mirrors it onto a Resolume Arena composition
 * through its HTTP API.
 *
 * Firebase is the desired-state authority. The daemon never writes back to
 * Firebase; it only reads the `state` child and applies it to Resolume.
 *
 * Design notes:
 *   * Only the exact string values "on" and "off" are valid desired states.
 *     Missing, null, malformed or unknown values cause no Resolume request.
 *   * Authentication uses a service-account credential file. The Admin SDK
 *     bypasses the public `states` read rules.
 *   * The JS Admin SDK uses the Realtime Database WebSocket protocol (the
 *     same transport the clock apps use), unlike the Python SDK's listen(),
 *     which is built on the REST SSE streaming endpoint. As a safety net the
 *     listener is still periodically closed and reopened (a "refresh") so
 *     the current state is re-delivered and any stall is bounded.
 *   * Unchanged state is never re-applied. The SDK also fires the callback
 *     when it reconnects, so the last-seen cache prevents spurious
 *     re-application.
 *   * Resolume failures retry indefinitely with bounded exponential backoff.
 *     A newer Firebase value supersedes any failed operation still awaiting
 *     retry, so stale requests are never applied after the state has moved on.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

export const VALID_STATES = new Set(["on", "off"]);

const DEFAULT_DATABASE_URL = "https://vikes-match-clock-firebase.firebaseio.com";
const DEFAULT_FIREBASE_PATH = "states/vikuti/perimeter/state";
const DEFAULT_SERVICE_ACCOUNT_FILE =
  "/etc/perimeter-control/perimeter-service-account.json";
const DEFAULT_RESOLUME_BASE_URL = "http://localhost:80/api/v1";
const DEFAULT_RESOLUME_COLUMN = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LISTENER_REFRESH_MS = 300_000;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

const RESOLUME_OFF_PATH = "/composition/disconnect-all";
const RESOLUME_ON_PATH = "/composition/columns/{column}/connect";

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
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
    resolumeBaseUrl:
      environ.PERIMETER_RESOLUME_BASE_URL ?? DEFAULT_RESOLUME_BASE_URL,
    resolumeColumn: positiveInt(
      environ.PERIMETER_RESOLUME_COLUMN,
      DEFAULT_RESOLUME_COLUMN,
    ),
    requestTimeoutMs: positiveMs(
      environ.PERIMETER_REQUEST_TIMEOUT,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
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
  };
}

export class ResolumeClient {
  constructor(config) {
    this.config = config;
  }

  async applyState(state) {
    const base = this.config.resolumeBaseUrl.replace(/\/+$/, "");
    let url;
    if (state === "on") {
      url = `${base}${RESOLUME_ON_PATH.replace(
        "{column}",
        this.config.resolumeColumn,
      )}`;
    } else if (state === "off") {
      url = `${base}${RESOLUME_OFF_PATH}`;
    } else {
      throw new Error(`unknown perimeter state: ${JSON.stringify(state)}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

class Notifier {
  #waiters = new Set();

  wait() {
    return new Promise((resolve) => this.#waiters.add(resolve));
  }

  notify() {
    for (const resolve of this.#waiters) resolve();
    this.#waiters.clear();
  }
}

export class PerimeterController {
  constructor(config) {
    this.config = config;
    this.resolume = new ResolumeClient(config);
    this._desired = null;
    this._lastSeen = null;
    this._stopping = false;
    this._notifier = new Notifier();
    this._ref = null;
    this._refreshTimer = null;
  }

  // -- state --------------------------------------------------------------

  _readDesired() {
    return this._desired;
  }

  onDesiredState(state) {
    if (typeof state !== "string" || !VALID_STATES.has(state)) {
      console.warn(`Ignoring invalid perimeter state: ${JSON.stringify(state)}`);
      return;
    }
    if (state === this._lastSeen) return;
    this._lastSeen = state;
    console.log(`New desired perimeter state: ${state}`);
    this._desired = state;
    this._notifier.notify();
  }

  // -- firebase ------------------------------------------------------------

  _handleSnapshot = (snapshot) => {
    const data = snapshot.val();
    const state = data !== null && typeof data === "object" ? data.state : data;
    this.onDesiredState(state);
  };

  attach(db) {
    this._ref = db.ref(this.config.path);
    this._ref.on("value", this._handleSnapshot);
    console.log(`Listening on Firebase path: ${this.config.path}`);
  }

  _reopenListener() {
    this._ref.off("value", this._handleSnapshot);
    this._ref.on("value", this._handleSnapshot);
    console.log("Refreshed Firebase listener");
  }

  // -- applicator -----------------------------------------------------------

  startApplicator() {
    this._applicatorPromise = this._applicatorLoop();
  }

  async _applicatorLoop() {
    while (!this._stopping) {
      if (this._desired !== null) {
        const target = this._desired;
        this._desired = null;
        await this._applyWithRetries(target);
        continue;
      }
      const wait = this._notifier.wait();
      if (this._desired !== null) continue;
      await wait;
    }
  }

  async _applyWithRetries(target) {
    let backoff = this.config.initialBackoffMs;
    while (!this._stopping) {
      if (this._desired !== null) {
        console.log(`Superseded by newer state before applying ${target}`);
        return;
      }
      try {
        await this.resolume.applyState(target);
        console.log(`Applied state ${target} to Resolume`);
        return;
      } catch (err) {
        console.error(
          `Failed to apply state ${target} to Resolume: ${err.message}`,
        );
        if (this._desired !== null) {
          console.log(`Superseded by newer state during retry of ${target}`);
          return;
        }
        await this._sleep(backoff);
        backoff = Math.min(backoff * 2, this.config.maxBackoffMs);
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  // -- shutdown -----------------------------------------------------------------

  shutdown() {
    this._stopping = true;
    if (this._refreshTimer !== null) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._ref !== null) {
      this._ref.off("value", this._handleSnapshot);
    }
    this._notifier.notify();
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

  const app = initializeApp({
    credential: cert(config.serviceAccountFile),
    databaseURL: config.databaseURL,
  });

  const controller = new PerimeterController(config);
  controller.attach(getDatabase(app));
  controller.startApplicator();
  controller.startRefreshLoop();

  const shutdown = () => {
    console.log("Shutting down");
    controller.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
