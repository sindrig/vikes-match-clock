import { useState, useEffect } from "react";
import { formatTime } from "../utils/timeUtils";
import { useMatch } from "../contexts/FirebaseStateContext";

const formatRemainingMs = (ms: number): string => {
  if (ms <= 0) return formatTime(0, 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return formatTime(minutes, seconds);
};

const MatchCountdownDisplay = () => {
  const { match, getServerTime } = useMatch();
  const isActive = match.countdown && match.started > 0;

  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!isActive) return;

    const update = () =>
      setRemaining(formatRemainingMs(match.started - getServerTime()));
    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [isActive, match.started, getServerTime]);

  if (!isActive || !remaining) {
    return null;
  }

  return (
    <div className="match-countdown-display">
      <span className="match-countdown-time">{remaining}</span>
    </div>
  );
};

export default MatchCountdownDisplay;
