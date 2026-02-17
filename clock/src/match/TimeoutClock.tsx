import React, { useState, useCallback, useRef, useEffect } from "react";

import { formatMillisAsTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { TIMEOUT_LENGTH } from "../constants";
import { useMatch } from "../contexts/FirebaseStateContext";

interface TimeoutClockProps {
  className: string;
}

const TimeoutClock: React.FC<TimeoutClockProps> = ({ className }) => {
  const { match, removeTimeout, buzz, getServerTime } = useMatch();
  const { timeout } = match;
  const [warningPlayed, setWarningPlayed] = useState(false);
  const [prevTimeout, setPrevTimeout] = useState(timeout);
  const hasFiredEnd = useRef(false);

  if (timeout !== prevTimeout) {
    setPrevTimeout(timeout);
    setWarningPlayed(false);
  }

  // Reset latch when timeout changes
  useEffect(() => {
    hasFiredEnd.current = false;
  }, [timeout]);

  const updateTime = useCallback((): string | null => {
    if (!timeout) {
      return null;
    }
    const millisLeft = TIMEOUT_LENGTH - (getServerTime() - timeout) + 1000;
    if (millisLeft <= 0) {
      if (!hasFiredEnd.current) {
        hasFiredEnd.current = true;
        buzz(true);
        // Allow us to update time first so we don't try state update on
        // unmounted clock.
        setTimeout(() => removeTimeout(), 10);
      }
    } else if (!warningPlayed && millisLeft <= 10000) {
      setWarningPlayed(true);
      buzz(true);
    }
    return formatMillisAsTime(millisLeft);
  }, [timeout, removeTimeout, buzz, warningPlayed, getServerTime]);

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
