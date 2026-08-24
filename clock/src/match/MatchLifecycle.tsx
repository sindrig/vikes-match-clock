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
// Each transition is latched once per observed generation and is idempotent: a
// stale or duplicate attempt (including from another current controller) is
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

  // Time-dependent due-checks (countdown end, half-stop, timeout expiry) must
  // re-evaluate as time passes even though match state is unchanged. A 100ms
  // tick drives those effects; the per-generation latches keep each
  // transition idempotent.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  const firedCountdown = useRef<string | null>(null);
  const firedHalfStop = useRef<string | null>(null);
  const firedTimeout = useRef<number | null>(null);
  const firedTimeoutWarning = useRef<number | null>(null);
  const firedPenalties = useRef<Set<string>>(new Set());
  const firedAsset = useRef<string | null>(null);

  // Countdown completion (pre-match or halftime). The conditional action
  // rejects the transition if authoritative state no longer identifies this
  // countdown generation (e.g. an operator started the next period).
  useEffect(() => {
    if (!countdown) {
      firedCountdown.current = null;
      return;
    }
    const generation = `${started}:${halftimeCountdown}`;
    if (firedCountdown.current === generation) return;
    if (getServerTime() >= started) {
      firedCountdown.current = generation;
      void completeCountdownIfCurrent(
        { started, countdown, halftimeCountdown },
        halfStops,
      );
    }
  }, [
    countdown,
    started,
    halftimeCountdown,
    halfStops,
    getServerTime,
    completeCountdownIfCurrent,
    tick,
  ]);

  // Half-stop at a period boundary (injury-time "stop" mode). Buzzer fires
  // only when the conditional pause actually committed, so an obsolete
  // attempt cannot buzz a newer generation.
  useEffect(() => {
    if (!started || countdown) {
      firedHalfStop.current = null;
      return;
    }
    const halfStop = halfStops[0];
    if (!halfStop) return;
    const generation = `${started}:${halfStop}`;
    if (firedHalfStop.current === generation) return;
    const minutesElapsed = Math.floor(
      (timeElapsed + (getServerTime() - started)) / 60000,
    );
    if (minutesElapsed >= halfStop && injuryTimeDisplayMode === "stop") {
      firedHalfStop.current = generation;
      void applyHalfStopIfCurrent({
        started,
        halfStopBoundaryMinutes: halfStop,
      }).then((committed) => {
        if (committed) buzz(true);
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
    tick,
  ]);

  // Timeout expiry (with the 10s warning buzzer), conditional on the exact
  // timeout still being active.
  useEffect(() => {
    if (!timeout) {
      firedTimeout.current = null;
      firedTimeoutWarning.current = null;
      return;
    }
    const elapsed = getServerTime() - timeout;
    if (
      firedTimeoutWarning.current !== timeout &&
      elapsed >= TIMEOUT_LENGTH - 10000
    ) {
      firedTimeoutWarning.current = timeout;
      buzz(true);
    }
    if (firedTimeout.current !== timeout && elapsed >= TIMEOUT_LENGTH) {
      firedTimeout.current = timeout;
      void removeTimeoutIfCurrent({ timeout }).then((committed) => {
        if (committed) buzz(true);
      });
    }
  }, [timeout, getServerTime, removeTimeoutIfCurrent, buzz, tick]);

  // Penalty expiry, conditional on the exact penalty record still existing.
  useEffect(() => {
    for (const penalty of [...(home2min ?? []), ...(away2min ?? [])]) {
      const id = `${penalty.key}:${penalty.atTimeElapsed}:${penalty.penaltyLength}`;
      if (firedPenalties.current.has(id)) continue;
      const elapsed = started
        ? timeElapsed + (getServerTime() - started)
        : timeElapsed;
      const remaining =
        penalty.penaltyLength - (elapsed - penalty.atTimeElapsed);
      if (remaining < 0) {
        firedPenalties.current.add(id);
        void removePenaltyIfCurrent({
          key: penalty.key,
          atTimeElapsed: penalty.atTimeElapsed,
          penaltyLength: penalty.penaltyLength,
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
    tick,
  ]);

  // Timed asset completion, conditional on the exact current asset + queue
  // still being authoritative. The timer lives here (not in the Asset
  // renderer) and is cleared whenever the current asset changes, so a stale
  // renderer can never consume a queue or clear a newer current asset.
  useEffect(() => {
    const currentAsset = controller.currentAsset;
    if (!currentAsset?.time) {
      firedAsset.current = null;
      return;
    }
    const generation = `${currentAsset.asset.key}:${currentAsset.time}:${controller.activeQueueId}:${controller.playing}`;
    if (firedAsset.current === generation) return;
    const timer = setTimeout(() => {
      firedAsset.current = generation;
      void completeAssetIfCurrent({
        assetKey: currentAsset.asset.key,
        time: currentAsset.time,
        activeQueueId: controller.activeQueueId,
        playing: controller.playing,
      });
    }, currentAsset.time * 1000);
    return () => clearTimeout(timer);
  }, [
    controller.currentAsset,
    controller.activeQueueId,
    controller.playing,
    completeAssetIfCurrent,
  ]);

  return null;
};

export default MatchLifecycle;
