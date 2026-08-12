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
import { compositionGrid } from "./resolume-preview.js";

const execFileAsync = promisify(execFile);

const VALID_OVERLAY_VERSIONS = new Set([1]);
const MAX_OVERLAY_COLUMNS = 20;
const MAX_DURATION_MS = 120_000;
const MIN_DURATION_MS = 100;
const ALLOWED_BUCKET = "vikes-match-clock-firebase.appspot.com";
const ALLOWED_GCS_PREFIX = "gs://";
const SAFE_FILENAME_RE = /^[A-Za-z0-9._ -]+$/;
// How long a cached GCS object generation is trusted before re-checking.
const METADATA_CACHE_TTL_MS = 60_000;

// -- Validation ----------------------------------------------------------------

function validateFileName(name) {
  if (!name || typeof name !== "string") return false;
  if (!SAFE_FILENAME_RE.test(name)) return false;
  if (name.length > 255) return false;
  const base = path.basename(name);
  if (!base || base !== name) return false;
  return true;
}

function validateGcsSource(source, options = {}) {
  if (!source || typeof source !== "string") return false;
  if (!source.startsWith(ALLOWED_GCS_PREFIX)) return false;
  const bucketAndPath = source.slice(ALLOWED_GCS_PREFIX.length);
  const slashIdx = bucketAndPath.indexOf("/");
  if (slashIdx < 0) return false;
  const bucketName = bucketAndPath.slice(0, slashIdx);
  if (bucketName !== ALLOWED_BUCKET) return false;
  const objectPath = bucketAndPath.slice(slashIdx + 1);
  if (!objectPath) return false;
  // Reject traversal and control characters in the object path.
  if (/\.\.|\p{Cc}/u.test(objectPath)) return false;

  const location = options.location;
  if (!location) return true;

  // Family 1 — legacy home-goal files under `{location}/perimeter/`.
  const goalPrefix = `${location}/perimeter/`;
  if (objectPath.startsWith(goalPrefix)) return true;

  // Family 2 — named media-pair files under
  // `{location}/perimeter-overlays/{pairId}/{48|40}/{filename}`. The target
  // folder must match the layer's configured folder (layer "2" -> "48",
  // layer "4" -> "40").
  const pairPrefix = `${location}/perimeter-overlays/`;
  if (!objectPath.startsWith(pairPrefix)) return false;
  const rest = objectPath.slice(pairPrefix.length);
  const parts = rest.split("/");
  if (parts.length !== 3) return false;
  const [pairId, targetFolder, filename] = parts;
  if (!pairId || !targetFolder || !filename) return false;
  if (options.targetFolder && targetFolder !== options.targetFolder) {
    return false;
  }
  return true;
}

