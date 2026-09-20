export const DEFAULT_CUE_DURATION_MS = 20_000;

export function cueIndexAt(
  now: number,
  origin: number,
  cueDurationMs: number,
  cueCount: number,
): number | null {
  if (cueCount <= 0 || cueDurationMs <= 0) return null;
  const elapsed = Math.max(0, now - origin);
  return Math.floor(elapsed / cueDurationMs) % cueCount;
}

export function elapsedInCue(
  now: number,
  origin: number,
  cueDurationMs: number,
): number {
  if (cueDurationMs <= 0) return 0;
  const elapsed = Math.max(0, now - origin);
  return elapsed % cueDurationMs;
}

export interface BaseTimeline {
  origin: number | null;
  cueDurationMs: number;
  cueCount: number;
  start: (now: number) => void;
  stop: () => void;
  cueIndex: (now: number) => number | null;
  elapsed: (now: number) => number;
  // Advances the timeline so the next cue boundary lands exactly at `now`,
  // keeping the cue duration intact. No-op when the timeline is not running
  // or has no cues. Returns whether the timeline moved.
  skipForward: (now: number) => boolean;
}

export function createBaseTimeline(
  cueDurationMs = DEFAULT_CUE_DURATION_MS,
  cueCount = 0,
): BaseTimeline {
  let origin: number | null = null;
  // The mutable playback parameters live in closure variables with
  // accessor properties: callers mutate `timeline.cueCount` /
  // `timeline.cueDurationMs` after construction, and plain property writes
  // would never be seen by the closures below.
  let durationMs = cueDurationMs;
  let count = cueCount;
  return {
    get origin() {
      return origin;
    },
    get cueDurationMs() {
      return durationMs;
    },
    set cueDurationMs(value: number) {
      durationMs = value;
    },
    get cueCount() {
      return count;
    },
    set cueCount(value: number) {
      count = value;
    },
    start: (now) => {
      origin = now;
    },
    stop: () => {
      origin = null;
    },
    cueIndex: (now) =>
      origin === null ? null : cueIndexAt(now, origin, durationMs, count),
    elapsed: (now) =>
      origin === null ? 0 : elapsedInCue(now, origin, durationMs),
    skipForward: (now) => {
      if (origin === null || durationMs <= 0 || count <= 1) return false;
      // Re-anchor the origin so that the elapsed time lands exactly on the
      // next multiple of the cue duration: the current cue ends now and
      // the following cue starts with a full fresh duration.
      const elapsed = Math.max(0, now - origin);
      origin = now - (Math.floor(elapsed / durationMs) + 1) * durationMs;
      return true;
    },
  };
}

export function nextCueBoundary(
  now: number,
  origin: number,
  cueDurationMs: number,
): number {
  const elapsed = Math.max(0, now - origin);
  return origin + (Math.floor(elapsed / cueDurationMs) + 1) * cueDurationMs;
}
