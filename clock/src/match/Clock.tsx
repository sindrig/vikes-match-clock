import React, { useCallback, useRef, useEffect } from "react";
import { formatTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { useMatch } from "../contexts/FirebaseStateContext";

interface ClockProps {
  className: string;
}

const Clock: React.FC<ClockProps> = ({ className }) => {
  const { match, pauseMatch, buzz, getServerTime } = useMatch();
  const { started, halfStops, timeElapsed, injuryTimeDisplayMode, countdown } =
    match;

  const halfStop = halfStops[0];

  const hasFiredHalfStop = useRef(false);
  const hasFiredCountdownEnd = useRef(false);

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
      if (halfStopReached && started) {
        seconds = 0;
        if (!hasFiredHalfStop.current) {
          hasFiredHalfStop.current = true;
          pauseMatch(true);
          buzz(true);
        }
      } else {
        seconds = secondsElapsed % 60;
      }
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
        if (!hasFiredCountdownEnd.current) {
          hasFiredCountdownEnd.current = true;
          pauseMatch();
        }
      }
    }
    return formatTime(minutes, seconds);
  }, [
    started,
    halfStop,
    timeElapsed,
    pauseMatch,
    buzz,
    injuryTimeDisplayMode,
    countdown,
    getServerTime,
  ]);

  // Reset half-stop latch when match starts/stops
  useEffect(() => {
    hasFiredHalfStop.current = false;
  }, [started]);

  // Reset countdown-end latch when match starts/stops or countdown mode changes
  useEffect(() => {
    hasFiredCountdownEnd.current = false;
  }, [started, countdown]);

  return (
    <ClockBase
      updateTime={updateTime}
      isTimeNull={!started && !timeElapsed}
      className={className}
    />
  );
};

export default Clock;
