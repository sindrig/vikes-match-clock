import React, { useCallback } from "react";
import { formatTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { useMatch } from "../contexts/FirebaseStateContext";

interface ClockProps {
  className: string;
}

// Render-only match clock. Automatic progression (countdown completion,
// half-stops) is handled by the MatchLifecycle coordinator through
// generation-conditional, freshness-gated actions. This component NEVER
// mutates shared state; it only derives what to display from the current
// authoritative match state and the server time.
const Clock: React.FC<ClockProps> = ({ className }) => {
  const { match, getServerTime } = useMatch();
  const { started, halfStops, timeElapsed, injuryTimeDisplayMode, countdown } =
    match;

  const halfStop = halfStops[0];

  const updateTime = useCallback((): string => {
    let milliSecondsElapsed = timeElapsed;
    if (started) {
      milliSecondsElapsed += getServerTime() - started;
    }
    const secondsElapsed = Math.floor(milliSecondsElapsed / 1000);
    const minutesElapsed = Math.floor(secondsElapsed / 60);
    const halfStopReached = !!halfStop && minutesElapsed >= halfStop;
    let minutes;
    let seconds;
    if (injuryTimeDisplayMode === "stop") {
      minutes = Math.min(minutesElapsed, halfStop ?? 0);
      seconds = halfStopReached ? 0 : secondsElapsed % 60;
    } else {
      minutes = minutesElapsed;
      if (injuryTimeDisplayMode === "minutes" && halfStopReached) {
        seconds = 0;
      } else {
        seconds = secondsElapsed % 60;
      }
    }
    if (countdown) {
      seconds *= -1;
      minutes *= -1;
      if (seconds) {
        minutes -= 1;
      }
      if (minutes <= 0 && seconds <= 0) {
        minutes = 0;
        seconds = 0;
      }
    }
    return formatTime(minutes, seconds);
  }, [
    started,
    halfStop,
    timeElapsed,
    injuryTimeDisplayMode,
    countdown,
    getServerTime,
  ]);

  return (
    <ClockBase
      updateTime={updateTime}
      isTimeNull={!started && !timeElapsed}
      className={className}
    />
  );
};

export default Clock;
