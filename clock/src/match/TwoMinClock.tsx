import React, { useState, useEffect, useCallback } from "react";
import { formatMillisAsTime } from "../utils/timeUtils";
import { useMatch } from "../contexts/FirebaseStateContext";

interface TwoMinClockProps {
  atTimeElapsed: number;
  penaltyLength: number;
  uniqueKey: string;
}

// Render-only penalty countdown clock. Penalty expiry is handled by the
// MatchLifecycle coordinator through a generation-conditional, freshness-gated
// action; this component only displays the remaining time.
const TwoMinClock: React.FC<TwoMinClockProps> = ({
  atTimeElapsed,
  penaltyLength,
  uniqueKey,
}) => {
  const { match, getServerTime } = useMatch();
  const { started, timeElapsed } = match;
  const [time, setTime] = useState<string | null>(null);

  const updateTime = useCallback(() => {
    if (!started && !timeElapsed) {
      setTime(null);
      return;
    }
    let milliSecondsElapsed = timeElapsed - atTimeElapsed;
    if (started) {
      milliSecondsElapsed += getServerTime() - started;
    }
    const milliSecondsLeft = Math.max(penaltyLength - milliSecondsElapsed, 0);
    setTime(formatMillisAsTime(milliSecondsLeft));
  }, [started, timeElapsed, atTimeElapsed, penaltyLength, getServerTime]);

  useEffect(() => {
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, [updateTime]);

  const displayedTime = time || formatMillisAsTime(penaltyLength);
  return (
    <div className="penalty" data-penalty-key={uniqueKey}>
      {displayedTime}
    </div>
  );
};

export default TwoMinClock;
