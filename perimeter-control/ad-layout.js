/**
 * Perimeter ad-layout control — column-based ad playback across lanes.
 *
 * Validates ad-layout documents from Firebase, stages assets from GCS to the
 * Windows Resolume host via SCP, loads clips into reserved layer slots,
 * triggers all lane clips together per column, schedules sequential column
 * transitions with 20s static duration or Resolume-reported video duration,
 * and cycles from the final column back to the first.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Storage } from "@google-cloud/storage";
import { ServerValue } from "firebase-admin/database";
import { reencodeThumbnail } from "./resolume-preview.js";

const execFileAsync = promisify(execFile);

const VALID_AD_VERSION = 1;
const MAX_AD_COLUMNS = 20;
const STATIC_DURATION_MS = 20_000;
const ALLOWED_GCS_PREFIX = "gs://";
const UNSAFE_FILENAME_RE = /["%\\/\x00-\x1f\x7f]/;

const WIN_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

// -- Validation ----------------------------------------------------------------

export function validateFileName(name) {
  if (!name || typeof name !== "string") return false;
  if (name === "." || name === "..") return false;
  if (UNSAFE_FILENAME_RE.test(name)) return false;
  if (/[:*?"<>|]/.test(name)) return false;
  if (name.length > 255) return false;
  const base = path.basename(name);
  if (!base || base !== name) return false;
  if (/[. ]$/.test(name)) return false;
  const upper = name.replace(/\.[^.]+$/, "").toUpperCase();
  if (WIN_RESERVED_NAMES.has(upper)) return false;
  return true;
}

export function validateGcsSource(source, allowedBucket, location) {
  if (!source || typeof source !== "string") return false;
  if (!source.startsWith(ALLOWED_GCS_PREFIX)) return false;
  const bucketAndPath = source.slice(ALLOWED_GCS_PREFIX.length);
  const slashIdx = bucketAndPath.indexOf("/");
  if (slashIdx < 0) return false;
  const bucketName = bucketAndPath.slice(0, slashIdx);
  if (bucketName !== allowedBucket) return false;
  const objectPath = bucketAndPath.slice(slashIdx + 1);
  if (!objectPath) return false;
  if (location) {
    const requiredPrefix = `${location}/perimeter/`;
    if (!objectPath.startsWith(requiredPrefix)) return false;
  }
  return true;
}

export function validateAdLayout(data, configuredLaneIds, allowedBucket, location) {
  if (data === null || data === undefined) return { valid: true, clear: true };
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "not an object" };
  }

  const raw = data;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (version !== VALID_AD_VERSION) {
    return { valid: false, reason: `unsupported version ${version}` };
  }
  const revision = typeof raw.revision === "string" ? raw.revision : "";
  if (!revision || revision.length > 64) {
    return { valid: false, reason: "invalid revision" };
  }
  if (!Array.isArray(raw.columns)) {
    return { valid: false, reason: "columns must be an array" };
  }
  if (raw.columns.length > MAX_AD_COLUMNS) {
    return { valid: false, reason: "too many columns" };
  }

  const expectedLaneSet = new Set(configuredLaneIds || []);
  const seenIds = new Set();

  for (let ci = 0; ci < raw.columns.length; ci += 1) {
    const col = raw.columns[ci];
    if (!col || typeof col !== "object") {
      return { valid: false, reason: `column ${ci} is not an object` };
    }
    const colId = typeof col.id === "string" ? col.id : "";
    if (!colId) {
      return { valid: false, reason: `column ${ci} missing id` };
    }
    if (seenIds.has(colId)) {
      return { valid: false, reason: `column ${ci} duplicate id ${colId}` };
    }
    seenIds.add(colId);

    if (!col.files || typeof col.files !== "object") {
      return { valid: false, reason: `column ${ci} missing files` };
    }
    const fileKeys = Object.keys(col.files);
    if (fileKeys.length === 0) {
      return { valid: false, reason: `column ${ci} has no files` };
    }

    if (expectedLaneSet.size > 0) {
      const columnLaneSet = new Set(fileKeys);
      if (columnLaneSet.size !== expectedLaneSet.size) {
        return {
          valid: false,
          reason: `column ${ci} file count mismatch (expected ${expectedLaneSet.size}, got ${columnLaneSet.size})`,
        };
      }
      for (const lid of expectedLaneSet) {
        if (!columnLaneSet.has(lid)) {
          return {
            valid: false,
            reason: `column ${ci} missing required lane ${lid}`,
          };
        }
      }
    }

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
      if (!validateGcsSource(f.source, allowedBucket, location)) {
        return { valid: false, reason: `column ${ci} file ${key} invalid source` };
      }
    }
  }

  return { valid: true, clear: false, revision, columns: raw.columns };
}

// -- Asset Stager (reuses GCS + SCP pattern from overlay.js) ------------------

export class AdAssetStager {
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
    const dir = path.join(this.config.overlayCacheDir, "ad-layout-cache");
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
    const fileSize = Number(metadata.size);
    const maxBytes = this.config.adMaxFileBytes || 250 * 1024 * 1024;
    if (Number.isFinite(fileSize) && fileSize > maxBytes) {
      throw new Error(
        `GCS object ${parsed.object} exceeds size limit: ${fileSize} bytes > ${maxBytes} bytes`,
      );
    }
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

// -- Resolume Ad Client -------------------------------------------------------

export class ResolumeAdClient {
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
      if (body !== null && body !== undefined) {
        if (typeof body === "string") {
          opts.headers = { "Content-Type": "text/plain" };
          opts.body = body;
        } else {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(body);
        }
      }
      const response = await fetch(url, opts);
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async _get(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async loadClip(layerId, clipSlot, filePath) {
    const base = this._baseUrl();
    const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`;
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/open`,
      encodeURI(fileUrl),
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
    await this._post(`${base}/composition/layers/${layerId}/clear`);
  }

  async setClipLoop(layerId, clipId, loop) {
    const base = this._baseUrl();
    const url = loop
      ? `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-on`
      : `${base}/composition/layers/${layerId}/clips/${clipId}/transport/loop-off`;
    await this._post(url);
  }

  async setTransportDuration(layerId, clipId, durationMs) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipId}/transport/duration`,
      { duration: Math.round(durationMs) },
    );
  }

  async getClipInfo(layerId, clipSlot) {
    const base = this._baseUrl();
    return this._get(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}`,
    );
  }

  async getClipTransport(layerId, clipSlot) {
    const base = this._baseUrl();
    return this._get(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/transport`,
    );
  }

  async getClipThumbnail(layerId, clipSlot) {
    const base = this._baseUrl();
    const url = `${base}/composition/layers/${layerId}/clips/${clipSlot}/thumbnail`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

// -- Ad Layout Controller -----------------------------------------------------

const AD_INITIAL_BACKOFF_MS = 500;
const AD_MAX_BACKOFF_MS = 10_000;
const AD_MAX_RETRIES = 5;

export class AdLayoutController {
  constructor(config, configuredLaneIds, adLayerClipSlots) {
    this.config = config;
    this.configuredLaneIds = configuredLaneIds || [];
    this.adLayerClipSlots = adLayerClipSlots || {};
    this.stager = new AdAssetStager(config);
    this.resolume = new ResolumeAdClient(config);
    this._currentRevision = null;
    this._currentColumn = -1;
    this._columnTimer = null;
    this._stopping = false;
    this._dbRef = null;
    this._statusRef = null;
    this._appliedColumns = [];
    this._stagedColumns = null;
    this._fallbackApplied = null;
    this._snapshotChain = Promise.resolve();
  }

  _safeError(err) {
    if (!err) return null;
    if (typeof err === "string") return err.slice(0, 500);
    if (err instanceof Error) {
      return (err.message || String(err)).slice(0, 500);
    }
    return String(err).slice(0, 500);
  }

  async _publishStatus(phase, activeColumn, error = null, lanes = null) {
    if (!this._statusRef) return;
    try {
      const payload = {
        lanes: lanes || [],
        revision: this._currentRevision || "",
        phase,
        activeColumn,
        error: this._safeError(error),
        updatedAt: ServerValue.TIMESTAMP,
        columns: this._appliedColumns,
      };
      await this._statusRef.set(payload);
    } catch (err) {
      console.error(`Failed to publish ad-layout status: ${err.message}`);
    }
  }

  async _retryOp(description, fn) {
    let backoff = AD_INITIAL_BACKOFF_MS;
    for (let attempt = 0; attempt < AD_MAX_RETRIES; attempt += 1) {
      if (this._stopping) throw new Error("controller stopping");
      try {
        return await fn();
      } catch (err) {
        const isLast = attempt === AD_MAX_RETRIES - 1;
        if (isLast) {
          console.error(`${description} failed after ${AD_MAX_RETRIES} attempts: ${err.message}`);
          throw err;
        }
        console.warn(
          `${description} attempt ${attempt + 1} failed: ${err.message} — retrying in ${backoff}ms`,
        );
        await this._sleep(backoff);
        backoff = Math.min(backoff * 2, AD_MAX_BACKOFF_MS);
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -- Lane discovery ----------------------------------------------------------

  async _discoverLanes() {
    const base = this.config.resolumeBaseUrl.replace(/\/+$/, "");
    const url = `${base}/composition`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return [];
      const composition = await response.json();
      const layers = Array.isArray(composition?.layers)
        ? composition.layers
        : [];
      return this.configuredLaneIds.map((id) => {
        const layerIndex = parseInt(id, 10);
        const layer = layers[layerIndex - 1];
        const name =
          layer &&
          typeof layer === "object" &&
          layer.name &&
          typeof layer.name === "object"
            ? (layer.name.value ?? `Lane ${id}`)
            : typeof layer?.name === "string"
              ? layer.name
              : `Lane ${id}`;
        return { id, name };
      });
    } catch (err) {
      console.error(`Failed to discover lanes: ${err.message}`);
      return this.configuredLaneIds.map((id) => ({
        id,
        name: `Lane ${id}`,
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  // -- Firebase ---------------------------------------------------------------

  attach(db) {
    this._dbRef = db.ref(this.config.adLayoutPath);
    this._statusRef = db.ref(this.config.adLayoutStatusPath);
    this._dbRef.on("value", (snapshot) => {
      this._snapshotChain = this._snapshotChain
        .then(() => this._processSnapshot(snapshot.val()))
        .catch((err) => {
          console.error(`Ad-layout snapshot processing error: ${err.message}`);
        });
    });
    console.log(`Ad-layout control listening on: ${this.config.adLayoutPath}`);
  }

  async _processSnapshot(data) {
    const result = validateAdLayout(
      data,
      this.configuredLaneIds,
      this.config.adLayoutBucket,
      this._locationFromPath(),
    );
    if (!result.valid) {
      const reason = result.reason || "unknown";
      console.warn(`Ignoring invalid ad-layout document: ${reason}`);
      await this._publishStatus("error", 0, `Invalid layout: ${reason}`);
      return;
    }
    if (result.clear) {
      console.log("Ad-layout clear command received");
      await this._handleClear();
      return;
    }
    if (result.revision === this._currentRevision) return;
    console.log(`New ad-layout revision: ${result.revision}`);
    await this._startLayout(result.revision, result.columns);
  }

  _locationFromPath() {
    const parts = (this.config.adLayoutPath || "").split("/");
    return parts.length >= 2 ? parts[1] : null;
  }

  // -- State Machine -----------------------------------------------------------

  async _handleClear() {
    this._currentRevision = null;
    this._currentColumn = -1;
    this._appliedColumns = [];
    this._stagedColumns = null;
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    for (const laneId of this.configuredLaneIds) {
      try {
        await this.resolume.clearLayer(laneId);
      } catch (err) {
        console.error(`Failed to clear ad layer ${laneId}: ${err.message}`);
      }
    }
    const lanes = await this._discoverLanes();
    this._publishStatus("idle", 0, null, lanes).catch(() => {});
    console.log("Ad-layout cleared");
  }

  async _startLayout(revision, columns) {
    if (this._columnTimer) {
      clearTimeout(this._columnTimer);
      this._columnTimer = null;
    }
    this._currentRevision = revision;
    this._currentColumn = -1;

    if (!columns || columns.length === 0) {
      await this._handleClear();
      return;
    }

    const lanes = await this._discoverLanes();
    await this._publishStatus("staging", 0, null, lanes);
    await this._executeFullLayout(revision, columns);
  }

  async _playColumn(colIdx) {
    if (this._stopping) return;

    try {
      const staged = this._stagedColumns;
      if (!staged || staged.length === 0) return;

      if (colIdx >= staged.length) {
        colIdx = 0;
      }

      this._currentColumn = colIdx;
      const col = staged[colIdx];

      for (const [laneId, fileDef] of Object.entries(col.files)) {
        if (this._stopping || this._currentRevision !== col._revision) return;
        const clipSlot = this.adLayerClipSlots[laneId];
        if (clipSlot === undefined) continue;

        await this.resolume.loadClip(laneId, clipSlot, fileDef.winPath);
        await this.resolume.setClipLoop(laneId, clipSlot, false);

        let transportDurationMs = STATIC_DURATION_MS;
        try {
          const clipInfo = await this.resolume.getClipInfo(laneId, clipSlot);
          const hasVideo = clipInfo?.video;
          if (hasVideo) {
            try {
              const transport = await this.resolume.getClipTransport(laneId, clipSlot);
              const duration = transport?.duration;
              if (typeof duration === "number" && duration > 0) {
                transportDurationMs = Math.round(duration);
              } else if (
                duration &&
                typeof duration === "object" &&
                typeof duration.value === "number" &&
                duration.value > 0
              ) {
                transportDurationMs = Math.round(duration.value);
              }
            } catch {
              const clipDuration =
                clipInfo?.duration ||
                clipInfo?.video?.duration ||
                clipInfo?.audio?.duration;
              if (
                clipDuration &&
                typeof clipDuration === "object" &&
                typeof clipDuration.value === "number"
              ) {
                transportDurationMs = Math.round(clipDuration.value);
              } else if (typeof clipDuration === "number" && clipDuration > 0) {
                transportDurationMs = Math.round(clipDuration);
              }
            }
          }
          if (!hasVideo) {
            await this.resolume.setTransportDuration(laneId, clipSlot, STATIC_DURATION_MS);
          }
        } catch (durErr) {
          console.warn(
            `Could not determine duration for ad ${fileDef.name}, using ${STATIC_DURATION_MS}ms: ${durErr.message}`,
          );
        }

        fileDef.transportDurationMs = transportDurationMs;

        try {
          const png = await this.resolume.getClipThumbnail(laneId, clipSlot);
          if (png) {
            const converted = reencodeThumbnail(png, {
              maxDim: this.config.thumbnailMaxDim,
              quality: this.config.thumbnailQuality,
              maxBytes: this.config.thumbnailMaxBytes,
            });
            if (converted) {
              fileDef.thumbnail = converted.dataUrl;
            }
          }
        } catch {
          // best-effort
        }
      }

      if (this._stopping || this._currentRevision !== col._revision) return;

      await this._retryOp(`trigger ad column ${colIdx}`, async () => {
        const promises = Object.keys(col.files).map((laneId) => {
          const clipSlot = this.adLayerClipSlots[laneId];
          if (clipSlot === undefined) return Promise.resolve();
          return this.resolume.connectClip(laneId, clipSlot);
        });
        await Promise.all(promises);
      });

      this._appliedColumns[colIdx] = {
        id: col.id,
        files: Object.fromEntries(
          Object.entries(col.files).map(([lid, f]) => [
            lid,
            { name: f.name, transportDurationMs: f.transportDurationMs, thumbnail: f.thumbnail },
          ]),
        ),
      };
      this._fallbackApplied = null;

      const lanes = await this._discoverLanes();
      await this._publishStatus("playing", colIdx + 1, null, lanes);

      const effectiveDuration = this._getColumnDuration(this._appliedColumns[colIdx]);
      this._columnTimer = setTimeout(() => {
        this._columnTimer = null;
        if (this._stopping) return;
        this._playColumn(colIdx + 1);
      }, effectiveDuration);
    } catch (err) {
      console.error(`Failed to play ad column ${colIdx}: ${err.message}`);
      if (this._fallbackApplied) {
        this._appliedColumns = this._fallbackApplied;
        this._fallbackApplied = null;
      }
      await this._publishStatus("error", colIdx + 1, err);
    }
  }

  _getColumnDuration(appliedColumn) {
    if (!appliedColumn?.files) return STATIC_DURATION_MS;
    const durations = Object.values(appliedColumn.files)
      .filter((f) => typeof f === "object" && f)
      .map((f) => f.transportDurationMs || STATIC_DURATION_MS);
    if (durations.length === 0) return STATIC_DURATION_MS;
    return Math.max(...durations);
  }

  async _executeFullLayout(revision, columns) {
    if (this._currentRevision !== revision) return;

    const prevApplied = this._appliedColumns;
    const lanes = await this._discoverLanes();
    const stagedColumns = [];

    try {
      for (let ci = 0; ci < columns.length; ci += 1) {
        if (this._stopping || this._currentRevision !== revision) return;
        const col = columns[ci];
        const stagedFiles = {};

        for (const [laneId, fileDef] of Object.entries(col.files)) {
          if (this._stopping || this._currentRevision !== revision) return;
          const clipSlot = this.adLayerClipSlots[laneId];
          if (clipSlot === undefined) {
            throw new Error(`No clip slot configured for ad lane ${laneId}`);
          }

          await this._publishStatus("staging", ci + 1, null, lanes);
          const winPath = await this._retryOp(
            `stage ad column ${ci} lane ${laneId}`,
            () => this.stager.stageAsset(fileDef.source, fileDef.name),
          );

          stagedFiles[laneId] = { name: fileDef.name, winPath };
        }

        stagedColumns.push({ id: col.id, files: stagedFiles, _revision: revision });
      }

      if (this._stopping || this._currentRevision !== revision) return;

      this._stagedColumns = stagedColumns;
      this._appliedColumns = [];
      this._fallbackApplied = prevApplied;
      await this._playColumn(0);
    } catch (err) {
      console.error(`Failed to execute ad layout: ${err.message}`);
      this._appliedColumns = prevApplied;
      const lanes2 = await this._discoverLanes().catch(() => []);
      await this._publishStatus(
        "error",
        this._currentColumn >= 0 ? this._currentColumn + 1 : 0,
        err,
        lanes2,
      );
    }
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
