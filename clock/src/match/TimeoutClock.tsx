import React, { useState, useCallback } from "react";

import { formatMillisAsTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { TIMEOUT_LENGTH } from "../constants";
import { useMatch } from "../contexts/FirebaseStateContext";

interface TimeoutClockProps {
  className: string;
}

const TimeoutClock: React.FC<TimeoutClockProps> = ({ className }) => {
  const { match, removeTimeout, buzz } = useMatch();
  const { timeout } = match;
  const [warningPlayed, setWarningPlayed] = useState(false);
  const [prevTimeout, setPrevTimeout] = useState(timeout);

  if (timeout !== prevTimeout) {
    setPrevTimeout(timeout);
    setWarningPlayed(false);
  }

  const updateTime = useCallback((): string | null => {
    if (!timeout) {
      return null;
    }
    const millisLeft = TIMEOUT_LENGTH - (Date.now() - timeout) + 1000;
    if (millisLeft <= 0) {
      buzz(true);
      // Allow us to update time first so we don't try state update on
      // unmounted clock.
      setTimeout(() => removeTimeout(), 10);
    } else if (!warningPlayed && millisLeft <= 10000) {
      setWarningPlayed(true);
      buzz(true);
    }
    return formatMillisAsTime(millisLeft);
  }, [timeout, removeTimeout, buzz, warningPlayed]);

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
