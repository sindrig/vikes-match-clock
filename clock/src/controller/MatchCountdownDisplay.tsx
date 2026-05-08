import { useState, useEffect } from "react";
import { msUntilMatchStart, formatTime } from "../utils/timeUtils";
import { useMatch } from "../contexts/FirebaseStateContext";

const computeRemaining = (matchStartTime: string): string => {
  const ms = msUntilMatchStart(matchStartTime);
  if (ms === null) return "";
  if (ms <= 0) return formatTime(0, 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return formatTime(minutes, seconds);
};

const MatchCountdownDisplay = () => {
  const { match } = useMatch();
  const [remaining, setRemaining] = useState(() =>
    match.matchStartTime ? computeRemaining(match.matchStartTime) : "",
  );

  useEffect(() => {
    if (!match.matchStartTime) return;

    const interval = setInterval(() => {
      setRemaining(computeRemaining(match.matchStartTime ?? ""));
    }, 1000);

    return () => clearInterval(interval);
  }, [match.matchStartTime]);

  if (!match.matchStartTime || !remaining) {
    return null;
  }

  return (
    <div className="match-countdown-display">
      <span className="match-countdown-time">{remaining}</span>
    </div>
  );
};

export default MatchCountdownDisplay;
