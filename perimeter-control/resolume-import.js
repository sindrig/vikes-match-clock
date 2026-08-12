/**
 * Perimeter Resolume deck import — one-shot, explicit command.
 *
 * The perimeter screens currently play a multi-column ad deck ("Efni") built
 * directly in Resolume, which is invisible in the controller's ad-layout
 * manager. This controller lets the operator import that deck into the
 * editable ad-layout system:
 *
 *   1. read the live Resolume composition,
 *   2. map each deck column position -> one ad-layout column (`files` keyed by
 *      the configured ad lanes),
 *   3. pull the deck clip files off the Windows host and upload any that are
 *      missing into Firebase Storage,
 *   4. write the generated layout to the desired `adLayout` path with a fresh
 *      revision (the existing AdLayoutController then stages and plays it),
 *   5. publish a result status.
 *
 * The import is one-shot and explicit: it only reacts to a write to the
 * import command path (`PERIMETER_IMPORT_PATH`) carrying
 * `{ commandId, command: "from-resolume" }`, dedupes by `commandId`, and never
 * re-imports on its own or loops. It deliberately leaves the command doc in
 * place (a retry needs a fresh commandId).
 *
 * NOTE on the desired path write: writing the desired `adLayout` path is a
 * deliberate one-shot exception to the "daemon never writes the desired path"
 * rule. It cannot self-loop because this controller only reacts to the
 * separate import command path.
 *
 * Per-column skips (missing lane clip, invalid filename, failed pull/upload)
 * are logged and skipped, never abort-all. Nothing is ever deleted from
 * Storage or from the Resolume host.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Storage } from "@google-cloud/storage";
import { ServerValue } from "firebase-admin/database";

import { MAX_AD_COLUMNS, validateAdLayout, validateFileName } from "./ad-layout.js";
import {
  ResolumeCompositionReader,
  extractClipSourcePath,
} from "./resolume-preview.js";

const execFileAsync = promisify(execFile);

const COMMAND_NAME = "from-resolume";
const MAX_STATUS_ERRORS = 20;

// Build an ad-layout document from a live Resolume composition. Each deck
// column position maps to one layout column; for every configured ad lane the
// clip at `layers[lane-1].clips[position-1]` becomes a `files[lane]` entry
// `{ name, source }`. A column is skipped (per-column, never abort-all) when a
// lane has no clip, the clip has no extractable file path, or the filename is
// invalid. `sources` maps each basename to its full path on the Resolume host
// so the caller can pull files that are missing from Storage.
export function buildAdLayoutFromComposition(composition, options) {
  const {
    laneIds,
    bucket,
    location,
    maxColumns = MAX_AD_COLUMNS,
  } = options || {};
  const layers = Array.isArray(composition?.layers) ? composition.layers : [];
  const rawColumns = Array.isArray(composition?.columns) ? composition.columns : [];
  const layerColumnCount = Math.max(
    0,
    ...layers.map((l) => (l && Array.isArray(l.clips) ? l.clips.length : 0)),
  );
  const columnCount = Math.max(rawColumns.length, layerColumnCount);

  const errors = [];
  const skipped = [];
  const sources = {}; // basename -> full source path on the Resolume host
  const columns = [];

  for (let pos = 1; pos <= columnCount; pos += 1) {
    if (columns.length >= maxColumns) {
      errors.push(
        `column ${pos}: capped at ${maxColumns} columns; remaining columns skipped`,
      );
      break;
    }
    const files = {};
    let skip = null;
    for (const laneId of laneIds) {
      const layerIndex = parseInt(laneId, 10) - 1;
      const layer = layers[layerIndex];
      const clip =
        layer && Array.isArray(layer.clips) ? layer.clips[pos - 1] : undefined;
      if (!clip || typeof clip !== "object") {
        skip = { laneId, reason: "no clip in this column" };
        break;
      }
      const src = extractClipSourcePath(clip);
      if (!src) {
        skip = { laneId, reason: "clip has no file path" };
        break;
      }
      const name = path.posix.basename(src.replace(/\\/g, "/"));
      if (!name || !validateFileName(name)) {
        skip = { laneId, reason: `invalid filename "${name}"` };
        break;
      }
      sources[name] = src;
      files[laneId] = {
        name,
        source: `gs://${bucket}/${location}/perimeter/${name}`,
      };
    }
    if (skip) {
      skipped.push({ column: pos, laneId: skip.laneId, reason: skip.reason });
      continue;
    }
    columns.push({ id: randomUUID(), files });
  }

  return { columns, skipped, errors, sources };
}

export class ResolumeImportController {
  constructor(config) {
    this.config = config;
    this.reader = new ResolumeCompositionReader(config);
    this.storage = new Storage({
      projectId: config.overlayProjectId,
      keyFilename: config.serviceAccountFile,
    });
    this._execFileAsync = execFileAsync;
    this._commandRef = null;
    this._desiredRef = null;
    this._statusRef = null;
    this._lastCommandId = null;
    // The dedupe record survives daemon restarts so a lingering command doc
    // (which is deliberately left in place) is never re-imported.
    this._lastCommandLoaded = this._readLastCommandId().then((id) => {
      this._lastCommandId = id;
    });
    this._processing = Promise.resolve();
    this._stopping = false;
  }

  // -- helpers --------------------------------------------------------------

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

  _location() {
    const parts = (this.config.adLayoutPath || "").split("/");
    return parts.length >= 2 ? parts[1] : null;
  }

  _lastCommandFile() {
    return path.join(this.config.overlayCacheDir, "import-last-command.json");
  }

  async _readLastCommandId() {
    try {
      const raw = await fs.readFile(this._lastCommandFile(), "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed.commandId === "string" ? parsed.commandId : null;
    } catch {
      return null;
    }
  }

  async _persistLastCommandId(commandId) {
    try {
      await fs.mkdir(this.config.overlayCacheDir, { recursive: true });
      await fs.writeFile(
        this._lastCommandFile(),
        JSON.stringify({ commandId }),
        "utf8",
      );
    } catch (err) {
      console.error(
        `Failed to persist import dedupe record: ${err.message}`,
      );
    }
  }

  async _ensureImportDir() {
    const dir = path.join(
      this.config.overlayCacheDir,
      "ad-layout-cache",
      "import",
    );
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async _gcsObjectExists(bucket, objectPath) {
    try {
      await this.storage.bucket(bucket).file(objectPath).getMetadata();
      return true;
    } catch (err) {
      if (err && err.code === 404) return false;
      throw err;
    }
  }

  // Pull one deck file off the Windows host and upload it to Storage at
  // `<location>/perimeter/<basename>`. Enforces PERIMETER_AD_MAX_FILE_BYTES.
  async _pullAndUpload(basename, remoteSourcePath) {
    // scp needs forward slashes on the remote path.
    const remotePath = remoteSourcePath.replace(/\\/g, "/");
    const localPath = path.join(await this._ensureImportDir(), basename);
    await this._execFileAsync("scp", [
      ...this._sshArgs(),
      `${this.config.overlaySshUser}@${this.config.overlaySshHost}:${remotePath}`,
      localPath,
    ]);

    const stat = await fs.stat(localPath);
    const maxBytes = this.config.adMaxFileBytes || 250 * 1024 * 1024;
    if (stat.size > maxBytes) {
      throw new Error(
        `file ${basename} is ${stat.size} bytes, over the ${maxBytes} byte limit`,
      );
    }

    const objectPath = `${this._location()}/perimeter/${basename}`;
    const buffer = await fs.readFile(localPath);
    await this.storage
      .bucket(this.config.adLayoutBucket)
      .file(objectPath)
      .save(buffer);
    console.log(`Import: uploaded ${objectPath} (${stat.size} bytes)`);
    return objectPath;
  }

  async _publishStatus(payload) {
    if (!this._statusRef) return;
    const body = {
      commandId: payload.commandId,
      phase: payload.phase,
      columnsImported: payload.columnsImported,
      columnsSkipped: payload.columnsSkipped,
      errors: payload.errors || [],
      updatedAt: ServerValue.TIMESTAMP,
    };
    try {
      await this._statusRef.set(body);
    } catch (err) {
      console.error(`Failed to publish import status: ${err.message}`);
    }
  }

  // -- orchestration --------------------------------------------------------

  async _runImport(commandId) {
    const lanes = this.config.adLaneIds;
    const bucket = this.config.adLayoutBucket;
    const location = this._location();
    const errors = [];
    const skipped = [];

    let composition;
    try {
      composition = await this.reader.readComposition();
    } catch (err) {
      throw new Error(`failed to read Resolume composition: ${err.message}`);
    }

    const built = buildAdLayoutFromComposition(composition, {
      laneIds: lanes,
      bucket,
      location,
    });
    skipped.push(...built.skipped);
    errors.push(...built.errors);

    // Ensure every referenced object exists in Storage, pulling the deck files
    // off the Windows host where missing. A failed pull/upload marks that file
    // (and thus its column) as skipped; the import never aborts wholesale.
    const confirmed = new Set();
    const failedBasenames = new Set();
    for (const col of built.columns) {
      for (const file of Object.values(col.files)) {
        const name = file.name;
        if (confirmed.has(name) || failedBasenames.has(name)) continue;
        try {
          const exists = await this._gcsObjectExists(
            bucket,
            `${location}/perimeter/${name}`,
          );
          if (!exists) {
            const remote = built.sources[name];
            if (!remote) {
              throw new Error(`no source path for ${name}`);
            }
            await this._pullAndUpload(name, remote);
          } else {
            console.log(`Import: reusing existing Storage object ${name}`);
          }
          confirmed.add(name);
        } catch (err) {
          failedBasenames.add(name);
          errors.push(`file ${name}: ${err.message}`);
          console.warn(
            `Import: skipping columns referencing ${name}: ${err.message}`,
          );
        }
      }
    }

    const importedColumns = built.columns.filter((col) =>
      Object.values(col.files).every((f) => !failedBasenames.has(f.name)),
    );
    if (built.columns.length - importedColumns.length > 0) {
      skipped.push({
        column: "mixed",
        laneId: null,
        reason: `${built.columns.length - importedColumns.length} column(s) skipped because their file pull/upload failed`,
      });
    }

    if (importedColumns.length === 0) {
      throw new Error(
        `nothing importable: ${built.columns.length} columns read, all skipped`,
      );
    }

    const doc = {
      version: 1,
      revision: randomUUID(),
      columns: importedColumns,
    };
    const validation = validateAdLayout(
      doc,
      lanes,
      bucket,
      location,
    );
    if (!validation.valid) {
      throw new Error(
        `generated ad layout is invalid: ${validation.reason}`,
      );
    }

    // Deliberate one-shot write to the desired path (see module docstring).
    if (this._desiredRef) {
      await this._desiredRef.set(doc);
    }
    console.log(
      `Import: published ${doc.columns.length} columns to ${this.config.adLayoutPath}`,
    );

    await this._publishStatus({
      commandId,
      phase: "done",
      columnsImported: doc.columns.length,
      columnsSkipped: skipped.length,
      errors: errors.slice(0, MAX_STATUS_ERRORS),
    });
  }

  // -- Firebase -------------------------------------------------------------

  attach(db) {
    this._commandRef = db.ref(this.config.importPath);
    this._desiredRef = db.ref(this.config.adLayoutPath);
    this._statusRef = db.ref(this.config.importStatusPath);
    this._commandRef.on("value", (snapshot) => {
      this._processing = this._processing.then(() =>
        this._handleSnapshot(snapshot.val()),
      );
    });
    console.log(`Import control listening on: ${this.config.importPath}`);
  }

  async _handleSnapshot(data) {
    if (data === null || data === undefined) return;
    if (typeof data !== "object") {
      console.warn(`Ignoring invalid import command: ${JSON.stringify(data)}`);
      return;
    }
    const commandId = typeof data.commandId === "string" ? data.commandId : null;
    if (!commandId || data.command !== COMMAND_NAME) {
      console.warn(`Ignoring invalid import command: ${JSON.stringify(data)}`);
      return;
    }
    await this._lastCommandLoaded;
    if (commandId === this._lastCommandId) {
      console.log(`Import command ${commandId} already processed`);
      return;
    }
    this._lastCommandId = commandId;
    await this._persistLastCommandId(commandId);
    console.log(`Import command received: ${commandId}`);
    try {
      await this._runImport(commandId);
    } catch (err) {
      console.error(`Import command ${commandId} failed: ${err.message}`);
      await this._publishStatus({
        commandId,
        phase: "error",
        columnsImported: 0,
        columnsSkipped: 0,
        errors: [err.message],
      });
    }
  }

  // -- Shutdown -------------------------------------------------------------

  shutdown() {
    this._stopping = true;
    if (this._commandRef) {
      this._commandRef.off("value");
    }
  }
}
