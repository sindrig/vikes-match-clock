/**
 * Perimeter brightness control — Firebase-coordinated Vnnox LED brightness.
 *
 * Subscribes to `states/{location}/perimeter/brightness` written by the
 * authenticated controller, and applies each valid whole percentage (0..100)
 * to the configured Vnnox perimeter screen through the scoped VnnoxClient.
 * Daemon-owned outcomes are published to `perimeter/{location}/brightnessStatus`
 * (client-read-only) with a Firebase server timestamp.
 *
 * Model (mirrors the spec and design artifacts):
 *   * Commands are the requested percentage itself (an integer 0..100) at the
 *     brightness path; `null`/missing/non-integer/out-of-range values are
 *     inert — a missing command must never touch a live screen.
 *   * One valid request is processed at a time by a serialized worker that
 *     retains the newest pending request. A newer request supersedes an older
 *     one before a write has started; once the daemon has dispatched the
 *     scoped write call the sequence is irreversible and completes (verifies
 *     or restores) before the newer request is picked up — even a write call
 *     that *throws* (timeout, malformed response, etc.) may have already
 *     reached the hardware, so it is never retried and always routes through
 *     verification/restoration instead.
 *   * The daemon snapshots the current perimeter brightness before every
 *     write, writes only the configured screen GUID, then polls the screen
 *     read until it matches the request within a small integer tolerance.
 *     Only the snapshot stage retries transient failures; the write
 *     dispatch itself is the irreversible boundary.
 *   * On a started-write failure (write error or verification mismatch) the
 *     daemon best-effort restores the snapshot before publishing `failed`;
 *     restore failures are logged and appended to the safe error text.
 *   * A `pending` status write is a hardware precondition: if Firebase
 *     rejects it the command is aborted before any hardware I/O (terminal
 *     `applied`/`failed` status write failures are logged and rely on
 *     refresh-based republishing instead).
 *   * Vnnox handling is disabled unless PERIMETER_BRIGHTNESS_ENABLED=true and
 *     the required configuration is present; otherwise requests fail with a
 *     configuration-caused error instead of touching hardware.
 */

import { ServerValue } from "firebase-admin/database";
import {
  AUTH_ERROR_CODES,
  normalizeBrightness,
  parseBrightnessCommand,
  VnnoxClient,
} from "./vnnox.js";

export const BRIGHTNESS_PHASES = new Set(["pending", "applied", "failed"]);

