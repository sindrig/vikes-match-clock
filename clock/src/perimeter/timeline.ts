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
}

export function createBaseTimeline(
  cueDurationMs = DEFAULT_CUE_DURATION_MS,
  cueCount = 0,
): BaseTimeline {
  let origin: number | null = null;
  return {
    get origin() {
      return origin;
    },
    cueDurationMs,
    cueCount,
    start: (now) => {
      origin = now;
    },
    stop: () => {
      origin = null;
    },
    cueIndex: (now) =>
      origin === null ? null : cueIndexAt(now, origin, cueDurationMs, cueCount),
    elapsed: (now) =>
      origin === null ? 0 : elapsedInCue(now, origin, cueDurationMs),
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
