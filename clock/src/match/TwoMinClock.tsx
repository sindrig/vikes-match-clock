import React, { useState, useEffect, useCallback } from "react";
import { formatMillisAsTime } from "../utils/timeUtils";
import { useMatch } from "../contexts/FirebaseStateContext";

interface TwoMinClockProps {
  atTimeElapsed: number;
  penaltyLength: number;
  uniqueKey: string;
}

const TwoMinClock: React.FC<TwoMinClockProps> = ({
  atTimeElapsed,
  penaltyLength,
  uniqueKey,
}) => {
  const { match, removePenalty } = useMatch();
  const { started, timeElapsed } = match;
  const [time, setTime] = useState<string | null>(null);

  const updateTime = useCallback(() => {
    if (!started && !timeElapsed) {
      setTime(null);
      return;
    }
    let milliSecondsElapsed = timeElapsed - atTimeElapsed;
    if (started) {
      milliSecondsElapsed += Date.now() - started;
    }
    const milliSecondsLeft = penaltyLength - milliSecondsElapsed;
    if (milliSecondsLeft < 0) {
      removePenalty(uniqueKey);
    } else {
      setTime(formatMillisAsTime(milliSecondsLeft));
    }
  }, [
    started,
    timeElapsed,
    atTimeElapsed,
    penaltyLength,
    removePenalty,
    uniqueKey,
  ]);

  useEffect(() => {
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, [updateTime]);

  if (!started && !timeElapsed && time !== null) {
    setTime(null);
  }

  const displayedTime = time || formatMillisAsTime(penaltyLength);
  return <div className="penalty">{displayedTime}</div>;
};

export default TwoMinClock;
