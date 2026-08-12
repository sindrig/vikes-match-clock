#!/usr/bin/env node
/* Perimeter Resolume control daemon.
 *
 * Listens for the perimeter state in Firebase Realtime Database via the
 * Firebase Admin SDK and mirrors it onto a Resolume Arena composition
 * through its HTTP API.
 *
 * Firebase is the desired-state authority. The daemon reads the `state` child
 * and applies it to Resolume, and writes the Resolume composition preview
 * snapshot to `perimeter/{location}` (outside the writable `states/` subtree)
 * through the Admin SDK, which bypasses the public read rules.
 *
 * Design notes:
 *   * Only the exact string values "on" and "off" are valid desired states.
 *     Missing, null, malformed or unknown values cause no Resolume request.
 *   * Authentication uses a service-account credential file. The Admin SDK
 *     bypasses the public `states` read rules.
 *   * The preview snapshot (columns, clips, bounded JPEG thumbnails) is read
 *     from Resolume on startup and after each successful `on`. A failed
 *     Resolume query leaves the last published snapshot intact.
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
import { getDatabase, ServerValue } from "firebase-admin/database";
import { ResolumeCompositionReader } from "./resolume-preview.js";
import { OverlayController } from "./overlay.js";
import { AdLayoutController } from "./ad-layout.js";
import { ResolumeImportController } from "./resolume-import.js";

export const VALID_STATES = new Set(["on", "off"]);

const DEFAULT_DATABASE_URL =
  "https://vikes-match-clock-firebase.firebaseio.com";
const DEFAULT_FIREBASE_PATH = "states/vikuti/perimeter/state";
const DEFAULT_SERVICE_ACCOUNT_FILE =
  "/etc/perimeter-control/perimeter-service-account.json";
const DEFAULT_RESOLUME_BASE_URL = "http://localhost:80/api/v1";
const DEFAULT_RESOLUME_COLUMN = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LISTENER_REFRESH_MS = 300_000;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_PREVIEW_PATH = "perimeter/vikuti";
const DEFAULT_THUMBNAIL_MAX_DIM = 320;
const DEFAULT_THUMBNAIL_QUALITY = 0.7;
const DEFAULT_THUMBNAIL_MAX_BYTES = 100_000;
const DEFAULT_PREVIEW_MAX_BYTES = 8_000_000;

// Overlay defaults
const DEFAULT_OVERLAY_BASE_PATH = "states/vikuti/perimeter/overlay";
const DEFAULT_OVERLAY_STATUS_PATH = "perimeter/vikuti/overlayStatus";
const DEFAULT_OVERLAY_SSH_HOST = "10.182.45.53";
const DEFAULT_OVERLAY_SSH_USER = "user";
const DEFAULT_OVERLAY_SSH_KEY = "/etc/perimeter-control/overlay-ssh-key";
const DEFAULT_OVERLAY_REMOTE_CONTENT_DIR = "C:/Content";
const DEFAULT_OVERLAY_CACHE_DIR = "/var/cache/perimeter-control";
const DEFAULT_OVERLAY_LAYER_CLIP_COLUMNS = '{"2":1,"4":1}';

// Ad-layout defaults. The ad lanes are the base content layers (1-based layer
// indices) that the deck autopilot cycles; the goal overlay uses the separate
// overlay layers (default 2,4). The daemon derives the deck column range from
// the live composition and loads each layout column into a contiguous range of
// deck columns (see mapLayoutToDeckColumns).
const DEFAULT_AD_LAYOUT_PATH = "states/vikuti/perimeter/adLayout";
const DEFAULT_AD_LAYOUT_STATUS_PATH = "perimeter/vikuti/adLayout";
const DEFAULT_AD_LANE_IDS = "1,3";
const DEFAULT_AD_LAYOUT_BUCKET = "vikes-match-clock-firebase.appspot.com";
const DEFAULT_AD_MAX_FILE_BYTES = 250 * 1024 * 1024;

// Import defaults
const DEFAULT_IMPORT_PATH = "states/vikuti/perimeter/import";
const DEFAULT_IMPORT_STATUS_PATH = "perimeter/vikuti/importStatus";

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

function quality(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.1, n)) : fallback;
}

// Reject configurations where the goal overlay and ad-layout controllers
// would drive the same Resolume layer. The ad-layout controller loads clips
// into every deck column of its lanes, so any overlap with the overlay layer
// IDs would let one controller replace or clear the other's clips despite the
// documented layer-isolation guarantee.
function assertNoSlotConflicts(config) {
  if (!config.overlayEnabled || !config.adLayoutEnabled) return;
  const overlayLayers = new Set(config.overlayLayerIds);
  const conflicts = config.adLaneIds.filter((id) => overlayLayers.has(id));
  if (conflicts.length > 0) {
    throw new Error(
      "Overlapping Resolume layer configuration: the ad-layout and " +
        `goal-overlay controllers both drive layers ${conflicts.join(", ")}. ` +
        "Configure disjoint PERIMETER_AD_LANE_IDS and " +
        "PERIMETER_OVERLAY_LAYER_IDS.",
    );
  }
}

function parseLayerMap(envValue, fallback) {
  const raw = envValue ?? fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const map = {};
      for (const [key, val] of Object.entries(parsed)) {
        const n = Number(val);
        if (Number.isInteger(n) && n > 0) {
          map[String(key)] = n;
        }
      }
      if (Object.keys(map).length > 0) return map;
    }
  } catch {
    // fall through
  }
  try {
    const fallbackParsed = JSON.parse(fallback);
    return fallbackParsed && typeof fallbackParsed === "object"
      ? fallbackParsed
      : {};
  } catch {
    return {};
  }
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
    previewEnabled: environ.PERIMETER_PREVIEW_ENABLED !== "false",
    previewPath: environ.PERIMETER_PREVIEW_PATH ?? DEFAULT_PREVIEW_PATH,
    thumbnailMaxDim: positiveInt(
      environ.PERIMETER_THUMBNAIL_MAX_DIM,
      DEFAULT_THUMBNAIL_MAX_DIM,
    ),
    thumbnailQuality: quality(
      environ.PERIMETER_THUMBNAIL_QUALITY,
      DEFAULT_THUMBNAIL_QUALITY,
    ),
    thumbnailMaxBytes: positiveInt(
      environ.PERIMETER_THUMBNAIL_MAX_BYTES,
      DEFAULT_THUMBNAIL_MAX_BYTES,
    ),
    previewMaxBytes: positiveInt(
      environ.PERIMETER_PREVIEW_MAX_BYTES,
      DEFAULT_PREVIEW_MAX_BYTES,
    ),
    // Overlay settings
    overlayEnabled: environ.PERIMETER_OVERLAY_ENABLED !== "false",
    overlayPath: environ.PERIMETER_OVERLAY_PATH ?? DEFAULT_OVERLAY_BASE_PATH,
    overlayStatusPath:
      environ.PERIMETER_OVERLAY_STATUS_PATH ?? DEFAULT_OVERLAY_STATUS_PATH,
    overlayProjectId:
      environ.PERIMETER_OVERLAY_GCP_PROJECT ?? "vikes-match-clock-firebase",
    overlayCacheDir:
      environ.PERIMETER_OVERLAY_CACHE_DIR ?? DEFAULT_OVERLAY_CACHE_DIR,
    overlaySshHost:
      environ.PERIMETER_OVERLAY_SSH_HOST ?? DEFAULT_OVERLAY_SSH_HOST,
    overlaySshUser:
      environ.PERIMETER_OVERLAY_SSH_USER ?? DEFAULT_OVERLAY_SSH_USER,
    overlaySshKey: environ.PERIMETER_OVERLAY_SSH_KEY ?? DEFAULT_OVERLAY_SSH_KEY,
    overlayRemoteContentDir:
      environ.PERIMETER_OVERLAY_REMOTE_CONTENT_DIR ??
      DEFAULT_OVERLAY_REMOTE_CONTENT_DIR,
    // Reference clip slot per overlay layer. The daemon loads the overlay
    // file into the currently-active deck column (and pauses the deck
    // autopilot for the overlay), so this value is the fallback slot used
    // only when the live composition cannot be read.
    overlayLayerClipColumns: parseLayerMap(
      environ.PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS,
      DEFAULT_OVERLAY_LAYER_CLIP_COLUMNS,
    ),
    overlayLayerIds: (environ.PERIMETER_OVERLAY_LAYER_IDS ?? "2,4")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Ad-layout settings. The deck column range is derived from the live
    // composition at runtime; only the lane IDs are configured.
    adLayoutEnabled: environ.PERIMETER_AD_LAYOUT_ENABLED !== "false",
    adLayoutPath: environ.PERIMETER_AD_LAYOUT_PATH ?? DEFAULT_AD_LAYOUT_PATH,
    adLayoutStatusPath:
      environ.PERIMETER_AD_LAYOUT_STATUS_PATH ?? DEFAULT_AD_LAYOUT_STATUS_PATH,
    adLaneIds: (environ.PERIMETER_AD_LANE_IDS ?? DEFAULT_AD_LANE_IDS)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    adLayoutBucket:
      environ.PERIMETER_AD_LAYOUT_BUCKET ?? DEFAULT_AD_LAYOUT_BUCKET,
    adMaxFileBytes: positiveInt(
      environ.PERIMETER_AD_MAX_FILE_BYTES,
      DEFAULT_AD_MAX_FILE_BYTES,
    ),
    // Import settings
    importEnabled: environ.PERIMETER_IMPORT_ENABLED !== "false",
    importPath: environ.PERIMETER_IMPORT_PATH ?? DEFAULT_IMPORT_PATH,
    importStatusPath:
      environ.PERIMETER_IMPORT_STATUS_PATH ?? DEFAULT_IMPORT_STATUS_PATH,
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
    assertNoSlotConflicts(config);
    this.config = config;
    this.resolume = new ResolumeClient(config);
    this.previewReader = new ResolumeCompositionReader(config);
    this._desired = null;
    this._lastSeen = null;
    this._stopping = false;
    this._notifier = new Notifier();
    this._ref = null;
    this._previewRef = null;
    this._refreshTimer = null;
    this._overlayController = null;
    if (config.overlayEnabled) {
      this._overlayController = new OverlayController(config);
    }
    this._adLayoutController = null;
    if (config.adLayoutEnabled) {
      this._adLayoutController = new AdLayoutController(
        config,
        config.adLaneIds,
      );
    }
    this._importController = null;
    if (config.importEnabled) {
      this._importController = new ResolumeImportController(config);
    }
  }

  // -- state --------------------------------------------------------------

  _readDesired() {
    return this._desired;
  }

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
    this._previewRef = db.ref(this.config.previewPath);
    console.log(`Listening on Firebase path: ${this.config.path}`);
    console.log(
      `Publishing preview to Firebase path: ${this.config.previewPath}`,
    );
    if (this._overlayController) {
      this._overlayController.attach(db);
      console.log(`Overlay control listening on: ${this.config.overlayPath}`);
    }
    if (this._adLayoutController) {
      this._adLayoutController.attach(db);
      console.log(
        `Ad-layout control listening on: ${this.config.adLayoutPath}`,
      );
    }
    if (this._importController) {
      this._importController.attach(db);
      console.log(`Import control listening on: ${this.config.importPath}`);
    }
  }

  _reopenListener() {
    this._ref.off("value", this._handleSnapshot);
    this._ref.on("value", this._handleSnapshot);
    // Re-publish the ad-layout status as a safety net: the status is otherwise
    // only written when the desired document changes, so a write lost right
    // after a daemon restart (with a null desired doc) would never self-heal
    // without this refresh-driven re-publish.
    if (this._adLayoutController) {
      void this._adLayoutController.republishStatus();
    }
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
        if (target === "on") {
          // Non-blocking: a preview refresh must never delay or change the
          // on/off command retry behavior.
          void this.refreshPreview();
        }
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

  // -- preview ----------------------------------------------------------------

  // Build the normalized snapshot for the preview path. `updatedAt` uses the
  // Firebase server timestamp so all browsers see a consistent value.
  async _buildPreviewSnapshot() {
    const { columns } = await this.previewReader.collectPreview();
    const snapshot = { updatedAt: ServerValue.TIMESTAMP, columns };
    const payloadBytes = Buffer.byteLength(
      JSON.stringify({ updatedAt: 0, columns }),
      "utf8",
    );
    if (payloadBytes > this.config.previewMaxBytes) {
      throw new Error(
        `perimeter preview payload ${payloadBytes} bytes exceeds the ` +
          `${this.config.previewMaxBytes} byte limit`,
      );
    }
    return snapshot;
  }

  // Re-read the Resolume composition and publish the normalized snapshot to
  // the preview path. Any failure is logged and the last published snapshot
  // is left intact; this method never throws. Concurrent refreshes are
  // serialized so an older collection can never overwrite a newer snapshot.
  async refreshPreview() {
    if (!this.config.previewEnabled) return;
    const previous = this._refreshPromise;
    const run = previous
      ? previous.then(() => this._doRefreshPreview())
      : this._doRefreshPreview();
    this._refreshPromise = run;
    try {
      await run;
    } finally {
      if (this._refreshPromise === run) this._refreshPromise = null;
    }
  }

  async _doRefreshPreview() {
    try {
      const snapshot = await this._buildPreviewSnapshot();
      // `update` (not `set`): the preview path is the parent of the ad-layout
      // applied status (`perimeter/{location}/adLayout`) and the overlay
      // status (`.../overlayStatus`). A `set` here replaces the whole subtree
      // and would silently delete those sibling status documents on every
      // startup and after every `on`, hiding them from the controller UI.
      await this._previewRef.update(snapshot);
      console.log("Published perimeter preview snapshot");
    } catch (err) {
      console.error(
        `Failed to refresh perimeter preview (keeping last snapshot): ${err.message}`,
      );
    }
  }

  // Publish the snapshot once at startup, without blocking the daemon.
  startPreview() {
    void this.refreshPreview();
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
    if (this._overlayController) {
      this._overlayController.shutdown();
    }
    if (this._adLayoutController) {
      this._adLayoutController.shutdown();
    }
    if (this._importController) {
      this._importController.shutdown();
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
  controller.startPreview();

  const shutdown = () => {
    console.log("Shutting down");
    controller.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