export function validateOverlayDoc(data, configuredLayerIds, options = {}) {
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
  const location = options.location;
  const targetFolders = options.targetFolders || {};

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
      if (names.has(f.name)) {
        return {
          valid: false,
          reason: `column ${ci} duplicate filename ${f.name}`,
        };
      }
      names.add(f.name);
      if (
        !validateGcsSource(f.source, {
          location,
          targetFolder: targetFolders[key],
        })
      ) {
        return {
          valid: false,
          reason: `column ${ci} file ${key} invalid source`,
        };
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
    // Cache the last-seen GCS object generation per source so repeated
    // overlay triggers don't pay a metadata round trip every time.
    this._metadataCache = new Map(); // gcsUrl -> { generation, checkedAt }
    // remoteName -> generation already confirmed on the Windows host.
    this._confirmedRemote = new Map();
    // Track the last generation-suffixed remote name per base filename so we
    // can clean up the previous copy after a re-upload.
    this._remoteNameByBase = new Map(); // baseName -> last remote name
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

  // The current GCS object generation, cached for METADATA_CACHE_TTL_MS so
  // rapid re-triggers avoid the metadata round trip while re-uploads are
  // still picked up (the generation is re-fetched after the TTL expires).
  async _getGeneration(parsed) {
    const key = `${parsed.bucket}/${parsed.object}`;
    const cached = this._metadataCache.get(key);
    if (cached && Date.now() - cached.checkedAt < METADATA_CACHE_TTL_MS) {
      return cached.generation;
    }
    const [metadata] = await this.storage
      .bucket(parsed.bucket)
      .file(parsed.object)
      .getMetadata();
    const generation = String(metadata.generation || "0");
    this._metadataCache.set(key, { generation, checkedAt: Date.now() });
    return generation;
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

  // Returns the size of the remote file on the Windows host, or null when it
  // does not exist.
  async _remoteSize(remoteName) {
    const moveDir = this.config.overlayRemoteContentDir
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .replace(/\//g, "\\");
    try {
      const { stdout } = await execFileAsync("ssh", [
        ...this._sshArgs(),
        `${this.config.overlaySshUser}@${this.config.overlaySshHost}`,
        `@for %I in ("${moveDir}\\${remoteName}") do @echo %~zI`,
      ]);
      const size = Number.parseInt(stdout.trim(), 10);
      return Number.isInteger(size) && size >= 0 ? size : null;
    } catch {
      return null;
    }
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

    const generation = await this._getGeneration(parsed);
    const ext = path.extname(parsed.object);
    const cachedPath = path.join(cacheDir, `${cacheKey}-${generation}${ext}`);

    // Embed the GCS generation in the remote filename so same-size re-uploads
    // are still picked up (size-match alone would skip the copy).
    const baseName = path.basename(remoteName, path.extname(remoteName));
    const remoteExt = path.extname(remoteName);
    const generationRemoteName = `${baseName}-${generation}${remoteExt}`;

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

      await this.storage
        .bucket(parsed.bucket)
        .file(parsed.object)
        .download({ destination: cachedPath });
    }

    // Skip the SCP+move when the remote already holds this generation: a
    // 36 MB copy per goal is the bulk of the trigger latency. The
    // generation-suffixed name makes the confirmed-set check exact.
    if (this._confirmedRemote.get(generationRemoteName) !== generation) {
      const localSize = (await fs.stat(cachedPath)).size;
      const remoteSize = await this._remoteSize(generationRemoteName);
      if (remoteSize !== localSize) {
        await this.copyToWindows(cachedPath, generationRemoteName);
      }
      this._confirmedRemote.set(generationRemoteName, generation);

      // Best-effort delete the previous generation's remote file for the same
      // base name so stale copies don't accumulate on the Windows host.
      const prevRemote = this._remoteNameByBase.get(baseName);
      if (prevRemote && prevRemote !== generationRemoteName) {
        const moveDir = this.config.overlayRemoteContentDir
          .replace(/\\/g, "/")
          .replace(/\/+$/, "")
          .replace(/\//g, "\\");
        execFileAsync("ssh", [
          ...this._sshArgs(),
          `${this.config.overlaySshUser}@${this.config.overlaySshHost}`,
          `del /F /Q "${moveDir}\\${prevRemote}"`,
        ]).catch(() => {});
      }
      this._remoteNameByBase.set(baseName, generationRemoteName);
    }

    return `${this.config.overlayRemoteContentDir.replace(/\\+$/, "")}/${generationRemoteName.replace(/\\/g, "/")}`;
  }

  async copyToWindows(localPath, remoteName) {
    if (!validateFileName(remoteName)) {
      throw new Error(`unsafe remote filename: ${JSON.stringify(remoteName)}`);
    }

    const winDir = this.config.overlayRemoteContentDir
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    // scp accepts forward slashes; cmd's `move` does not, so the move command
    // uses a backslash version of the same path.
    const scpPath = `${winDir}/${remoteName}.part`;
    const moveDir = winDir.replace(/\//g, "\\");
    const moveTmpPath = `${moveDir}\\${remoteName}.part`;
    const moveFinalPath = `${moveDir}\\${remoteName}`;

    const sshArgs = this._sshArgs();

    await execFileAsync("scp", [
      ...sshArgs,
      localPath,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}:${scpPath}`,
    ]);

    await execFileAsync("ssh", [
      ...sshArgs,
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}`,
      `move /Y "${moveTmpPath}" "${moveFinalPath}"`,
    ]);

    return moveFinalPath;
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
      if (body !== null) {
        opts.headers = { "Content-Type": "text/plain" };
        opts.body = String(body);
      }
      const response = await fetch(url, opts);
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async _getJson(url) {
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

  async _put(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // Set the value of a composition parameter by its unique id (e.g. the
  // autopilot target) — the REST API exposes params by id without a path.
  async setAutopilot(paramId, value) {
    const base = this._baseUrl();
    await this._put(`${base}/parameter/by-id/${paramId}`, { value });
  }

  // Deck geometry for overlay playback: total column count, the currently
  // active column, the composition autopilot target (id + value) so the
  // daemon can pause and restore the auto-advance around a goal overlay, and
  // the columns that carry base content (used to pick a standby slot for a
  // double-buffered overlay swap).
  async getColumnGrid() {
    const composition = await this._getJson(`${this._baseUrl()}/composition`);
    return compositionGrid(composition, {
      overlayLayerIds: this.config.overlayLayerIds,
    });
  }

  async loadClip(layerId, clipSlot, filePath) {
    const base = this._baseUrl();
    // Resolume's clip `open` takes a `file:///` URL as a plain-text body.
    // Safety of the path is guaranteed by validateFileName which rejects
    // characters that would break or truncate a URL (#, ?, &, +, etc.).
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

  // Force a loaded clip's source to fill its canvas. Resolume exposes the
  // "Video → Resize" fit mode as a `video.resize` ParamChoice on each clip
  // ("Fill" / "Fit" / "Stretch" / "Original"); the daemon reads the clip back
  // to find that parameter's id and sets the mode via /parameter/by-id, the
  // same pattern used for the autopilot target and transport duration. This
  // guarantees the overlay fills its layer's native canvas edge-to-edge
  // regardless of the source's own dimensions or aspect ratio, instead of
  // leaving side gaps or cropping when a source is off-spec.
  async setClipFit(layerId, clipSlot, mode) {
    if (!mode || typeof mode !== "string") {
      throw new Error(
        `invalid clip fit ${JSON.stringify(mode)} for layer ${layerId} clip ${clipSlot}`,
      );
    }
    const base = this._baseUrl();
    const clip = await this._getJson(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}`,
    );
    const video = clip?.video;
    const resize = video?.resize;
    if (!resize || resize.id == null) {
      throw new Error(
        `no resize parameter on layer ${layerId} clip ${clipSlot}`,
      );
    }
    if (!Array.isArray(resize.options) || !resize.options.includes(mode)) {
      throw new Error(
        `resize option ${JSON.stringify(mode)} not available on layer ${layerId} clip ${clipSlot}`,
      );
    }
    await this._put(`${base}/parameter/by-id/${resize.id}`, { value: mode });

    // Setting a non-Original resize mode makes this Resolume version re-size
    // the clip's canvas to the layer output size (4608x192 for every layer
    // here), applied asynchronously right after the resize change, so a single
    // canvas write can be overwritten. That is wrong for the 40-screen layers
    // whose native canvas is 3840x192 — the stretch would overflow the LED
    // strip. Pin the canvas back to the layer's native size
    // (`PERIMETER_CLIP_CANVASES`, e.g. "3840x192") and re-verify until it
    // holds. Native-size media is unaffected.
    const canvas = this.config.clipCanvases?.[String(layerId)];
    if (!canvas || video?.width?.id == null || video?.height?.id == null) {
      return;
    }
    const match = /^(\d+)x(\d+)$/.exec(String(canvas));
    if (!match) return;
    const wantW = Number(match[1]);
    const wantH = Number(match[2]);
    const clipUrl = `${base}/composition/layers/${layerId}/clips/${clipSlot}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this._put(`${base}/parameter/by-id/${video.width.id}`, {
        value: wantW,
      });
      await this._put(`${base}/parameter/by-id/${video.height.id}`, {
        value: wantH,
      });
      // Let the resize reaction settle, then confirm the canvas held.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const re = await this._getJson(clipUrl);
      const w = re?.video?.width?.value;
      const h = re?.video?.height?.value;
      if (w === wantW && h === wantH) return;
    }
    throw new Error(
      `clip canvas did not hold at ${wantW}x${wantH} on layer ${layerId} clip ${clipSlot}`,
    );
  }

  async clearClip(layerId, clipSlot) {
    const base = this._baseUrl();
    await this._post(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}/clear`,
    );
  }

  // Set the clip's transition so it crossfades in over the previously
  // connected clip of the same layer. Resolume exposes this as the clip's
  // `transition` node (layer_determined + duration + blend_mode); the daemon
  // reads the clip back to find the parameter ids and disables layer
  // inheritance so the per-clip settings apply. Used to soften an overlay swap
  // into a dissolve instead of a hard cut.
  async setClipTransition(layerId, clipSlot, seconds, blendMode) {
    if (!(seconds >= 0) || typeof seconds !== "number") {
      throw new Error(`invalid transition seconds ${JSON.stringify(seconds)}`);
    }
    if (!blendMode || typeof blendMode !== "string") {
      throw new Error(`invalid transition blend ${JSON.stringify(blendMode)}`);
    }
    const base = this._baseUrl();
    const clip = await this._getJson(
      `${base}/composition/layers/${layerId}/clips/${clipSlot}`,
    );
    const transition = clip?.transition;
    if (
      !transition ||
      transition.layer_determined?.id == null ||
      transition.duration?.id == null ||
      transition.blend_mode?.id == null
    ) {
      throw new Error(
        `no transition params on layer ${layerId} clip ${clipSlot}`,
      );
    }
    await this._put(
      `${base}/parameter/by-id/${transition.layer_determined.id}`,
      {
        value: false,
      },
    );
    await this._put(`${base}/parameter/by-id/${transition.duration.id}`, {
      value: seconds,
    });
    await this._put(`${base}/parameter/by-id/${transition.blend_mode.id}`, {
      value: blendMode,
    });
  }

  async clearLayer(layerId) {
    const base = this._baseUrl();
    await this._post(`${base}/composition/layers/${layerId}/clear`);
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
    this._activeColumn = null;
    // True once an overlay clip is loaded and connected. The first load (or a
    // restart reconciliation) loads straight into the active column; every
    // later play — an overlay swap or the next column of a multi-column
    // overlay — double-buffers through a standby column so the old clip keeps
    // playing until the new one is connected (no gap where the base content
    // shows through).
    this._overlayLoaded = false;
    // The standby deck column most recently used for a double-buffered swap;
    // kept so a clear can also unload a standby clip that never cut over (e.g.
    // when a swap failed after staging).
    this._standbyColumn = null;
    this._autopilotFrozen = false;
    this._columnTimer = null;
    this._stopping = false;
    this._dbRef = null;
    this._statusRef = null;
    // Promise queue serializing concurrent overlay commands so a clear
    // cannot race an in-flight overlay start.
    this._processing = Promise.resolve();
  }

  // -- deck autopilot freeze ---------------------------------------------------
  //
  // The base content deck auto-advances columns on a ~20s timer (autopilot
  // "Play Next Column"). An overlay that only exists in one clip column would
  // vanish on the first transition, and mirroring the file into every column
  // made the trigger ~13s slower (one `open` per column). Instead the daemon
  // pauses the composition autopilot for the duration of the overlay so the
  // deck stays on the current column, and restores the autopilot target on
  // clear. The original target value is persisted to the cache dir so a
  // daemon restart during an overlay still restores the correct value.

  _autopilotRestorePath() {
    return path.join(this.config.overlayCacheDir, "overlay-autopilot.json");
  }

  async _readAutopilotRestore() {
    try {
      const raw = await fs.readFile(this._autopilotRestorePath(), "utf8");
      const parsed = JSON.parse(raw);
      return parsed &&
        typeof parsed.id === "number" &&
        typeof parsed.value === "string"
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  async _writeAutopilotRestore(record) {
    await fs.mkdir(this.config.overlayCacheDir, { recursive: true });
    await fs.writeFile(
      this._autopilotRestorePath(),
      JSON.stringify(record),
      "utf8",
    );
  }

  async _deleteAutopilotRestore() {
    await fs.unlink(this._autopilotRestorePath()).catch(() => {});
  }

  // True while the deck autopilot is frozen for an active overlay. Reads the
  // persisted restore record (not the in-memory flag) so it stays correct
  // across a daemon restart, when the record survives but `_autopilotFrozen`
  // resets. Used by the perimeter controller to avoid unpausing the deck
  // under a live goal celebration.
  async isAutopilotFrozen() {
    try {
      await fs.access(this._autopilotRestorePath());
      return true;
    } catch {
      return false;
    }
  }

  async _freezeDeck() {
    if (this._autopilotFrozen) return;
    const grid = await this.resolume.getColumnGrid();
    const target = grid?.autopilotTarget;
    if (!target || target.id == null) {
      throw new Error(
        "Could not read deck autopilot target; overlay cannot proceed",
      );
    }
    // Preserve the ORIGINAL autopilot value across daemon restarts: a prior
    // freeze (from a crashed run) may already have persisted it, and the live
    // value would now read "Off".
    const saved = await this._readAutopilotRestore();
    if (!saved) {
      await this._writeAutopilotRestore({
        id: target.id,
        value: target.value,
      });
    }
    await this.resolume.setAutopilot(target.id, "Off");
    this._autopilotFrozen = true;
    console.log("Deck autopilot paused for overlay");
  }

  async _unfreezeDeck() {
    const saved = await this._readAutopilotRestore();
    if (saved && saved.id != null) {
      try {
        await this.resolume.setAutopilot(saved.id, saved.value);
        console.log("Deck autopilot restored");
      } catch (err) {
        console.error(`Failed to restore deck autopilot: ${err.message}`);
      }
    }
    await this._deleteAutopilotRestore();
    this._autopilotFrozen = false;
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
          console.error(
            `${description} failed after ${OVERLAY_MAX_RETRIES} attempts: ${err.message}`,
          );
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
      this._processing = this._processing.then(() =>
        this._handleSnapshot(snapshot.val()),
      );
    });
    console.log(`Overlay control listening on: ${this.config.overlayPath}`);
  }

  _locationFromPath() {
    const parts = (this.config.overlayPath || "").split("/");
    return parts.length >= 2 ? parts[1] : null;
  }

  async _handleSnapshot(data) {
    const result = validateOverlayDoc(data, this.config.overlayLayerIds, {
      location: this._locationFromPath(),
      targetFolders: this.config.overlayLayerTargetFolders,
    });
    if (!result.valid) {
      const reason = result.reason || "unknown";
      console.warn(`Ignoring invalid overlay document: ${reason}`);
      this._publishError(`Invalid overlay: ${reason}`);
      return;
    }
    if (result.clear) {
      console.log("Overlay clear command received");
      await this._handleClear();
      return;
    }
    const doc = result.doc;
    if (doc.id === this._currentId) return;
    console.log(`New overlay command: ${doc.id}`);
    await this._startOverlay(doc);
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
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      try {
        if (clipSlot === undefined) {
          // No reserved slot configured — fall back to clearing the whole layer.
          await this.resolume.clearLayer(layerId);
        } else {
          // Unload the overlay clip so Resolume releases the file handle;
          // otherwise a later re-staging move would be denied.
          await this.resolume.clearClip(layerId, clipSlot);
          if (this._activeColumn && this._activeColumn !== clipSlot) {
            await this.resolume.clearClip(layerId, this._activeColumn);
          }
          // A double-buffered swap that failed after staging may leave a clip
          // loaded in the standby column — unload it too so no overlay-layer
          // slot lingers loaded.
          if (
            this._standbyColumn &&
            this._standbyColumn !== clipSlot &&
            this._standbyColumn !== this._activeColumn
          ) {
            await this.resolume.clearClip(layerId, this._standbyColumn);
          }
        }
      } catch (err) {
        console.error(
          `Failed to clear overlay layer ${layerId}: ${err.message}`,
        );
      }
    }
    await this._unfreezeDeck();
    this._overlayLoaded = false;
    this._standbyColumn = null;
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

    // Pause the deck autopilot before loading so the base content cannot
    // advance away from the column the overlay will play in.
    try {
      await this._freezeDeck();
    } catch (err) {
      console.error(`Failed to freeze deck autopilot: ${err.message}`);
      await this._publishStatus("error", 0, err);
      // Reset _currentId so a re-trigger of the same doc proceeds.
      this._currentId = null;
      return;
    }
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

    // Read the active column ONCE so _stageAndLoadColumn and _triggerColumn
    // agree on the same slot (prevents the trigger connecting an empty slot
    // if the active column changes between the two reads).
    const grid = await this.resolume.getColumnGrid().catch(() => null);
    const activeColumn =
      grid?.activeColumn && grid.activeColumn >= 1
        ? grid.activeColumn
        : undefined;
    this._activeColumn = activeColumn;

    // When an overlay is already playing — a swap to a different overlay doc,
    // or advancing to the next column of the same multi-column overlay —
    // double-buffer: stage and load the new clip into a standby column while
    // the old clip keeps playing, then cut over once the new clip is ready.
    // This eliminates the gap where the old overlay is cleared but the new one
    // is still downloading/loading (the base ad would show through). The very
    // first load (or a restart reconciliation) has nothing playing, so it uses
    // the active column directly as before.
    const isSwap = this._overlayLoaded;
    const standbyColumn = isSwap
      ? this._pickStandbyColumn(activeColumn, grid)
      : null;
    const targetSlot = standbyColumn ?? activeColumn;
    this._standbyColumn = standbyColumn;

    try {
      await this._publishStatus("downloading", colIdx);
      await this._retryOp(`stage column ${colIdx}`, () =>
        this._stageAndLoadColumn(
          col,
          targetSlot,
          standbyColumn !== null && standbyColumn !== activeColumn,
        ),
      );
    } catch (err) {
      console.error(`Failed to stage/load column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    try {
      await this._publishStatus("loading", colIdx);
      await this._retryOp(`trigger column ${colIdx}`, () =>
        this._triggerColumn(col, targetSlot),
      );
    } catch (err) {
      console.error(`Failed to trigger column ${colIdx}: ${err.message}`);
      await this._publishStatus("error", colIdx, err);
      return;
    }

    // The new clip is now connected (crossfading in if configured). Give the
    // transition time to finish before releasing the old clip's file handle so
    // the fade is not cut short, then unload the old slot (Resolume holds the
    // file open; a later re-staging move would otherwise be denied).
    if (
      standbyColumn !== null &&
      activeColumn &&
      standbyColumn !== activeColumn
    ) {
      if (this.config.overlayTransitionMs > 0) {
        await this._sleep(this.config.overlayTransitionMs + 200);
      }
      await this._clearOverlaySlot(activeColumn);
    }
    this._standbyColumn = null;
    this._activeColumn = targetSlot;
    this._overlayLoaded = true;

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

  // Pick a standby deck column for a double-buffered swap: a column different
  // from the one the old overlay plays in, preferring a column with base
  // content so the deck resumes on content after the overlay clears. Returns
  // null when no spare column exists (single-column deck).
  _pickStandbyColumn(activeColumn, grid) {
    const columnCount = grid?.columnCount || 0;
    if (columnCount < 2 || !activeColumn || activeColumn < 1) return null;
    const base = Array.isArray(grid?.baseContentColumns)
      ? grid.baseContentColumns
      : [];
    const preferred = base.find((c) => c !== activeColumn);
    if (preferred !== undefined) return preferred;
    for (let c = 1; c <= columnCount; c += 1) {
      if (c !== activeColumn) return c;
    }
    return null;
  }

  // Best-effort unload of an overlay clip slot across every overlay layer
  // (releases the file handle Resolume holds open). Failures are logged only.
  async _clearOverlaySlot(slot) {
    for (const layerId of this.config.overlayLayerIds) {
      try {
        await this.resolume.clearClip(layerId, slot);
      } catch (err) {
        console.error(
          `Failed to clear overlay slot ${slot} on layer ${layerId}: ${err.message}`,
        );
      }
    }
  }

  // Force the loaded overlay clip to fill its canvas (Video → Resize →
  // Stretch) so a source with the wrong aspect ratio can never leave side
  // gaps on the LED strip. Best-effort: a failure is logged and swallowed —
  // the clip is already loaded and native-size media is unaffected.
  async _setClipFitBestEffort(layerId, clipSlot) {
    try {
      await this._retryOp(
        `set clip fit on layer ${layerId} slot ${clipSlot}`,
        () =>
          this.resolume.setClipFit(
            layerId,
            clipSlot,
            this.config.clipFit || "Stretch",
          ),
      );
    } catch (err) {
      console.error(
        `Failed to set clip fit on layer ${layerId} slot ${clipSlot}: ${err.message}`,
      );
    }
  }

  async _stageAndLoadColumn(col, targetSlot, crossfade = false) {
    const promises = [];
    for (const [layerId, fileDef] of Object.entries(col.files)) {
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      if (clipSlot === undefined) {
        throw new Error(`No clip slot configured for layer ${layerId}`);
      }
      // The deck is frozen for the duration of the overlay, so a single slot
      // (the currently active column, or a standby column during a swap) is
      // enough — loading one slot per layer keeps the trigger fast. Falls back
      // to the configured reference slot when the composition cannot be read.
      const slot = targetSlot ?? clipSlot;
      promises.push(
        (async () => {
          // Unload anything still in the slot: Resolume holds the previously
          // loaded file open, so the staging move would fail with "Access is
          // denied" unless the clip is cleared first. On a swap the target is
          // the standby column — not the column the old overlay is playing
          // in — so clearing it never interrupts the current overlay.
          await this.resolume.clearClip(layerId, slot);
          const winPath = await this.stager.stageAsset(
            fileDef.source,
            fileDef.name,
          );
          await this.resolume.loadClip(layerId, slot, winPath);
          await this._setClipFitBestEffort(layerId, slot);
          if (crossfade) {
            await this._setClipTransitionBestEffort(layerId, slot);
          }
        })(),
      );
    }
    await Promise.all(promises);
  }

  // Best-effort set a crossfade transition on a freshly loaded overlay clip so
  // that when it becomes connected it dissolves in over the previous overlay
  // instead of a hard cut. A failure is logged and swallowed — the double
  // buffer still swaps without a gap, it just cuts instead of crossfading.
  async _setClipTransitionBestEffort(layerId, clipSlot) {
    const seconds = this.config.overlayTransitionMs / 1000;
    if (!(seconds > 0)) return;
    try {
      await this._retryOp(
        `set clip transition on layer ${layerId} slot ${clipSlot}`,
        () =>
          this.resolume.setClipTransition(
            layerId,
            clipSlot,
            seconds,
            this.config.overlayTransitionBlend || "Dissolve",
          ),
      );
    } catch (err) {
      console.error(
        `Failed to set clip transition on layer ${layerId} slot ${clipSlot}: ${err.message}`,
      );
    }
  }

  async _triggerColumn(col, targetSlot) {
    const promises = [];
    for (const [layerId] of Object.entries(col.files)) {
      const clipSlot = this.config.overlayLayerClipColumns[layerId];
      if (clipSlot === undefined) continue;
      // Trigger the clip in the column the deck is on (the standby column
      // during a swap) so the overlay starts immediately (the deck is frozen
      // for the overlay).
      promises.push(this.resolume.connectClip(layerId, targetSlot ?? clipSlot));
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
