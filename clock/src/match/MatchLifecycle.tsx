import { useEffect, useRef, useState } from "react";
import { TIMEOUT_LENGTH } from "../constants";
import { useMatch, useController } from "../contexts/FirebaseStateContext";

// Automatic shared-state lifecycle coordinator.
//
// Rendering components (Clock, TimeoutClock, TwoMinClock, Asset) are read-only:
// they may display zero/expired state locally but must never mutate shared
// state merely because a component mounts, resumes, or a local timer elapsed.
// All automatic progression happens HERE, outside the renderers, through
// freshness-gated, generation-conditional (compare-and-set) actions:
//
//   - countdown completion (pre-match and halftime)
//   - half-stop at a period boundary (injury-time "stop" mode)
//   - timeout expiry (+ the 10s warning buzzer)
//   - penalty expiry
//   - timed asset completion
//
// Each transition is commit-aware and idempotent:
//
//   - it is attempted only while this client is write-eligible (freshness
//     barrier) — an ineligible attempt is skipped WITHOUT latching, so it is
//     retried automatically once the client resynchronizes;
//   - a per-generation in-flight guard prevents concurrent duplicate
//     submissions while a conditional (compare-and-set) write is pending;
//   - the per-generation latch is set only AFTER the conditional action
//     reports a committed (true) result, so an obsolete or failed attempt does
//     not permanently suppress a later retry for the same generation.
//
// A stale or duplicate attempt (including from another current controller) is
// rejected atomically by the compare-and-set precondition. This component
// renders nothing.
const MatchLifecycle = () => {
  const {
    match,
    getServerTime,
    completeCountdownIfCurrent,
    applyHalfStopIfCurrent,
    removeTimeoutIfCurrent,
    removePenaltyIfCurrent,
    buzz,
    writeEligible,
  } = useMatch();
  const { controller, completeAssetIfCurrent } = useController();
  const {
    started,
    timeElapsed,
    halfStops,
    injuryTimeDisplayMode,
    countdown,
    halftimeCountdown,
    timeout,
    home2min,
    away2min,
  } = match;

  // Time-dependent due-checks (countdown end, half-stop, timeout expiry,
  // timed asset completion) must re-evaluate as time passes even though match
  // state is unchanged. A 100ms tick drives those effects; the per-generation
  // latches and in-flight guards keep each transition idempotent and
  // commit-aware.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  const firedCountdown = useRef<string | null>(null);
  const inFlightCountdown = useRef<string | null>(null);

  const firedHalfStop = useRef<string | null>(null);
  const inFlightHalfStop = useRef<string | null>(null);

  const firedTimeout = useRef<number | null>(null);
  const firedTimeoutWarning = useRef<number | null>(null);
  const inFlightTimeout = useRef<number | null>(null);

  const firedPenalties = useRef<Set<string>>(new Set());
  const inFlightPenalties = useRef<Set<string>>(new Set());

  const firedAsset = useRef<string | null>(null);
  const inFlightAsset = useRef<string | null>(null);
  const assetGeneration = useRef<string | null>(null);
  const assetDueTime = useRef<number | null>(null);

  // Countdown completion (pre-match or halftime). The conditional action
  // rejects the transition if authoritative state no longer identifies this
  // countdown generation (e.g. an operator started the next period).
  useEffect(() => {
    if (!countdown) {
      firedCountdown.current = null;
      inFlightCountdown.current = null;
      return;
    }
    const generation = `${started}:${halftimeCountdown}`;
    if (firedCountdown.current === generation) return;
    if (inFlightCountdown.current === generation) return;
    if (!writeEligible) return;
    if (getServerTime() >= started) {
      inFlightCountdown.current = generation;
      void completeCountdownIfCurrent({
        started,
        countdown,
        halftimeCountdown,
      }).then((committed) => {
        inFlightCountdown.current = null;
        if (committed) firedCountdown.current = generation;
      });
    }
  }, [
    countdown,
    started,
    halftimeCountdown,
    getServerTime,
    completeCountdownIfCurrent,
    writeEligible,
    tick,
  ]);

  // Half-stop at a period boundary (injury-time "stop" mode). Buzzer fires
  // only when the conditional pause actually committed, so an obsolete
  // attempt cannot buzz a newer generation.
  useEffect(() => {
    if (!started || countdown) {
      firedHalfStop.current = null;
      inFlightHalfStop.current = null;
      return;
    }
    const halfStop = halfStops[0];
    if (!halfStop) return;
    const generation = `${started}:${halfStop}`;
    if (firedHalfStop.current === generation) return;
    if (inFlightHalfStop.current === generation) return;
    if (!writeEligible) return;
    const minutesElapsed = Math.floor(
      (timeElapsed + (getServerTime() - started)) / 60000,
    );
    if (minutesElapsed >= halfStop && injuryTimeDisplayMode === "stop") {
      inFlightHalfStop.current = generation;
      void applyHalfStopIfCurrent({
        started,
        halfStopBoundaryMinutes: halfStop,
      }).then((committed) => {
        inFlightHalfStop.current = null;
        if (committed) {
          firedHalfStop.current = generation;
          buzz(true);
        }
      });
    }
  }, [
    started,
    countdown,
    halfStops,
    timeElapsed,
    injuryTimeDisplayMode,
    getServerTime,
    applyHalfStopIfCurrent,
    buzz,
    writeEligible,
    tick,
  ]);

  // Timeout expiry (with the 10s warning buzzer), conditional on the exact
  // timeout still being active. Warning and expiry thresholds are derived from
  // the same remaining-time calculation as TimeoutClock (which displays one
  // extra second, `+1000`): warn once the displayed time reaches 00:10
  // (10000 >= remaining > 0) and clear/buzz once it reaches 00:00
  // (remaining <= 0). The warning is suppressed once the timeout has already
  // expired, so a transition retried after resync (when the timeout may have
  // run out while ineligible) fires only the expiry buzz, never a stale
  // warning followed by an expiry buzz.
  useEffect(() => {
    if (!timeout) {
      firedTimeout.current = null;
      firedTimeoutWarning.current = null;
      inFlightTimeout.current = null;
      return;
    }
    if (!writeEligible) return;
    const remaining = TIMEOUT_LENGTH - (getServerTime() - timeout) + 1000;
    if (
      firedTimeoutWarning.current !== timeout &&
      remaining <= 10000 &&
      remaining > 0
    ) {
      firedTimeoutWarning.current = timeout;
      buzz(true);
    }
    if (firedTimeout.current !== timeout && remaining <= 0) {
      if (inFlightTimeout.current === timeout) return;
      inFlightTimeout.current = timeout;
      void removeTimeoutIfCurrent({ timeout }).then((committed) => {
        inFlightTimeout.current = null;
        if (committed) {
          firedTimeout.current = timeout;
          buzz(true);
        }
      });
    }
  }, [
    timeout,
    getServerTime,
    removeTimeoutIfCurrent,
    buzz,
    writeEligible,
    tick,
  ]);

  // Penalty expiry, conditional on the exact penalty record still existing.
  // The penalty is removed when the remaining time reaches zero (`remaining <=
  // 0`), aligning authoritative removal with the render-only TwoMinClock,
  // which clamps its display to 00:00 once the penalty mathematically expires.
  useEffect(() => {
    if (!writeEligible) return;
    for (const penalty of [...(home2min ?? []), ...(away2min ?? [])]) {
      const id = `${penalty.key}:${penalty.atTimeElapsed}:${penalty.penaltyLength}`;
      if (firedPenalties.current.has(id)) continue;
      if (inFlightPenalties.current.has(id)) continue;
      const elapsed = started
        ? timeElapsed + (getServerTime() - started)
        : timeElapsed;
      const remaining =
        penalty.penaltyLength - (elapsed - penalty.atTimeElapsed);
      if (remaining <= 0) {
        inFlightPenalties.current.add(id);
        void removePenaltyIfCurrent({
          key: penalty.key,
          atTimeElapsed: penalty.atTimeElapsed,
          penaltyLength: penalty.penaltyLength,
        }).then((committed) => {
          inFlightPenalties.current.delete(id);
          if (committed) firedPenalties.current.add(id);
        });
      }
    }
  }, [
    home2min,
    away2min,
    started,
    timeElapsed,
    getServerTime,
    removePenaltyIfCurrent,
    writeEligible,
    tick,
  ]);

  // Timed asset completion, conditional on the exact current asset + queue
  // still being authoritative. The due time is anchored once per observed
  // generation (the moment this component first sees the asset current) and
  // preserved across resyncs, so an ineligible attempt at the due moment is
  // retried after eligibility returns WITHOUT restarting the timer, and a
  // stale renderer can never consume a queue or clear a newer current asset.
  useEffect(() => {
    const currentAsset = controller.currentAsset;
    if (!currentAsset?.time) {
      firedAsset.current = null;
      inFlightAsset.current = null;
      assetGeneration.current = null;
      assetDueTime.current = null;
      return;
    }
    const generation = `${currentAsset.asset.key}:${currentAsset.time}:${controller.activeQueueId}:${controller.playing}`;
    if (assetGeneration.current !== generation) {
      assetGeneration.current = generation;
      assetDueTime.current = getServerTime() + currentAsset.time * 1000;
      firedAsset.current = null;
      inFlightAsset.current = null;
    }
    if (firedAsset.current === generation) return;
    if (inFlightAsset.current === generation) return;
    if (!writeEligible) return;
    if (getServerTime() >= (assetDueTime.current ?? Infinity)) {
      inFlightAsset.current = generation;
      void completeAssetIfCurrent({
        assetKey: currentAsset.asset.key,
        time: currentAsset.time,
        activeQueueId: controller.activeQueueId,
        playing: controller.playing,
      }).then((committed) => {
        inFlightAsset.current = null;
        if (committed) firedAsset.current = generation;
      });
    }
  }, [
    controller.currentAsset,
    controller.activeQueueId,
    controller.playing,
    completeAssetIfCurrent,
    getServerTime,
    writeEligible,
    tick,
  ]);

  return null;
};

export default MatchLifecycle;
