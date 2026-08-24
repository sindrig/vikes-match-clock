import React, { useCallback } from "react";

import { formatMillisAsTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { TIMEOUT_LENGTH } from "../constants";
import { useMatch } from "../contexts/FirebaseStateContext";

interface TimeoutClockProps {
  className: string;
}

// Render-only timeout clock. Timeout expiry (and the warning buzzer) is
// handled by the MatchLifecycle coordinator through a generation-conditional,
// freshness-gated action. This component only displays the remaining time.
const TimeoutClock: React.FC<TimeoutClockProps> = ({ className }) => {
  const { match, getServerTime } = useMatch();
  const { timeout } = match;

  const updateTime = useCallback((): string | null => {
    if (!timeout) {
      return null;
    }
    const millisLeft = TIMEOUT_LENGTH - (getServerTime() - timeout) + 1000;
    return formatMillisAsTime(Math.max(millisLeft, 0));
  }, [timeout, getServerTime]);

  return (
    <ClockBase
      updateTime={updateTime}
      isTimeNull={false}
      className={className}
      zeroTime={TIMEOUT_LENGTH}
      fontSizeMin="1.3rem"
      fontSizeMax="1.5rem"
    />
  );
};

export default TimeoutClock;
