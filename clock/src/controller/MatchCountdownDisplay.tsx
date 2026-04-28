import { useState, useEffect } from "react";
import moment from "moment";
import { useMatch } from "../contexts/FirebaseStateContext";

const computeRemaining = (matchStartTime: string): string => {
  const now = moment();
  const target = moment(matchStartTime, "HH:mm");
  if (!target.isValid()) return "";
  if (target <= now) target.add(1, "days");
  const diff = target.diff(now);
  if (diff <= 0) return "00:00";
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
      <span className="match-countdown-label">Niðurtalning:</span>
      <span className="match-countdown-time">{remaining}</span>
    </div>
  );
};

export default MatchCountdownDisplay;