// Validate that the enabled brightness feature has everything it needs to
// reach Vnnox and target the right screen. Returns a human error string or
// null when the configuration is complete.
export function validateBrightnessConfig(config) {
  for (const key of ["vnnoxPerimeterGuid", "vnnoxSerial"]) {
    const value = config[key];
    if (!value || typeof value !== "string" || value.length === 0) {
      return `Vnnox ${key} is not configured`;
    }
  }
  if (config.vnnoxPasswordSource === "env" && !config.vnnoxPassword) {
    return "Vnnox password source is env but PERIMETER_VNNOX_PASSWORD is not set";
  }
  if (config.vnnoxPasswordSource === "file" && !config.vnnoxPasswordFile) {
    return "Vnnox password source is file but PERIMETER_VNNOX_PASSWORD_FILE is not set";
  }
  if (
    config.vnnoxPasswordSource !== "env" &&
    config.vnnoxPasswordSource !== "file"
  ) {
    return `unknown Vnnox password source: ${JSON.stringify(config.vnnoxPasswordSource)}`;
  }
  return null;
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

export class BrightnessController {
  constructor(config) {
    this.config = config;
    this.client = new VnnoxClient(config);
    this._commandRef = null;
    this._statusRef = null;
    // The newest valid requested percentage awaiting processing (null when the
    // worker has nothing to do). Worker pickup clears it; a command that
    // arrives mid-flight becomes the pending replacement.
    this._requested = null;
    this._current = null;
    this._stopping = false;
    this._notifier = new Notifier();
    this._workerPromise = null;
    // Last published status, so a listener-refresh republish can self-heal a
    // silently lost write (the same pattern the ad-layout controller uses).
    this._lastStatus = null;
  }

  _safeError(err) {
    if (!err) return null;
    if (typeof err === "string") return err.slice(0, 500);
    if (err instanceof Error) {
      return (err.message || String(err)).slice(0, 500);
    }
    return String(err).slice(0, 500);
  }

  // -- Firebase ---------------------------------------------------------------

  attach(db) {
    this._commandRef = db.ref(this.config.brightnessPath);
    this._statusRef = db.ref(this.config.brightnessStatusPath);
    this._commandRef.on("value", (snapshot) => {
      const percent = parseBrightnessCommand(snapshot.val());
      if (percent === null) {
        console.log("Brightness command cleared or invalid; staying inert");
        return;
      }
      console.log(`New brightness command: ${percent}%`);
      this._requested = percent;
      this._notifier.notify();
    });
    console.log(
      `Brightness control listening on: ${this.config.brightnessPath}`,
    );
    void this._notifyConfigurationIssue();
  }

  // If the feature is enabled but the configuration is unusable, publish a
  // failed status that identifies configuration as the cause so operators see
  // it in the controller instead of a silent no-op. Never throws.
  async _notifyConfigurationIssue() {
    if (!this.config.brightnessEnabled) return;
    const issue = validateBrightnessConfig(this.config);
    if (issue) {
      await this._publishStatus(
        "failed",
        null,
        `Brightness not configured: ${issue}`,
      );
    }
  }

  // -- worker ------------------------------------------------------------------

  startWorker() {
    this._workerPromise = this._worker();
    return this._workerPromise;
  }

  async _worker() {
    // The loop picks up the newest pending command one at a time. When a new
    // command arrives during processing, _requested is set and the finished
    // iteration lets the loop process it next.
    while (!this._stopping) {
      if (this._requested !== null) {
        const target = this._requested;
        this._requested = null;
        this._current = target;
        await this._handleRequest(target);
        this._current = null;
        continue;
      }
      const wait = this._notifier.wait();
      if (this._requested !== null) continue;
      await wait;
    }
  }

  _supersededBy(target) {
    return this._requested !== null && this._requested !== target;
  }

  // Process one request from snapshot through write and verification. Any
  // terminal failure after the write has been dispatched triggers a
  // best-effort restore of the pre-write snapshot.
  async _handleRequest(target) {
    if (!this.config.brightnessEnabled) {
      console.log(`Brightness disabled; ignoring command ${target}%`);
      return;
    }
    const configIssue = validateBrightnessConfig(this.config);
    if (configIssue) {
      await this._publishStatus(
        "failed",
        target,
        `Brightness not configured: ${configIssue}`,
      );
      return;
    }
    // Persisting the `pending` status is a hardware precondition: if
    // Firebase rejects the write we cannot reliably reach an operator with
    // the eventual outcome, so refuse to touch the screen at all rather than
    // silently dispatching a command nobody can observe.
    const pendingPersisted = await this._publishStatus("pending", target, null);
    if (!pendingPersisted) {
      console.error(
        `Aborting brightness command ${target}%: pending status could not be persisted; refusing hardware I/O`,
      );
      return;
    }

    let snapshot = null;
    let backoff = this.config.initialBackoffMs;
    let backoffIteration = 0;

    // Snapshot-only retry phase. A newer command supersedes the current one
    // before the irreversible write dispatch. Only snapshot failures are
    // retried here — once writeBrightness is invoked below, the sequence is
    // irreversible and never re-enters this loop.
    while (!this._stopping) {
      if (this._supersededBy(target)) {
        console.log(
          `Brightness ${target}% superseded by ${this._requested}% before write`,
        );
        return;
      }
      try {
        snapshot = await this._snapshotBrightness();
        break;
      } catch (err) {
        if (this._supersededBy(target)) {
          console.log(
            `Brightness ${target}% superseded by ${this._requested}% during snapshot retry`,
          );
          return;
        }
        const retriesLeft = this.config.brightnessMaxRetries;
        if (backoffIteration >= retriesLeft) {
          await this._publishStatus(
            "failed",
            target,
            `Brightness snapshot failed: ${this._safeError(err)}`,
          );
          return;
        }
        console.warn(
          `Brightness snapshot attempt failed (${backoffIteration + 1}): ${err.message} — retrying in ${backoff}ms`,
        );
        await this._sleep(backoff);
        backoff = Math.min(backoff * 2, this.config.maxBackoffMs);
        backoffIteration += 1;
      }
    }
    if (this._stopping) return;

    // Irreversible stage: the write is about to be dispatched. `writeStarted`
    // is set before the call resolves (or even throws) because a write call
    // that throws — a timeout, a dropped connection, a malformed response —
    // may still have reached the hardware; treating it as retryable could
    // send a second, conflicting write on top of one the device already
    // applied. From here on, any failure (write or verification) always
    // routes through best-effort restoration; this stage never checks
    // `_stopping` or supersession so an in-flight write always completes.
    const writeStarted = true;
    let errorText;
    try {
      console.log(`Brightness: writing ${target}% to perimeter screen`);
      await this.client.writeBrightness(target);
      await this._verifyBrightness(target);
      console.log(`Brightness ${target}% applied and verified`);
      await this._publishStatus("applied", target, null, target);
      return;
    } catch (err) {
      errorText = `Brightness ${target}% failed: ${this._safeError(err)}`;
    }
    try {
      if (writeStarted && snapshot) {
        await this.client.restoreBrightness(snapshot);
        errorText += "; prior snapshot restored";
        console.log(`Brightness snapshot restored after failure`);
      }
    } catch (restoreErr) {
      errorText += `; snapshot restore failed: ${this._safeError(restoreErr)}`;
      console.error(
        `Brightness restore failed after ${target}% failure: ${restoreErr.message}`,
      );
    }
    await this._publishStatus("failed", target, errorText);
  }

  // Read the current perimeter screen brightness plus cabinet metadata for
  // diagnostics. Returns the normalized screen snapshot used for restoration.
  async _snapshotBrightness() {
    const screen = await this.client.readScreenBrightness();
    let cabinets = [];
    try {
      cabinets = await this.client.readCabinets();
    } catch (err) {
      console.warn(
        `Vnnox cabinet metadata unavailable (continuing with screen snapshot): ${err.message}`,
      );
    }
    if (cabinets.length > 0) {
      const percents = [];
      for (const cabinet of cabinets) {
        try {
          percents.push(
            normalizeBrightness(cabinet?.cabinetDisplayParam?.brightness)
              .percent,
          );
        } catch {
          // skip unreadable cabinets for the uniformity log
        }
      }
      const uniform =
        percents.length > 0 &&
        percents.every((p) => Math.abs(p - percents[0]) < 0.001);
      console.log(
        `Brightness snapshot: ${screen.percent}% (${screen.ratio}/${screen.ratioScale}); ${cabinets.length} cabinets (${uniform ? "uniform" : "mixed"})`,
      );
    } else {
      console.log(
        `Brightness snapshot: ${screen.percent}% (${screen.ratio}/${screen.ratioScale})`,
      );
    }
    return screen;
  }

  // Poll the screen read until it matches the requested percentage within the
  // configured integer tolerance. Throws when the attempts are exhausted.
  async _verifyBrightness(target) {
    const attempts = this.config.brightnessVerifyAttempts;
    const intervalMs = this.config.brightnessVerifyIntervalMs;
    const tolerance = this.config.brightnessVerifyTolerance;
    let lastPercent = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const read = await this.client.readScreenBrightness();
      lastPercent = read.percent;
      if (Math.abs(lastPercent - target) <= tolerance) {
        return;
      }
      if (attempt < attempts - 1) await this._sleep(intervalMs);
    }
    throw new Error(
      `verification mismatch: perimeter reads ${Number(lastPercent).toFixed(2)}%, requested ${target}% (tolerance ${tolerance}%)`,
    );
  }

  // -- status ------------------------------------------------------------------

  // Publishes the status document and returns whether Firebase accepted the
  // write. Callers that treat persistence as a hardware precondition (the
  // `pending` phase) must check the return value; terminal phases are
  // best-effort and rely on `republishStatus` to self-heal a lost write.
  async _publishStatus(phase, requestedPercent, error, appliedPercent) {
    if (!this._statusRef) return false;
    if (!BRIGHTNESS_PHASES.has(phase)) {
      console.error(`Refusing to publish unknown brightness phase: ${phase}`);
      return false;
    }
    const payload = {
      requestedPercent,
      phase,
      error: this._safeError(error),
      updatedAt: ServerValue.TIMESTAMP,
    };
    if (appliedPercent !== undefined && appliedPercent !== null) {
      payload.appliedPercent = appliedPercent;
    }
    this._lastStatus = { ...payload };
    try {
      await this._statusRef.set(payload);
      return true;
    } catch (err) {
      console.error(`Failed to publish brightness status: ${err.message}`);
      return false;
    }
  }

  // Re-publish the last status so a silently lost write self-heals on the
  // listener refresh. Never throws.
  async republishStatus() {
    if (!this._lastStatus || !this._statusRef) return;
    try {
      await this._statusRef.set({
        ...this._lastStatus,
        updatedAt: ServerValue.TIMESTAMP,
      });
    } catch (err) {
      console.error(`Failed to re-publish brightness status: ${err.message}`);
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -- shutdown -----------------------------------------------------------------

  // Stops accepting new commands and returns the worker's promise so callers
  // can await graceful drain. A command already past the write-dispatch
  // boundary is never interrupted — it always finishes verifying or
  // restoring before the worker loop observes `_stopping` and exits.
  shutdown() {
    this._stopping = true;
    if (this._commandRef) {
      this._commandRef.off("value");
    }
    this._notifier.notify();
    return this._workerPromise;
  }
}
