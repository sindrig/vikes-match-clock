/**
 * Perimeter ad-layout control — content deployer across lanes.
 *
 * Validates ad-layout documents from Firebase, stages assets from GCS to the
 * Windows Resolume host via SCP, and loads clips into the Resolume deck
 * columns on the configured base layers. The composition's existing autopilot
 * owns all column cycling and transport — this controller never calls connect,
 * disconnect, loop, or transport endpoints. It only opens files into clip
 * slots and clears them. A layout column is distributed across a contiguous
 * range of deck columns (see mapLayoutToDeckColumns); the autopilot then
 * cycles through them exactly as it cycles the Efni content.
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
export const MAX_AD_COLUMNS = 20;
const ALLOWED_GCS_PREFIX = "gs://";
const UNSAFE_FILENAME_RE = /["%\\/\x00-\x1f\x7f]/;

const WIN_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
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

export function validateAdLayout(
  data,
  configuredLaneIds,
  allowedBucket,
  location,
) {
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

    // The same filename may be reused across lanes only when it refers to the
    // same GCS object: staging copies each lane's file to the shared remote
    // content dir keyed by name, so distinct objects sharing a name would
    // clobber each other on the Windows host.
    const sourcesByName = new Map();
    for (const key of fileKeys) {
      const f = col.files[key];
      if (typeof f !== "object" || !f) {
        return {
          valid: false,
          reason: `column ${ci} file ${key} is not an object`,
        };
      }
      if (!validateFileName(f.name)) {
        return {
          valid: false,
          reason: `column ${ci} file ${key} invalid filename`,
        };
      }
      if (!validateGcsSource(f.source, allowedBucket, location)) {
        return {
          valid: false,
          reason: `column ${ci} file ${key} invalid source`,
        };
      }
      const existingSource = sourcesByName.get(f.name);
      if (existingSource !== undefined && existingSource !== f.source) {
        return {
          valid: false,
          reason: `column ${ci} filename ${f.name} maps to two different sources`,
        };
      }
      sourcesByName.set(f.name, f.source);
    }
  }

  return { valid: true, clear: false, revision, columns: raw.columns };
}

// Distribute N layout columns across M deck columns. Each layout column is
// loaded into a contiguous range of 1-based deck column indices. The base
// share is floor(M/N); the remainder (M mod N) is distributed one extra deck
// column to each of the first `M mod N` layout columns.
//
//   mapLayoutToDeckColumns(3, 15) -> [[1..5], [6..10], [11..15]]
//   mapLayoutToDeckColumns(1, 15) -> [[1..15]]
//   mapLayoutToDeckColumns(0, 15) -> []
//   mapLayoutToDeckColumns(5, 7)  -> [[1,2], [3,4], [5], [6], [7]]
export function mapLayoutToDeckColumns(layoutColumnCount, deckColumnCount) {
  if (!Number.isInteger(layoutColumnCount) || layoutColumnCount <= 0) return [];
  if (!Number.isInteger(deckColumnCount) || deckColumnCount <= 0) return [];
  const base = Math.floor(deckColumnCount / layoutColumnCount);
  const remainder = deckColumnCount % layoutColumnCount;
  const ranges = [];
  let start = 1;
  for (let i = 0; i < layoutColumnCount; i += 1) {
    const length = base + (i < remainder ? 1 : 0);
    if (length <= 0) {
      ranges.push([]);
      continue;
    }
    const range = [];
    for (let j = 0; j < length; j += 1) range.push(start + j);
    ranges.push(range);
    start += length;
  }
  return ranges;
}

// -- Asset Stager (reuses GCS + SCP pattern from overlay.js) ------------------

export class AdAssetStager {
  constructor(config) {
    this.config = config;
    this.storage = new Storage({
      projectId: config.overlayProjectId,
      keyFilename: config.serviceAccountFile,
    });
    this._execFileAsync = execFileAsync;
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
          if (
            entry.startsWith(cacheKey) &&
            entry !== path.basename(cachedPath)
          ) {
            await fs.unlink(path.join(cacheDir, entry)).catch(() => {});
          }
        }
      } catch {
        // best-effort cleanup
      }

      // Download to a temp path and atomically rename only after a complete
      // download, so a partial/failed download never looks cached and gets
      // copied to the Windows host on a later retry.
      const tmpPath = `${cachedPath}.part-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        await this.storage
          .bucket(parsed.bucket)
          .file(parsed.object)
          .download({ destination: tmpPath });
        await fs.rename(tmpPath, cachedPath);
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {});
        throw err;
      }
    }

    await this.copyToWindows(cachedPath, remoteName);
    return `${this.config.overlayRemoteContentDir.replace(/\\+$/, "")}/${remoteName.replace(/\\/g, "/")}`;
  }

  _sshArgs() {
    return [
      "-i",
      this.config.overlaySshKey,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `UserKnownHostsFile=${path.join(this.config.overlayCacheDir, "known_hosts")}`,
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ServerAliveInterval=15",
    ];
  }

  async copyToWindows(localPath, remoteName) {
    if (!validateFileName(remoteName)) {
      throw new Error(`unsafe remote filename: ${JSON.stringify(remoteName)}`);
    }

    const winDir = this.config.overlayRemoteContentDir
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    // scp accepts forward slashes; cmd's `move` does not, so the move command
    // uses a backslash version of the same paths.
    const scpPath = `${winDir}/${remoteName}.part`;
    const moveDir = winDir.replace(/\//g, "\\");
    const moveTmpPath = `${moveDir}\\${remoteName}.part`;
    const moveFinalPath = `${moveDir}\\${remoteName}`;

    const sshArgs = this._sshArgs();

    await this._execFileAsync("scp", [
      ...sshArgs,
      localPath,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}:${scpPath}`,
    ]);

    await this._execFileAsync("ssh", [
      ...sshArgs,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}`,
      `move /Y "${moveTmpPath}" "${moveFinalPath}"`,
    ]);

    return moveFinalPath;
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

  async clearClip(layerId, clipSlot) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/clear`,
    );
  }

  async getClipInfo(layerId, clipSlot) {
    const base = this._baseUrl();
    return this._get(`${base}/composition/layers/${layerId}/clips/${clipSlot}`);
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
  constructor(config, configuredLaneIds) {
    this.config = config;
    this.configuredLaneIds = configuredLaneIds || [];
    this.stager = new AdAssetStager(config);
    this.resolume = new ResolumeAdClient(config);
    this._currentRevision = null;
    this._stopping = false;
    this._dbRef = null;
    this._statusRef = null;
    // Applied columns in published status form: { id, deckColumns, files }.
    this._appliedColumns = [];
    this._snapshotChain = Promise.resolve();
    // Snapshot of the most recently published status payload, so the listener
    // refresh can re-publish it and self-heal a silently lost write.
    this._lastStatus = null;
    // Cached deck column count, discovered from the composition. Falls back
    // to a single column when Resolume is unreachable so a clear/load still
    // has a bounded target set.
    this._deckColumnCount = 1;
  }

  _safeError(err) {
    if (!err) return null;
    if (typeof err === "string") return err.slice(0, 500);
    if (err instanceof Error) {
      return (err.message || String(err)).slice(0, 500);
    }
    return String(err).slice(0, 500);
  }

  async _setStatus(payload) {
    this._lastStatus = { ...payload, columns: [...(payload.columns || [])] };
    if (!this._statusRef) return;
    await this._statusRef.set(payload);
  }

  async _publishStatus(phase, error = null, lanes = null) {
    if (!this._statusRef) return false;
    const payload = {
      lanes: lanes || [],
      revision: this._currentRevision || "",
      phase,
      error: this._safeError(error),
      updatedAt: ServerValue.TIMESTAMP,
      columns: this._appliedColumns,
    };
    try {
      await this._setStatus(payload);
      return true;
    } catch (err) {
      console.error(`Failed to publish ad-layout status: ${err.message}`);
      return false;
    }
  }

  // Re-publish the most recently published status so a silently lost write
  // self-heals on the next listener refresh, mirroring the "refresh as safety
  // net" design the daemon already uses for reads. Never throws.
  async republishStatus() {
    if (!this._lastStatus || !this._statusRef) return;
    try {
      await this._statusRef.set({
        ...this._lastStatus,
        updatedAt: ServerValue.TIMESTAMP,
      });
    } catch (err) {
      console.error(`Failed to re-publish ad-layout status: ${err.message}`);
    }
  }

  // Retry an operation with bounded exponential backoff. No generation
  // tracking: snapshots are serialized through _snapshotChain, so a newer
  // revision never races an in-flight load.
  async _retryOp(description, fn) {
    let backoff = AD_INITIAL_BACKOFF_MS;
    for (let attempt = 0; attempt < AD_MAX_RETRIES; attempt += 1) {
      if (this._stopping) throw new Error("controller stopping");
      try {
        return await fn();
      } catch (err) {
        const isLast = attempt === AD_MAX_RETRIES - 1;
        if (isLast) {
          console.error(
            `${description} failed after ${AD_MAX_RETRIES} attempts: ${err.message}`,
          );
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

  // -- Lane and deck discovery -------------------------------------------------

  _fallbackLanes() {
    return this.configuredLaneIds.map((id) => ({
      id,
      name: `Lane ${id}`,
    }));
  }

  // Read the live composition to resolve lane names and the deck column count.
  // A non-2xx or failed read falls back to the configured lane ids and the
  // cached column count so the ad-layout keeps working on a degraded link.
  async _discoverComposition() {
    const base = this.config.resolumeBaseUrl.replace(/\/+$/, "");
    const url = `${base}/composition`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        return {
          lanes: this._fallbackLanes(),
          columnCount: this._deckColumnCount,
        };
      }
      const composition = await response.json();
      const layers = Array.isArray(composition?.layers)
        ? composition.layers
        : [];
      const lanes = this.configuredLaneIds.map((id) => {
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
      const columnCount = Array.isArray(composition?.columns)
        ? composition.columns.length
        : 1;
      this._deckColumnCount = columnCount;
      return { lanes, columnCount };
    } catch (err) {
      console.error(`Failed to discover lanes: ${err.message}`);
      return {
        lanes: this._fallbackLanes(),
        columnCount: this._deckColumnCount,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // -- Firebase ---------------------------------------------------------------

  attach(db) {
    this._dbRef = db.ref(this.config.adLayoutPath);
    this._statusRef = db.ref(this.config.adLayoutStatusPath);
    this._dbRef.on("value", (snapshot) => {
      // Serialize snapshot processing so a newer revision never races an
      // in-flight load; the previous cycle completes before the next begins.
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
      await this._publishStatus("error", `Invalid layout: ${reason}`);
      return;
    }
    if (result.clear) {
      console.log("Ad-layout clear command received");
      await this._handleClear(null);
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

  // -- Content deployment ------------------------------------------------------

  // Clear every ad-layout clip slot across all deck columns on all configured
  // lanes. Never clears a whole layer: the goal overlay reserves its own
  // independent clips on the overlay layers and a full layer clear would
  // disconnect them mid-celebration.
  async _clearAllSlots(columnCount) {
    for (const laneId of this.configuredLaneIds) {
      for (let slot = 1; slot <= columnCount; slot += 1) {
        try {
          await this.resolume.clearClip(laneId, slot);
        } catch (err) {
          console.error(
            `Failed to clear ad clip on lane ${laneId} slot ${slot}: ${err.message}`,
          );
        }
      }
    }
  }

  // Clear the ad-layout clips. `revision` is preserved when the clear comes
  // from an empty-columns layout (so the idle status carries the submitted
  // revision and identical clears are deduplicated); it is `null` only for a
  // deleted desired document.
  async _handleClear(revision) {
    this._currentRevision = revision;
    this._appliedColumns = [];
    const { lanes, columnCount } = await this._discoverComposition();
    await this._clearAllSlots(columnCount);
    // Publish the idle status with retry: a fire-and-forget write can be
    // silently lost right after a daemon restart, and since the desired
    // document may never change again it would never be re-published.
    await this._retryOp("publish ad-layout idle status", async () => {
      const ok = await this._publishStatus("idle", null, lanes);
      if (!ok) throw new Error("ad-layout status publish failed");
    });
    console.log("Ad-layout cleared");
  }

  async _startLayout(revision, columns) {
    if (columns.length === 0) {
      console.log("Ad-layout empty-columns clear received");
      await this._handleClear(revision);
      return;
    }
    this._currentRevision = revision;
    const { lanes, columnCount } = await this._discoverComposition();
    await this._publishStatus("loading", null, lanes);

    try {
      // Clear-then-load: empty the old ad slots first so a layout change
      // never leaves stale clips playing in unmapped deck columns. The brief
      // blank flash is expected and acceptable.
      await this._clearAllSlots(columnCount);

      const ranges = mapLayoutToDeckColumns(columns.length, columnCount);
      const appliedColumns = [];
      for (let ci = 0; ci < columns.length; ci += 1) {
        if (this._stopping) return;
        const col = columns[ci];
        const deckColumns = ranges[ci] ?? [];
        const files = {};

        for (const [laneId, fileDef] of Object.entries(col.files)) {
          const winPath = await this._retryOp(
            `stage ad column ${ci} lane ${laneId}`,
            () => this.stager.stageAsset(fileDef.source, fileDef.name),
          );
          for (const slot of deckColumns) {
            await this.resolume.loadClip(laneId, slot, winPath);
          }

          const fileEntry = { name: fileDef.name };
          if (deckColumns.length > 0) {
            // Thumbnails are fetched once per unique ad file, not per deck
            // column instance, to avoid redundant Resolume API calls.
            const thumbnail = await this._fetchThumbnail(
              laneId,
              deckColumns[0],
            );
            if (thumbnail) fileEntry.thumbnail = thumbnail;
          }
          files[laneId] = fileEntry;
        }

        appliedColumns.push({ id: col.id, deckColumns, files });
      }

      this._appliedColumns = appliedColumns;
      await this._publishStatus("playing", null, lanes);
    } catch (err) {
      console.error(`Failed to load ad layout: ${err.message}`);
      this._appliedColumns = [];
      const lanes2 = await this._discoverComposition();
      await this._publishStatus("error", err, lanes2.lanes);
    }
  }

  async _fetchThumbnail(laneId, slot) {
    try {
      const png = await this.resolume.getClipThumbnail(laneId, slot);
      if (!png) return null;
      const converted = reencodeThumbnail(png, {
        maxDim: this.config.thumbnailMaxDim,
        quality: this.config.thumbnailQuality,
        maxBytes: this.config.thumbnailMaxBytes,
      });
      return converted?.dataUrl ?? null;
    } catch {
      return null;
    }
  }

  // -- Shutdown ----------------------------------------------------------------

  shutdown() {
    this._stopping = true;
    if (this._dbRef) {
      this._dbRef.off("value");
    }
  }
}
