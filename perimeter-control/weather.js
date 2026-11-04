/**
 * Open-Meteo cloud-cover fetcher for automatic perimeter brightness.
 *
 * Polls the Open-Meteo forecast API (no API key, free for non-commercial
 * use — attribution required: "Weather data by Open-Meteo.com") for
 * `current.cloud_cover` with an hourly array covering interpolation and
 * short outages, caches the last good response, and exposes a never-throwing
 * snapshot for the brightness scheduler:
 *
 *   * On fetch failure the last cached cloud fraction is kept and its age
 *     exposed. After `staleAfterMs` (default 3 h) the fetcher falls back to
 *     a conservative c = 0.8 — dimming is safer than glaring over Reykjavík
 *     on an overcast day — and flags the snapshot stale.
 *   * If `current` is missing from an otherwise good response (short
 *     outage), the hourly point nearest to now covers it.
 *   * Each request has one deadline covering headers and JSON consumption.
 *     Stopping aborts the active request; late results cannot update the cache.
 *   * The daemon never blocks or throws on weather problems: worst case is
 *     a conservative fixed cloud fraction, best case is current cloud data.
 */

const DEFAULT_POLL_MS = 15 * 60_000; // Open-Meteo 15-min nowcast cadence
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_AFTER_MS = 3 * 60 * 60_000;
const DEFAULT_STALE_CLOUD_COVER = 0.8;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// Extract the cloud fraction (0..1) from a parsed Open-Meteo response:
// `current.cloud_cover` (0–100) is the primary input; the hourly array
// (nearest point to `atMs`) covers a response without `current`.
export function parseCloudCoverResponse(data, atMs) {
  if (!data || typeof data !== "object") return null;
  const current = data.current?.cloud_cover;
  if (typeof current === "number" && Number.isFinite(current)) {
    return { cloudCover: clamp01(current / 100), source: "current" };
  }
  const times = data.hourly?.time;
  const values = data.hourly?.cloud_cover;
  if (Array.isArray(times) && Array.isArray(values) && times.length > 0) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length && i < values.length; i += 1) {
      const at = Date.parse(times[i]);
      if (!Number.isFinite(at)) continue;
      const delta = Math.abs(at - atMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    const value = bestIndex >= 0 ? values[bestIndex] : undefined;
    if (typeof value === "number" && Number.isFinite(value)) {
      return { cloudCover: clamp01(value / 100), source: "hourly" };
    }
  }
  return null;
}

export class OpenMeteoCloudCover {
  constructor({
    url,
    fetchImpl = fetch,
    pollMs = DEFAULT_POLL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    staleCloudCover = DEFAULT_STALE_CLOUD_COVER,
    now = () => Date.now(),
  }) {
    this._url = url;
    this._fetch = fetchImpl;
    this._pollMs = pollMs;
    this._requestTimeoutMs = requestTimeoutMs;
    this._staleAfterMs = staleAfterMs;
    this._staleCloudCover = staleCloudCover;
    this._now = now;
    this._cached = null; // { cloudCover, fetchedAtMs, source }
    this._pollTimer = null;
    this._stopping = false;
    this._activePoll = null;
  }

  // Begins immediate polling and repeats every `pollMs`. Idempotent.
  start() {
    if (this._pollTimer) return;
    this._stopping = false;
    void this.poll();
    this._schedule();
  }

  stop() {
    this._stopping = true;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    // Release ownership synchronously so start() can poll immediately. The
    // old poll's finally must not release a restarted poll's guard.
    const activePoll = this._activePoll;
    this._activePoll = null;
    activePoll?.abort();
  }

  _schedule() {
    if (this._stopping || this._pollTimer) return;
    this._pollTimer = setTimeout(() => {
      this._pollTimer = null;
      if (this._stopping) return;
      void this.poll();
      this._schedule();
    }, this._pollMs);
  }

  // One fetch + cache update. Public so callers (and tests) can force an
  // immediate poll; never throws — a failure keeps the last cached value.
  async poll() {
    if (this._stopping || this._activePoll) return;
    const controller = new AbortController();
    this._activePoll = controller;
    let deadline;
    let onAbort;
    try {
      const cancelled = new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      deadline = setTimeout(() => {
        controller.abort(
          new Error(
            `Open-Meteo request timed out after ${this._requestTimeoutMs} ms`,
          ),
        );
      }, this._requestTimeoutMs);
      // Racing the entire operation also bounds providers that ignore the
      // signal. Only the owning poll may publish; detached work never does.
      const data = await Promise.race([
        (async () => {
          const response = await this._fetch(this._url, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return undefined;
          if (!response.ok) {
            throw new Error(`Open-Meteo returned HTTP ${response.status}`);
          }
          return response.json();
        })(),
        cancelled,
      ]);
      if (this._activePoll !== controller || controller.signal.aborted) return;
      const parsed = parseCloudCoverResponse(data, this._now());
      if (parsed) {
        this._cached = {
          cloudCover: parsed.cloudCover,
          fetchedAtMs: this._now(),
          source: parsed.source,
        };
        console.log(
          `Open-Meteo cloud cover: ${(parsed.cloudCover * 100).toFixed(0)}% (${parsed.source})`,
        );
      } else {
        console.warn(
          "Open-Meteo response had no usable cloud_cover; keeping last value",
        );
      }
    } catch (err) {
      // Keep the last cached value and expose its age; staleness handling
      // happens in snapshot(). The daemon never blocks or throws here.
      if (this._activePoll === controller) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `Open-Meteo fetch failed (keeping last value): ${message}`,
        );
      }
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener("abort", onAbort);
      if (this._activePoll === controller) this._activePoll = null;
    }
  }

  // The current cloud state: the cached fraction while fresh, the
  // conservative fallback (flagged stale) after `staleAfterMs` or when no
  // data was ever fetched. Never throws, never returns null.
  snapshot() {
    if (this._cached) {
      const ageMs = this._now() - this._cached.fetchedAtMs;
      if (ageMs >= 0 && ageMs <= this._staleAfterMs) {
        return {
          cloudCover: this._cached.cloudCover,
          ageMs,
          stale: false,
        };
      }
      return {
        cloudCover: this._staleCloudCover,
        ageMs,
        stale: true,
      };
    }
    return {
      cloudCover: this._staleCloudCover,
      ageMs: null,
      stale: true,
    };
  }
}
