import { Match, ControllerState } from "../types";

// Conditional automatic-transition primitives.
//
// Every automatic lifecycle event (countdown completion, half-stop, timeout
// expiry, penalty expiry, timed-asset completion) is expressed as a
// { precondition, transition } pair. The precondition pins the transition to
// the exact authoritative generation the caller observed, using EXISTING
// identities only:
//
//   - countdown/half-stop: `started` + `countdown` + `halftimeCountdown`
//   - timeout: the `timeout` timestamp
//   - penalty: the penalty key + creation data (`atTimeElapsed`,
//     `penaltyLength`)
//   - timed asset: the current asset identity + active queue
//
// A precondition that fails against current authoritative state means the
// transition is obsolete (a newer generation started) and MUST leave state
// unchanged. Duplicate attempts from several current controllers are harmless:
// the first changes the state and later attempts fail their precondition.
//
// These functions are pure and unit-testable; the CAS + audit execution lives
// in FirebaseStateContext.

export interface CountdownCompletionObservation {
  started: number;
  countdown: boolean;
  halftimeCountdown: boolean;
}

export function countdownCompletionPrecondition(
  observed: CountdownCompletionObservation,
): (prev: Match) => boolean {
  return (prev) =>
    prev.countdown === observed.countdown &&
    prev.halftimeCountdown === observed.halftimeCountdown &&
    prev.started === observed.started;
}

export interface HalfStopObservation {
  started: number;
  halfStopBoundaryMinutes: number;
}

export function halfStopPrecondition(
  observed: HalfStopObservation,
): (prev: Match) => boolean {
  return (prev) =>
    prev.started === observed.started &&
    !prev.countdown &&
    !!prev.halfStops[0] &&
    prev.halfStops[0] === observed.halfStopBoundaryMinutes;
}

export interface TimeoutExpiryObservation {
  timeout: number;
}

export function timeoutExpiryPrecondition(
  observed: TimeoutExpiryObservation,
): (prev: Match) => boolean {
  return (prev) => prev.timeout === observed.timeout;
}

export interface PenaltyExpiryObservation {
  key: string;
  atTimeElapsed: number;
  penaltyLength: number;
}

export function penaltyExpiryPrecondition(
  observed: PenaltyExpiryObservation,
): (prev: Match) => boolean {
  return (prev) => {
    const hasMatching = (penalties: Match["home2min"]) =>
      penalties.some(
        (p) =>
          p.key === observed.key &&
          p.atTimeElapsed === observed.atTimeElapsed &&
          p.penaltyLength === observed.penaltyLength,
      );
    return hasMatching(prev.home2min) || hasMatching(prev.away2min);
  };
}

export interface TimedAssetCompletionObservation {
  assetKey: string;
  time: number | null;
  activeQueueId: string | null;
  playing: boolean;
}

export function timedAssetCompletionPrecondition(
  observed: TimedAssetCompletionObservation,
): (prev: ControllerState) => boolean {
  return (prev) => {
    const current = prev.currentAsset;
    return (
      !!current &&
      current.asset.key === observed.assetKey &&
      current.time === observed.time &&
      prev.activeQueueId === observed.activeQueueId &&
      prev.playing === observed.playing
    );
  };
}

// Transition derivations -----------------------------------------------------

// Countdown completion: a pre-match countdown simply stops; a halftime
// countdown advances to the next period (paused at the boundary).
export function countdownCompletionTransition(observed: {
  halftimeCountdown: boolean;
}): (prev: Match) => Match {
  return (prev) => {
    const next: Match = {
      ...prev,
      started: 0,
      countdown: false,
      halftimeCountdown: false,
    };
    if (observed.halftimeCountdown) {
      next.timeElapsed = (next.halfStops[0] ?? 0) * 60 * 1000;
      if (next.halfStops.length > 1) {
        next.halfStops = next.halfStops.slice(1);
      }
    }
    return next;
  };
}

// Half-stop with injury-time "stop" mode: pause at the period boundary.
export function halfStopTransition(observed: {
  halfStopBoundaryMinutes: number;
}): (prev: Match) => Match {
  return (prev) => {
    const next: Match = {
      ...prev,
      started: 0,
      timeElapsed: observed.halfStopBoundaryMinutes * 60 * 1000,
    };
    if (next.halfStops.length > 1) {
      next.halfStops = next.halfStops.slice(1);
    }
    return next;
  };
}

export function timeoutExpiryTransition(): (prev: Match) => Match {
  return (prev) => ({ ...prev, timeout: 0 });
}

export function penaltyExpiryTransition(observed: {
  key: string;
}): (prev: Match) => Match {
  return (prev) => {
    const homeHasKey = prev.home2min.some((t) => t.key === observed.key);
    const awayHasKey = prev.away2min.some((t) => t.key === observed.key);
    return {
      ...prev,
      ...(homeHasKey && {
        home2min: prev.home2min.filter((t) => t.key !== observed.key),
      }),
      ...(awayHasKey && {
        away2min: prev.away2min.filter((t) => t.key !== observed.key),
      }),
    };
  };
}
