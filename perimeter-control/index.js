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
import { buildOverlayGeometry } from "./geometry.js";
import { OverlayController } from "./overlay.js";
import { AdLayoutController } from "./ad-layout.js";
import { ResolumeImportController } from "./resolume-import.js";
import { BrightnessController } from "./brightness.js";

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
// Daemon-owned overlay target geometry (read-only for clients). The
// preparation function reads the published targets to render media that
// matches the configured Resolume layout.
const DEFAULT_OVERLAY_GEOMETRY_PATH = "perimeter/vikuti/overlayGeometry";
const DEFAULT_OVERLAY_SSH_HOST = "10.182.45.53";
const DEFAULT_OVERLAY_SSH_USER = "user";
const DEFAULT_OVERLAY_SSH_KEY = "/etc/perimeter-control/overlay-ssh-key";
const DEFAULT_OVERLAY_REMOTE_CONTENT_DIR = "C:/Content";
const DEFAULT_OVERLAY_CACHE_DIR = "/var/cache/perimeter-control";
const DEFAULT_OVERLAY_LAYER_CLIP_COLUMNS = '{"2":1,"4":1}';
// Named media-pair target folder per overlay layer. Layer "2" is the
// 48-screen overlay and layer "4" is the 40-screen overlay, so pair files for
// each layer must live under `perimeter-overlays/{pairId}/48/` and `/40/`
// respectively. The daemon rejects a pair file whose folder does not match its
// layer's configured target.
const DEFAULT_OVERLAY_LAYER_TARGET_FOLDERS = '{"2":"48","4":"40"}';
// Crossfade used when one overlay is swapped for another while playing. The
// daemon double-buffers the swap (loads the new overlay into a standby deck
// column while the old one keeps playing, then connects it and clears the old
// slot), so setting a clip transition here makes the cutover crossfade instead
// of a hard cut. "0" disables the crossfade (still a seamless double-buffered
// swap, just an instant cut).
const DEFAULT_OVERLAY_TRANSITION_SECONDS = "0.5";
const DEFAULT_OVERLAY_TRANSITION_BLEND = "Dissolve";

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
// Grace period for the process signal handler to await an in-flight
// brightness write's verify/restore before exiting (see `main()`).
const SHUTDOWN_GRACE_MS = 30_000;

const RESOLUME_OFF_PATH = "/composition/disconnect-all";
const RESOLUME_ON_PATH = "/composition/columns/{column}/connect";

// The composition transport state the off action asserts after disconnecting
// all clips, so Resolume's universal autopilot stops playing. Confirmed against
// Arena 7.26.2 (play_state options: Play, Pause, Stop).
const RESOLUME_TRANSPORT_STOP_VALUE = "Stop";

// The deck autopilot value the base content relies on to cycle its columns
// (and with them the ads the ad-layout controller deploys). The "on" state
// asserts this value, overriding any stale leftover, so the deck can never
// stay stuck on a single ad. Defaults to the Víkin deck's autopilot.
const DEFAULT_DECK_AUTOPILOT = "Play Next Column";

// The deck autopilot column duration. The Víkin deck used "Longest Clip",
// which makes still-image ad columns advance after Resolume's 1s default for
// stills while video columns play their full length. "Seconds" + 20 keeps
// every column — images included — on screen for a uniform 20s.
const DEFAULT_DECK_AUTOPILOT_DURATION = "Seconds";
const DEFAULT_DECK_AUTOPILOT_SECONDS = 20;

// Resolume clip "Video → Resize" mode applied to every overlay and ad clip
// the daemon opens, so sources fill their layer's native canvas edge-to-edge
// regardless of their own dimensions or aspect ratio (a wrong-size file can
// otherwise leave side gaps on the LED strip).
const DEFAULT_CLIP_FIT = "Stretch";

// Native content canvas ("WxH") per layer, applied together with
// PERIMETER_CLIP_FIT. A non-Original resize mode makes this Resolume version
// pin a clip's canvas to the layer output size (4608x192 for every layer
// here), which would stretch the 40-screen content (native 3840x192) beyond
// the LED strip; pinning the clip canvas back to the native size keeps the
// fill on the correct region. For the Víkin composition: layers 1 (48 skjáir
// base) and 2 (48 overlay) are 4608x192; layers 3 (40 skjáir base) and 4 (40
// overlay) are 3840x192.
const DEFAULT_CLIP_CANVASES =
  '{"1":"4608x192","2":"4608x192","3":"3840x192","4":"3840x192"}';

// Legacy freeze record written by an earlier daemon build that paused the
// autopilot for the ad-layout; nothing reads it today, so the "on" self-heal
// removes it when it restores the autopilot.
const LEGACY_AUTOPILOT_FREEZE_FILE = "autopilot-freeze.json";

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

