import React, { useCallback } from "react";
import { formatTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { useMatch } from "../contexts/FirebaseStateContext";

interface ClockProps {
  className: string;
}

const Clock: React.FC<ClockProps> = ({ className }) => {
  const { match, pauseMatch, buzz } = useMatch();
  const { started, halfStops, timeElapsed, showInjuryTime, countdown } = match;

  const halfStop = halfStops[0];

  const updateTime = useCallback((): string => {
    let milliSecondsElapsed = timeElapsed;
    if (started) {
      milliSecondsElapsed += Date.now() - started;
    }
    const secondsElapsed = Math.floor(milliSecondsElapsed / 1000);
    const minutesElapsed = Math.floor(secondsElapsed / 60);
    let minutes = showInjuryTime
      ? minutesElapsed
      : Math.min(minutesElapsed, halfStop ?? 0);
    let seconds;
    if (!showInjuryTime && halfStop && minutes >= halfStop && started) {
      seconds = 0;
      pauseMatch(true);
      buzz(true);
    } else {
      seconds = secondsElapsed % 60;
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
        pauseMatch();
      }
    }
    return formatTime(minutes, seconds);
  }, [
    started,
    halfStop,
    timeElapsed,
    pauseMatch,
    buzz,
    showInjuryTime,
    countdown,
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
