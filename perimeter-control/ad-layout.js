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

const execFileAsync = promisify(execFile);

const VALID_AD_VERSION = 1;
const MAX_AD_COLUMNS = 20;
const STATIC_DURATION_MS = 20_000;
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

function validateAdLayout(data, configuredLaneIds) {
  // null/undefined means clear
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
  // Allow empty columns array (clear)
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

    // Enforce exact lane set
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
      if (!validateGcsSource(f.source)) {
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
        updatedAt: Date.now(),
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
    // Read composition to discover layer names for configured lane IDs
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
      this._handleSnapshot(snapshot.val());
    });
    console.log(`Ad-layout control listening on: ${this.config.adLayoutPath}`);
  }

  _handleSnapshot(data) {
    const result = validateAdLayout(data, this.configuredLaneIds);
    if (!result.valid) {
      const reason = result.reason || "unknown";
      console.warn(`Ignoring invalid ad-layout document: ${reason}`);
      this._publishStatus("error", 0, `Invalid layout: ${reason}`).catch(
        () => {},
      );
      return;
    }
    if (result.clear) {
      console.log("Ad-layout clear command received");
      this._handleClear();
      return;
    }
    // Deduplicate by revision
    if (result.revision === this._currentRevision) return;
    console.log(`New ad-layout revision: ${result.revision}`);
    this._startLayout(result.revision, result.columns);
  }

  // -- State Machine -----------------------------------------------------------

  async _handleClear() {
    this._currentRevision = null;
    this._currentColumn = -1;
    this._appliedColumns = [];
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
    this._appliedColumns = [];

    // Empty columns = clear
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
      // Determine if we need to cycle back
      if (this._appliedColumns.length > 0 && colIdx >= this._appliedColumns.length) {
        colIdx = 0;
      }

      // If we're past the column count and no applied columns, bail
      if (this._appliedColumns.length === 0 && colIdx > 0) return;

      this._currentColumn = colIdx;

      // Trigger the column's clips
      const appliedColumn = this._appliedColumns[colIdx];
      if (appliedColumn) {
        const promises = Object.keys(appliedColumn.files || {}).map((laneId) => {
          const clipSlot = this.adLayerClipSlots[laneId];
          if (clipSlot === undefined) return Promise.resolve();
          return this.resolume.connectClip(laneId, clipSlot);
        });
        await Promise.all(promises);
      }

      await this._publishStatus(
        "playing",
        colIdx + 1,
        null,
        await this._discoverLanes(),
      );

      // Schedule next column
      const effectiveDuration = this._getColumnDuration(appliedColumn);

      this._columnTimer = setTimeout(() => {
        this._columnTimer = null;
        if (this._stopping) return;
        this._playColumn(colIdx + 1);
      }, effectiveDuration);
    } catch (err) {
      console.error(`Failed to play ad column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx + 1, err);
    }
  }

  _getColumnDuration(appliedColumn) {
    if (!appliedColumn?.files) return STATIC_DURATION_MS;
    const durations = Object.values(appliedColumn.files)
      .filter((f) => typeof f === "object" && f)
      .map((f) => f.transportDurationMs || STATIC_DURATION_MS);
    if (durations.length === 0) return STATIC_DURATION_MS;
    // Use the longest duration among lanes for the column
    return Math.max(...durations);
  }

  // The actual staging/loading/triggering logic. Called when a new layout
  // arrives. This is the full pipeline: stage → load → set duration → trigger.
  async _executeFullLayout(revision, columns) {
    if (this._currentRevision !== revision) return; // superseded

    const lanes = await this._discoverLanes();

    try {
      const appliedColumns = [];

      for (let ci = 0; ci < columns.length; ci += 1) {
        if (this._stopping || this._currentRevision !== revision) return;
        const col = columns[ci];
        const appliedFiles = {};

        // Stage and load each lane
        for (const [laneId, fileDef] of Object.entries(col.files)) {
          if (this._stopping || this._currentRevision !== revision) return;
          const clipSlot = this.adLayerClipSlots[laneId];
          if (clipSlot === undefined) {
            throw new Error(`No clip slot configured for ad lane ${laneId}`);
          }

          // Stage asset
          await this._publishStatus("staging", ci + 1, null, lanes);
          const winPath = await this._retryOp(
            `stage ad column ${ci} lane ${laneId}`,
            () => this.stager.stageAsset(fileDef.source, fileDef.name),
          );

          // Load clip
          await this._publishStatus("loading", ci + 1, null, lanes);
          await this._retryOp(
            `load ad column ${ci} lane ${laneId}`,
            () => this.resolume.loadClip(laneId, clipSlot, winPath),
          );

          // Disable looping (ads should never loop per-clip)
          await this.resolume.setClipLoop(laneId, clipSlot, false);

          // Determine duration: static image = 20s, video = Resolume-reported
          let transportDurationMs = STATIC_DURATION_MS;
          try {
            const clipInfo = await this.resolume.getClipInfo(
              laneId,
              clipSlot,
            );
            const hasVideo = clipInfo?.video;
            if (hasVideo) {
              // Try to get duration from transport endpoint
              try {
                const transport = await this.resolume.getClipTransport(
                  laneId,
                  clipSlot,
                );
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
                // If we can't read transport, try position/duration from clip
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
            // For static images, set exactly 20,000ms
            if (!hasVideo) {
              await this.resolume.setTransportDuration(
                laneId,
                clipSlot,
                STATIC_DURATION_MS,
              );
            }
          } catch (durErr) {
            console.warn(
              `Could not determine duration for ad ${fileDef.name}, using ${STATIC_DURATION_MS}ms: ${durErr.message}`,
            );
          }

          appliedFiles[laneId] = {
            name: fileDef.name,
            transportDurationMs,
          };
        }

        if (this._stopping || this._currentRevision !== revision) return;

        // Trigger all lanes together
        await this._retryOp(`trigger ad column ${ci}`, async () => {
          const promises = Object.keys(col.files).map((laneId) => {
            const clipSlot = this.adLayerClipSlots[laneId];
            if (clipSlot === undefined) return Promise.resolve();
            return this.resolume.connectClip(laneId, clipSlot);
          });
          await Promise.all(promises);
        });

        appliedColumns.push({ id: col.id, files: appliedFiles });
      }

      if (this._stopping || this._currentRevision !== revision) return;

      this._appliedColumns = appliedColumns;
      await this._publishStatus("playing", 1, null, lanes);
      this._currentColumn = 0;

      // Schedule the first column advance
      const firstDuration = this._getColumnDuration(appliedColumns[0]);
      this._columnTimer = setTimeout(() => {
        this._columnTimer = null;
        if (this._stopping || this._currentRevision !== revision) return;
        // Advance to column 1 (index 1), which will be checked for cycle
        const nextCol = 1;
        if (nextCol >= appliedColumns.length) {
          // Cycle back to first column
          this._playColumn(0);
        } else {
          this._currentColumn = nextCol;
          const dur = this._getColumnDuration(appliedColumns[nextCol]);
          this._publishStatus("playing", nextCol + 1, null, lanes).catch(() => {});
          this._columnTimer = setTimeout(() => {
            this._columnTimer = null;
            if (this._stopping || this._currentRevision !== revision) return;
            // Generic advance — for cycling, just continue with _playColumn
            this._playColumn(nextCol + 1);
          }, dur);
        }
      }, firstDuration);
    } catch (err) {
      console.error(`Failed to execute ad layout: ${err.message}`);
      await this._publishStatus(
        "error",
        this._currentColumn >= 0 ? this._currentColumn + 1 : 0,
        err,
        await this._discoverLanes(),
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