// Parse a JSON object whose values are non-empty strings (e.g. overlay layer
// target folders), merging the validated entries over the provided default so
// keys the override omits keep their default enforcement. A partial override
// such as {"2":"48"} must not silently drop the target folder for layer "4":
// validateGcsSource skips its folder check when a layer has no target folder.
function parseStringMap(envValue, fallback) {
  let defaults = {};
  try {
    const fallbackParsed = JSON.parse(fallback);
    if (
      fallbackParsed &&
      typeof fallbackParsed === "object" &&
      !Array.isArray(fallbackParsed)
    ) {
      defaults = fallbackParsed;
    }
  } catch {
    // ignore a malformed fallback
  }
  const raw = envValue ?? fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const map = { ...defaults };
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === "string" && val.length > 0) {
          map[String(key)] = val;
        }
      }
      return map;
    }
  } catch {
    // fall through
  }
  return defaults;
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
    overlayGeometryPath:
      environ.PERIMETER_OVERLAY_GEOMETRY_PATH ?? DEFAULT_OVERLAY_GEOMETRY_PATH,
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
    overlayLayerTargetFolders: parseStringMap(
      environ.PERIMETER_OVERLAY_LAYER_TARGET_FOLDERS,
      DEFAULT_OVERLAY_LAYER_TARGET_FOLDERS,
    ),
    // "Video → Resize" fit mode applied to every overlay and ad clip the
    // daemon opens (Stretch by default so off-aspect sources still fill
    // their layer's native canvas edge-to-edge).
    clipFit: (environ.PERIMETER_CLIP_FIT || DEFAULT_CLIP_FIT).trim(),
    // Native content canvas per layer ("WxH") applied together with clipFit
    // so the stretch fills the correct region (see DEFAULT_CLIP_CANVASES).
    clipCanvases: parseStringMap(
      environ.PERIMETER_CLIP_CANVASES,
      DEFAULT_CLIP_CANVASES,
    ),
    // Crossfade applied when one overlay is swapped for another while playing.
    // 0 disables it (still a seamless double-buffered swap, just a hard cut).
    overlayTransitionMs: nonNegativeMs(
      environ.PERIMETER_OVERLAY_TRANSITION_SECONDS,
      Number(DEFAULT_OVERLAY_TRANSITION_SECONDS) * 1000,
    ),
    overlayTransitionBlend: (
      environ.PERIMETER_OVERLAY_TRANSITION_BLEND ||
      DEFAULT_OVERLAY_TRANSITION_BLEND
    ).trim(),
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
    deckAutopilot: (
      environ.PERIMETER_DECK_AUTOPILOT || DEFAULT_DECK_AUTOPILOT
    ).trim(),
    deckAutopilotDuration: (
      environ.PERIMETER_DECK_AUTOPILOT_DURATION ||
      DEFAULT_DECK_AUTOPILOT_DURATION
    ).trim(),
    deckAutopilotSeconds: positiveInt(
      environ.PERIMETER_DECK_AUTOPILOT_SECONDS,
      DEFAULT_DECK_AUTOPILOT_SECONDS,
    ),
    // Import settings
    importEnabled: environ.PERIMETER_IMPORT_ENABLED !== "false",
    importPath: environ.PERIMETER_IMPORT_PATH ?? DEFAULT_IMPORT_PATH,
    importStatusPath:
      environ.PERIMETER_IMPORT_STATUS_PATH ?? DEFAULT_IMPORT_STATUS_PATH,
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
  };
}

export class ResolumeClient {
  constructor(config) {
    this.config = config;
  }

  async applyState(state) {
    const base = this.config.resolumeBaseUrl.replace(/\/+$/, "");
    if (state === "on") {
      await this._request(
        `${base}${RESOLUME_ON_PATH.replace(
          "{column}",
          this.config.resolumeColumn,
        )}`,
        { method: "POST" },
      );
      return;
    }
    if (state === "off") {
      // Disconnect all clips, then stop the composition transport. Disconnecting
      // leaves Resolume's universal transport "playing", which the UI still shows
      // as running; stopping it makes the off state complete. The two steps are
      // atomic for retry purposes: any failure fails the off state as a whole.
      await this._request(`${base}${RESOLUME_OFF_PATH}`, { method: "POST" });
      await this._stopTransport(base);
      return;
    }
    throw new Error(`unknown perimeter state: ${JSON.stringify(state)}`);
  }

