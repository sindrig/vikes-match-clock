import { useState, useEffect } from "react";
import moment from "moment";
import { useMatch } from "../contexts/FirebaseStateContext";

const MatchCountdownDisplay = () => {
  const { match } = useMatch();
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!match.matchStartTime) {
      setRemaining("");
      return;
    }

    const update = () => {
      const now = moment();
      const target = moment(match.matchStartTime, "HH:mm");
      if (!target.isValid()) {
        setRemaining("");
        return;
      }
      if (target <= now) {
        target.add(1, "days");
      }
      const diff = target.diff(now);
      if (diff <= 0) {
        setRemaining("00:00");
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
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
