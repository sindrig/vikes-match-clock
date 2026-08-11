/**
 * Perimeter overlay control — goal-triggered video sequences.
 *
 * Validates overlay documents from Firebase, stages assets from GCS to the
 * Windows Resolume host via SCP, loads clips into reserved layer slots,
 * triggers paired-clip playback, schedules sequential column transitions,
 * and enforces looping for the final column.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Storage } from "@google-cloud/storage";

const execFileAsync = promisify(execFile);

const VALID_OVERLAY_VERSIONS = new Set([1]);
const MAX_OVERLAY_COLUMNS = 20;
const MAX_DURATION_MS = 120_000;
const MIN_DURATION_MS = 100;
const ALLOWED_BUCKET = "vikes-match-clock-firebase.appspot.com";
const ALLOWED_GCS_PREFIX = "gs://";
const UNSAFE_FILENAME_RE = /["%\\/\x00-\x1f\x7f]/;

// -- Validation ----------------------------------------------------------------

function validateFileName(name) {
  if (!name || typeof name !== "string") return false;
  if (UNSAFE_FILENAME_RE.test(name)) return false;
  if (name.length > 255) return false;
  const base = path.basename(name);
  if (!base || base !== name) return false;
  return true;
}

function validateGcsSource(source) {
  if (!source || typeof source !== "string") return false;
  if (!source.startsWith(ALLOWED_GCS_PREFIX)) return false;
  const bucketAndPath = source.slice(ALLOWED_GCS_PREFIX.length);
  const slashIdx = bucketAndPath.indexOf("/");
  if (slashIdx < 0) return false;
  const bucketName = bucketAndPath.slice(0, slashIdx);
  if (bucketName !== ALLOWED_BUCKET) return false;
  const objectPath = bucketAndPath.slice(slashIdx + 1);
  if (!objectPath) return false;
  return true;
}

function validateOverlayDoc(data, configuredLayerIds) {
  if (data === null || data === undefined) return { valid: true, clear: true };
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "not an object" };
  }

  const raw = data;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (!VALID_OVERLAY_VERSIONS.has(version)) {
    return { valid: false, reason: "unsupported version" };
  }
  const docId = typeof raw.id === "string" ? raw.id : "";
  if (!docId) return { valid: false, reason: "missing id" };
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
    return { valid: false, reason: "missing or empty columns" };
  }
  if (raw.columns.length > MAX_OVERLAY_COLUMNS) {
    return { valid: false, reason: "too many columns" };
  }

  const expectedLayerSet = new Set(configuredLayerIds || []);

  for (let ci = 0; ci < raw.columns.length; ci += 1) {
    const col = raw.columns[ci];
    if (!col || typeof col !== "object") {
      return { valid: false, reason: `column ${ci} is not an object` };
    }
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

    // Enforce paired layer targets: every column must have exactly the
    // configured layer IDs and no others.
    if (expectedLayerSet.size > 0) {
      const columnLayerSet = new Set(fileKeys);
      if (columnLayerSet.size !== expectedLayerSet.size) {
        return {
          valid: false,
          reason: `column ${ci} file count mismatch (expected ${expectedLayerSet.size}, got ${columnLayerSet.size})`,
        };
      }
      for (const lid of expectedLayerSet) {
        if (!columnLayerSet.has(lid)) {
          return {
            valid: false,
            reason: `column ${ci} missing required layer ${lid}`,
          };
        }
      }
    }

    // Check for duplicate filenames within the column
    const names = new Set();
    for (const key of fileKeys) {
      const f = col.files[key];
      if (typeof f !== "object" || !f) {
        return { valid: false, reason: `column ${ci} file ${key} is not an object` };
      }
      if (!validateFileName(f.name)) {
        return { valid: false, reason: `column ${ci} file ${key} invalid filename` };
      }
      if (names.has(f.name)) {
        return { valid: false, reason: `column ${ci} duplicate filename ${f.name}` };
      }
      names.add(f.name);
      if (!validateGcsSource(f.source)) {
        return { valid: false, reason: `column ${ci} file ${key} invalid source` };
      }
    }
  }

  return { valid: true, clear: false, doc: data };
}

// -- Asset Stager --------------------------------------------------------------

export class AssetStager {
  constructor(config) {
    this.config = config;
    this.storage = new Storage({
      projectId: config.overlayProjectId,
      keyFilename: config.serviceAccountFile,
    });
    this._validatedRemoteDir = false;
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
    if (!this._validatedRemoteDir) {
      const expected = path.normalize(this.config.overlayRemoteContentDir);
      if (!expected.startsWith("C:") || expected.includes("..")) {
        throw new Error(
          `overlayRemoteContentDir must be under C: — got ${JSON.stringify(expected)}`,
        );
      }
      this._validatedRemoteDir = true;
    }

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
    if (!validateFileName(remoteName)) {
      throw new Error(`unsafe remote filename: ${JSON.stringify(remoteName)}`);
    }

    const winDir = this.config.overlayRemoteContentDir
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    const finalPath = `${winDir}/${remoteName}`;
    const tmpPath = `${winDir}/${remoteName}.part`;

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

    await execFileAsync("scp", [
      ...sshArgs,
      localPath,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}:${tmpPath}`,
    ]);

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

  async _post(url, body = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const opts = { method: "POST", signal: controller.signal };
      if (body) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(body);
      }
      const response = await fetch(url, opts);
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async loadClip(layerId, clipSlot, filePath) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/open`,
      { filename: filePath },
    );
  }

  async connectClip(layerId, clipSlot) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/connect`,
    );
  }

  async clearLayer(layerId) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clear`,
    );
  }

  async setClipLoop(layerId, clipId, loop) {
    const base = this._baseUrl();
    const url = loop
      ? `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-on`
      : `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-off`;
    await this._post(url);
  }

  async setClipPause(layerId, clipId, pause) {
    const base = this._baseUrl();
    const url = pause
      ? `${base}/composition/layers/${layerId}/clips/${clipId}/transport/pause`
      : `${base}/composition/layers/${layerId}/clips/${clipId}/transport/play`;
    await this._post(url);
  }
}

// -- Overlay Controller --------------------------------------------------------

// Retry backoff constants for overlay operations
const OVERLAY_INITIAL_BACKOFF_MS = 500;
const OVERLAY_MAX_BACKOFF_MS = 10_000;
const OVERLAY_MAX_RETRIES = 5;

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
      return (err.message || String(err)).slice(0, 500);
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

  async _retryOp(description, fn) {
    let backoff = OVERLAY_INITIAL_BACKOFF_MS;
    for (let attempt = 0; attempt < OVERLAY_MAX_RETRIES; attempt += 1) {
      if (this._stopping) throw new Error("controller stopping");
      try {
        return await fn();
      } catch (err) {
        const isLast = attempt === OVERLAY_MAX_RETRIES - 1;
        if (isLast) {
          console.error(`${description} failed after ${OVERLAY_MAX_RETRIES} attempts: ${err.message}`);
          throw err;
        }
        console.warn(
          `${description} attempt ${attempt + 1} failed: ${err.message} — retrying in ${backoff}ms`,
        );
        await this._sleep(backoff);
        backoff = Math.min(backoff * 2, OVERLAY_MAX_BACKOFF_MS);
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -- Firebase ---------------------------------------------------------------

  attach(db) {
    this._dbRef = db.ref(this.config.overlayPath);
    this._statusRef = db.ref(this.config.overlayStatusPath);
    // on("value") fires immediately with the current snapshot, so it handles
    // restart reconciliation naturally — no separate _reconcile needed.
    this._dbRef.on("value", (snapshot) => {
      this._handleSnapshot(snapshot.val());
    });
    console.log(`Overlay control listening on: ${this.config.overlayPath}`);
  }

  _handleSnapshot(data) {
    const result = validateOverlayDoc(data, this.config.overlayLayerIds);
    if (!result.valid) {
      const reason = result.reason || "unknown";
      console.warn(`Ignoring invalid overlay document: ${reason}`);
      this._publishError(`Invalid overlay: ${reason}`);
      return;
    }
    if (result.clear) {
      console.log("Overlay clear command received");
      this._handleClear();
      return;
    }
    const doc = result.doc;
    if (doc.id === this._currentId) return;
    console.log(`New overlay command: ${doc.id}`);
    this._startOverlay(doc);
  }

  async _publishError(errorText) {
    if (!this._statusRef) return;
    try {
      await this._statusRef.set({
        commandId: null,
        phase: "error",
        activeColumn: -1,
        error: String(errorText).slice(0, 500),
      });
    } catch {
      // best-effort
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
    for (const layerId of this.config.overlayLayerIds) {
      try {
        await this.resolume.clearLayer(layerId);
      } catch (err) {
        console.error(
          `Failed to clear overlay layer ${layerId}: ${err.message}`,
        );
      }
    }
    this._publishStatus("playing", -1).catch(() => {});
    console.log("Overlay cleared");
  }

  async _startOverlay(doc) {
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    this._currentId = doc.id;
    this._currentColumn = 0;

    await this._playColumn(doc, 0);
  }

  async _playColumn(doc, colIdx) {
    if (this._stopping) return;
    if (this._currentId !== doc.id) return;

    const col = doc.columns[colIdx];
    if (!col) {
      await this._handleClear();
      return;
    }

    this._currentColumn = colIdx;
    const isFinal = colIdx === doc.columns.length - 1;

    try {
      await this._publishStatus("downloading", colIdx);
      await this._retryOp(`stage column ${colIdx}`, () =>
        this._stageAndLoadColumn(col, isFinal),
      );
    } catch (err) {
      console.error(`Failed to stage/load column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    try {
      await this._publishStatus("loading", colIdx);
      await this._retryOp(`trigger column ${colIdx}`, () =>
        this._triggerColumn(col, isFinal),
      );
    } catch (err) {
      console.error(`Failed to trigger column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    await this._publishStatus("playing", colIdx);

    if (isFinal) {
      console.log("Final column playing, looping until clear");
      return;
    }

    this._columnTimer = setTimeout(() => {
      this._columnTimer = null;
      this._playColumn(doc, colIdx + 1);
    }, col.durationMs);
  }

  async _stageAndLoadColumn(col, isFinal) {
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
          // Set loop state before triggering
          await this.resolume.setClipLoop(layerId, clipSlot, isFinal);
        })(),
      );
    }
    await Promise.all(promises);
  }

  async _triggerColumn(col) {
    const promises = [];
    for (const [layerId] of Object.entries(col.files)) {
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      if (clipSlot === undefined) continue;
      promises.push(this.resolume.connectClip(layerId, clipSlot));
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