  async _request(url, { method, body }) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        method,
        headers:
          body !== undefined
            ? { "Content-Type": "application/json" }
            : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  // Set the composition transport to "Stop" via the live tempocontroller
  // play_state parameter. The value is read from the composition so a Resolume
  // version that spells the option differently keeps working; a missing or
  // malformed play_state is treated as a failure so the off state is retried.
  async _stopTransport(base) {
    const composition = await this._request(`${base}/composition`, {
      method: "GET",
    }).then((response) => response.json());
    const playState = composition?.tempocontroller?.play_state;
    if (!playState || playState.id == null) {
      throw new Error(
        "Resolume composition has no tempocontroller.play_state to stop",
      );
    }
    await this._request(`${base}/parameter/by-id/${playState.id}`, {
      method: "PUT",
      body: { value: RESOLUME_TRANSPORT_STOP_VALUE },
    });
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
    this._geometryRef = null;
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
    this._brightnessController = null;
    if (config.brightnessEnabled) {
      this._brightnessController = new BrightnessController(config);
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
    this._geometryRef = db.ref(this.config.overlayGeometryPath);
    console.log(`Listening on Firebase path: ${this.config.path}`);
    console.log(
      `Publishing preview to Firebase path: ${this.config.previewPath}`,
    );
    console.log(
      `Publishing overlay geometry to Firebase path: ${this.config.overlayGeometryPath}`,
    );
    // Publish the overlay target geometry once at startup (the configuration
    // is static for the lifetime of the process).
    void this.publishGeometry();
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
    if (this._brightnessController) {
      this._brightnessController.attach(db);
      console.log(
        `Brightness control listening on: ${this.config.brightnessPath}`,
      );
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
    if (this._brightnessController) {
      void this._brightnessController.republishStatus();
    }
    // Re-publish the overlay geometry as a safety net (same rationale as the
    // ad-layout status re-publish above).
    void this.publishGeometry();
    console.log("Refreshed Firebase listener");
  }

  // -- applicator -----------------------------------------------------------

  startApplicator() {
    this._applicatorPromise = this._applicatorLoop();
  }

  startBrightness() {
    if (this._brightnessController) {
      this._brightnessController.startWorker();
    }
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
          void this._ensureDeckAutopilot();
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

  // Ensure the deck autopilot is running so the base content — and with it the
  // ads the ad-layout controller deploys into the deck columns — keeps
  // cycling. The autopilot is the ads' transport: if a stale freeze (e.g. a
  // leftover from an earlier daemon build) left it paused, the deck would stay
  // stuck on a single ad; and with "Longest Clip" duration a still-image
  // column would advance after Resolume's 1s still default. Called
  // fire-and-forget after the perimeter turns on ("off" never touches the
  // autopilot, "on" overrides any stale leftover). Skips when a goal overlay
  // is actively freezing the deck (its restore record exists in the cache
  // dir) so a live celebration is never unpaused. Never throws.
  async _ensureDeckAutopilot() {
    try {
      const base = this.config.resolumeBaseUrl.replace(/\/+$/, "");
      const composition = await this._getJson(`${base}/composition`);
      const autopilot = composition?.autopilot;
      if (!autopilot) return;

      const desired = [
        { target: autopilot.target, value: this.config.deckAutopilot },
        {
          target: autopilot.duration_type,
          value: this.config.deckAutopilotDuration,
        },
        { target: autopilot.seconds, value: this.config.deckAutopilotSeconds },
      ].filter(({ target }) => target && target.id != null);
      const stale = desired.filter(
        ({ target, value }) => String(target.value) !== String(value),
      );
      if (stale.length === 0) return;

      // Re-check immediately before restoring: the freeze record is written
      // before the overlay pauses the autopilot, so this is the freshest
      // possible signal that a goal overlay is mid-flight.
      if (await this._overlayController?.isAutopilotFrozen()) return;

      for (const { target, value } of stale) {
        await this._putJson(`${base}/parameter/by-id/${target.id}`, { value });
      }
      await this._deleteLegacyAutopilotFreeze();
      console.log(
        `Deck autopilot asserted (${this.config.deckAutopilot}, ` +
          `${this.config.deckAutopilotDuration}, ` +
          `${this.config.deckAutopilotSeconds}s)`,
      );
    } catch (err) {
      console.error(`Failed to ensure deck autopilot: ${err.message}`);
    }
  }

  _getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    return fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
        }
        return response.json();
      })
      .finally(() => clearTimeout(timer));
  }

  _putJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    return fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
        }
      })
      .finally(() => clearTimeout(timer));
  }

  async _deleteLegacyAutopilotFreeze() {
    try {
      await fs.promises.unlink(
        path.join(this.config.overlayCacheDir, LEGACY_AUTOPILOT_FREEZE_FILE),
      );
    } catch {
      // nothing stale to clean up
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

  // Publish the daemon-owned overlay target geometry to
  // `perimeter/{location}/overlayGeometry`. The geometry is derived from the
  // static daemon configuration; a write lost right after startup is
  // re-published on the listener refresh as a safety net. Never throws.
  async publishGeometry() {
    if (!this._geometryRef) return;
    try {
      const geometry = buildOverlayGeometry(this.config);
      await this._geometryRef.set({
        revision: geometry.revision,
        updatedAt: ServerValue.TIMESTAMP,
        targets: geometry.targets,
      });
      console.log(
        `Published overlay geometry (${geometry.targets.length} targets, revision ${geometry.revision})`,
      );
    } catch (err) {
      console.error(`Failed to publish overlay geometry: ${err.message}`);
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

  // -- shutdown -----------------------------------------------------------------

  // Returns a promise that resolves once every sub-controller has drained.
  // Callers (the process signal handler) can race this against a grace
  // period so an in-flight brightness write still gets to verify/restore
  // before the process exits, without hanging forever on a stuck worker.
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

  const app = initializeApp({
    credential: cert(config.serviceAccountFile),
    databaseURL: config.databaseURL,
  });

  const controller = new PerimeterController(config);
  controller.attach(getDatabase(app));
  controller.startApplicator();
  controller.startBrightness();
  controller.startRefreshLoop();
  controller.startPreview();

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
