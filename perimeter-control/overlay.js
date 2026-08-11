/**
 * Perimeter overlay control — goal-triggered video sequences.
 *
 * Validates overlay documents from Firebase, stages assets from GCS to the
 * Windows Resolume host via SCP, loads clips into reserved layer slots,
 * triggers paired-column playback, schedules sequential column transitions,
 * and enforces looping for the final column.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Storage } from "@google-cloud/storage";
import { ServerValue } from "firebase-admin/database";

const execFileAsync = promisify(execFile);

const VALID_OVERLAY_VERSIONS = new Set([1]);
const MAX_OVERLAY_COLUMNS = 20;
const MAX_DURATION_MS = 120_000;
const MIN_DURATION_MS = 100;
const ALLOWED_BUCKET = "vikes-match-clock-firebase.appspot.com";
const ALLOWED_GCS_PREFIX = "gs://";

// -- Validation ----------------------------------------------------------------

function validateOverlayDoc(data) {
  if (data === null || data === undefined) return { valid: true, clear: true };
  if (!data || typeof data !== "object") return { valid: false };

  const raw = data;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (!VALID_OVERLAY_VERSIONS.has(version)) return { valid: false, reason: "unsupported version" };
  const docId = typeof raw.id === "string" ? raw.id : "";
  if (!docId) return { valid: false, reason: "missing id" };
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
    return { valid: false, reason: "missing or empty columns" };
  }
  if (raw.columns.length > MAX_OVERLAY_COLUMNS) {
    return { valid: false, reason: "too many columns" };
  }

  for (let ci = 0; ci < raw.columns.length; ci += 1) {
    const col = raw.columns[ci];
    if (!col || typeof col !== "object") return { valid: false, reason: `column ${ci} is not an object` };
    if (
      typeof col.durationMs !== "number" ||
      col.durationMs < MIN_DURATION_MS ||
      col.durationMs > MAX_DURATION_MS
    ) {
      return { valid: false, reason: `column ${ci} invalid durationMs` };
    }
    if (!col.files || typeof col.files !== "object") {
      return { valid: false, reason: `column ${ci} missing files` };
    }
    const fileKeys = Object.keys(col.files);
    if (fileKeys.length === 0) {
      return { valid: false, reason: `column ${ci} has no files` };
    }
    for (const key of fileKeys) {
      const f = col.files[key];
      if (typeof f !== "object" || !f) {
        return { valid: false, reason: `column ${ci} file ${key} is not an object` };
      }
      if (typeof f.name !== "string" || !f.name) {
        return { valid: false, reason: `column ${ci} file ${key} missing name` };
      }
      if (f.name.includes("/") || f.name.includes("\\")) {
        return { valid: false, reason: `column ${ci} file ${key} unsafe filename` };
      }
      if (typeof f.source !== "string" || !f.source) {
        return { valid: false, reason: `column ${ci} file ${key} missing source` };
      }
      if (!f.source.startsWith(ALLOWED_GCS_PREFIX)) {
        return { valid: false, reason: `column ${ci} file ${key} source not gs://` };
      }
      const bucketAndPath = f.source.slice(ALLOWED_GCS_PREFIX.length);
      const slashIdx = bucketAndPath.indexOf("/");
      if (slashIdx < 0) {
        return { valid: false, reason: `column ${ci} file ${key} invalid gs:// path` };
      }
      const bucketName = bucketAndPath.slice(0, slashIdx);
      if (bucketName !== ALLOWED_BUCKET) {
        return { valid: false, reason: `column ${ci} file ${key} wrong bucket` };
      }
    }
  }

  return { valid: true, clear: false, doc: data };
}

function resolveRequiredLayers(doc) {
  const layers = new Set();
  for (const col of doc.columns) {
    for (const key of Object.keys(col.files)) {
      layers.add(key);
    }
  }
  return [...layers].sort();
}

// -- Asset Stager --------------------------------------------------------------

export class AssetStager {
  constructor(config) {
    this.config = config;
    this.storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.serviceAccountFile,
    });
  }

  _parseGcsUrl(url) {
    const trimmed = url.startsWith(ALLOWED_GCS_PREFIX)
      ? url.slice(ALLOWED_GCS_PREFIX.length)
      : url;
    const slashIdx = trimmed.indexOf("/");
    return {
      bucket: trimmed.slice(0, slashIdx),
      object: trimmed.slice(slashIdx + 1),
    };
  }

  _cacheKey(gcsUrl) {
    const p = this._parseGcsUrl(gcsUrl);
    return createHash("sha256")
      .update(`${p.bucket}/${p.object}`)
      .digest("hex")
      .slice(0, 16);
  }

  async _ensureCacheDir() {
    const dir = path.join(this.config.overlayCacheDir, "overlay-cache");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async stageAsset(gcsUrl, remoteName) {
    const parsed = this._parseGcsUrl(gcsUrl);
    const cacheKey = this._cacheKey(gcsUrl);
    const cacheDir = await this._ensureCacheDir();

    const [metadata] = await this.storage
      .bucket(parsed.bucket)
      .file(parsed.object)
      .getMetadata();
    const generation = String(metadata.generation || "0");
    const ext = path.extname(parsed.object);
    const cachedPath = path.join(cacheDir, `${cacheKey}-${generation}${ext}`);

    let alreadyCached = false;
    try {
      await fs.access(cachedPath);
      alreadyCached = true;
    } catch {
      alreadyCached = false;
    }

    if (!alreadyCached) {
      // Clean old cached versions for this key before downloading
      try {
        const entries = await fs.readdir(cacheDir);
        for (const entry of entries) {
          if (entry.startsWith(cacheKey) && entry !== path.basename(cachedPath)) {
            await fs.unlink(path.join(cacheDir, entry)).catch(() => {});
          }
        }
      } catch {
        // best-effort cleanup
      }

      await this.storage
        .bucket(parsed.bucket)
        .file(parsed.object)
        .download({ destination: cachedPath });
    }

    await this.copyToWindows(cachedPath, remoteName);
    return `${this.config.overlayRemoteContentDir.replace(/\\+$/, "")}/${remoteName.replace(/\\/g, "/")}`;
  }

  async copyToWindows(localPath, remoteName) {
    const safeName = path.basename(remoteName.replace(/\\/g, "/"));
    if (!safeName || safeName.includes("/") || safeName.includes("\\")) {
      throw new Error(`unsafe remote filename: ${JSON.stringify(remoteName)}`);
    }

    const winDir = this.config.overlayRemoteContentDir
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    const finalPath = `${winDir}/${safeName}`;
    const tmpPath = `${winDir}/${safeName}.part`;

    const sshArgs = [
      "-i",
      this.config.overlaySshKey,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ServerAliveInterval=15",
    ];

    // SCP to temp file
    await execFileAsync("scp", [
      ...sshArgs,
      "-o",
      "StrictHostKeyChecking=accept-new",
      localPath,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}:${tmpPath}`,
    ]);

    // Atomic rename on remote
    await execFileAsync("ssh", [
      ...sshArgs,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}`,
      `move /Y "${tmpPath}" "${finalPath}"`,
    ]);

    return finalPath;
  }
}

// -- Resolume Overlay Client ---------------------------------------------------

export class ResolumeOverlayClient {
  constructor(config) {
    this.config = config;
    this._timeoutMs = config.requestTimeoutMs;
  }

  _baseUrl() {
    return this.config.resolumeBaseUrl.replace(/\/+$/, "");
  }

  async _post(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
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

  async loadClip(layerId, clipSlot, filePath) {
    // Resolume API: set the clip source for a specific clip slot in a layer
    // POST /api/v1/composition/layers/{layerId}/clips/{clipSlotId}/connect
    // To load a file, we use the clip properties endpoint
    const base = this._baseUrl();
    // Load file into the clip slot by setting its path via transport
    const url = `${base}/composition/layers/${layerId}/clips/${clipSlot}/open`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: filePath }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to load clip layer=${layerId} slot=${clipSlot}: HTTP ${response.status}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async triggerColumn(layerId, columnId) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/columns/${columnId}/connect`,
    );
  }

  async disconnectLayer(layerId) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/disconnect`,
    );
  }

  async setClipLoop(layerId, clipId, loop) {
    // Resolume clip transport controls
    const base = this._baseUrl();
    const url = loop
      ? `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-on`
      : `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-off`;
    await this._post(url);
  }
}

// -- Overlay Controller --------------------------------------------------------

export class OverlayController {
  constructor(config) {
    this.config = config;
    this.stager = new AssetStager(config);
    this.resolume = new ResolumeOverlayClient(config);
    this._currentId = null;
    this._currentColumn = 0;
    this._columnTimer = null;
    this._stopping = false;
    this._dbRef = null;
    this._statusRef = null;
  }

  _safeError(err) {
    if (!err) return null;
    if (typeof err === "string") return err.slice(0, 500);
    if (err instanceof Error) {
      const msg = err.message || String(err);
      return msg.slice(0, 500);
    }
    return String(err).slice(0, 500);
  }

  async _publishStatus(phase, activeColumn, error = null) {
    if (!this._statusRef) return;
    try {
      await this._statusRef.set({
        commandId: this._currentId,
        phase,
        activeColumn,
        error: this._safeError(error),
      });
    } catch (err) {
      console.error(`Failed to publish overlay status: ${err.message}`);
    }
  }

  // -- Firebase ---------------------------------------------------------------

  attach(db) {
    this._dbRef = db.ref(this.config.overlayPath);
    this._statusRef = db.ref(this.config.overlayStatusPath);
    this._dbRef.on("value", (snapshot) => {
      this._handleSnapshot(snapshot.val());
    });
    // Reconcile existing state on restart
    setTimeout(() => {
      if (!this._stopping) {
        this._reconcile();
      }
    }, 2000);
  }

  _handleSnapshot(data) {
    const result = validateOverlayDoc(data);
    if (!result.valid) {
      console.warn(
        `Ignoring invalid overlay document${result.reason ? `: ${result.reason}` : ""}`,
      );
      return;
    }
    if (result.clear) {
      console.log("Overlay clear command received");
      this._handleClear();
      return;
    }
    const doc = result.doc;
    if (doc.id === this._currentId) return; // same invocation, no-op
    console.log(`New overlay command: ${doc.id}`);
    this._startOverlay(doc);
  }

  // -- Reconciliation ---------------------------------------------------------

  async _reconcile() {
    if (!this._dbRef) return;
    try {
      const snapshot = await this._dbRef.once("value");
      const data = snapshot.val();
      if (data === null || data === undefined) {
        // No active overlay
        this._handleClear();
        return;
      }
      const result = validateOverlayDoc(data);
      if (!result.valid) return;
      if (!result.clear && result.doc) {
        console.log(`Reconciling overlay on restart: ${result.doc.id}`);
        this._startOverlay(result.doc);
      }
    } catch (err) {
      console.error(`Reconcile error: ${err.message}`);
    }
  }

  // -- State Machine -----------------------------------------------------------

  async _handleClear() {
    this._currentId = null;
    this._currentColumn = 0;
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    // Disconnect overlay layers only (not the whole deck)
    for (const layerId of this.config.overlayLayerIds) {
      try {
        await this.resolume.disconnectLayer(layerId);
      } catch (err) {
        console.error(`Failed to disconnect overlay layer ${layerId}: ${err.message}`);
      }
    }
    // Clear status
    await this._publishStatus("playing", -1).catch(() => {});
    // Write null to status
    if (this._statusRef) {
      await this._statusRef.set(null).catch(() => {});
    }
    console.log("Overlay cleared");
  }

  async _startOverlay(doc) {
    // Cancel running overlay
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    this._currentId = doc.id;
    this._currentColumn = 0;

    // Validate required layers exist in config
    const requiredLayers = resolveRequiredLayers(doc);
    for (const layer of requiredLayers) {
      if (!this.config.overlayLayerClipColumns[layer]) {
        console.error(
          `Overlay requires layer ${layer} which is not configured in overlayLayerClipColumns`,
        );
        await this._publishStatus(
          "error",
          0,
          `Missing configuration for layer ${layer}`,
        );
        return;
      }
    }

    await this._playColumn(doc, 0);
  }

  async _playColumn(doc, colIdx) {
    if (this._stopping) return;
    if (this._currentId !== doc.id) return; // superseded

    const col = doc.columns[colIdx];
    if (!col) {
      await this._handleClear();
      return;
    }

    this._currentColumn = colIdx;
    const isFinal = colIdx === doc.columns.length - 1;

    try {
      await this._publishStatus("downloading", colIdx);
      await this._stageAndLoadColumn(col);
    } catch (err) {
      console.error(`Failed to stage/load column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    try {
      await this._publishStatus("loading", colIdx);
      await this._triggerColumn(col);
    } catch (err) {
      console.error(`Failed to trigger column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    await this._publishStatus("playing", colIdx);

    if (isFinal) {
      // Final column loops until explicit clear
      console.log("Final column playing, looping until clear");
      return;
    }

    // Schedule next column
    this._columnTimer = setTimeout(() => {
      this._columnTimer = null;
      this._playColumn(doc, colIdx + 1);
    }, col.durationMs);
  }

  async _stageAndLoadColumn(col) {
    const promises = [];
    for (const [layerId, fileDef] of Object.entries(col.files)) {
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      if (clipSlot === undefined) {
        throw new Error(`No clip slot configured for layer ${layerId}`);
      }
      promises.push(
        (async () => {
          const winPath = await this.stager.stageAsset(
            fileDef.source,
            fileDef.name,
          );
          await this.resolume.loadClip(layerId, clipSlot, winPath);
        })(),
      );
    }
    await Promise.all(promises);
  }

  async _triggerColumn(col) {
    const promises = [];
    for (const [layerId, fileDef] of Object.entries(col.files)) {
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      if (clipSlot === undefined) continue;
      promises.push(this.resolume.triggerColumn(layerId, clipSlot));
    }
    await Promise.all(promises);
  }

  // -- Shutdown ----------------------------------------------------------------

  shutdown() {
    this._stopping = true;
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    if (this._dbRef) {
      this._dbRef.off("value");
    }
  }
}
