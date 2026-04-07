import { useSyncExternalStore, useCallback, useRef, useEffect } from "react";

import Team from "../match/Team";
import Clock from "../match/Clock";
import TimeoutClock from "../match/TimeoutClock";
import AdImage from "../utils/AdImage";

import { Sports } from "../constants";
import buzzer from "../sounds/buzzersound.mp3";
import { IMAGE_TYPES } from "../controller/media";
import { Match } from "../types";
import { useMatch, useView } from "../contexts/FirebaseStateContext";
import { useClubLogo } from "../hooks/useClubLogo";

import "./ScoreBoard.css";

const getTeam = (id: "home" | "away", match: Match, getLogoUrl: (name: string) => string | undefined) => {
  const name = match[`${id}Team`];
  return {
    image: getLogoUrl(name),
    name,
  };
};

const BUZZER_DURATION = 3000;

function useBuzzerTimer(buzzerTimestamp: number | false | null): boolean {
  const listenersRef = useRef(new Set<() => void>());
  const showBuzzerRef = useRef(false);
  const { getServerTime } = useMatch();

  const subscribe = useCallback((callback: () => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback(() => showBuzzerRef.current, []);

  useEffect(() => {
    if (!buzzerTimestamp) {
      if (showBuzzerRef.current) {
        showBuzzerRef.current = false;
        listenersRef.current.forEach((cb) => cb());
      }
      return;
    }

    const now = getServerTime();
    const elapsed = now - buzzerTimestamp;

    if (elapsed >= 0 && elapsed < BUZZER_DURATION) {
      showBuzzerRef.current = true;
      listenersRef.current.forEach((cb) => cb());

      const timeout = setTimeout(() => {
        showBuzzerRef.current = false;
        listenersRef.current.forEach((cb) => cb());
      }, BUZZER_DURATION - elapsed);

      return () => clearTimeout(timeout);
    } else {
      if (showBuzzerRef.current) {
        showBuzzerRef.current = false;
        listenersRef.current.forEach((cb) => cb());
      }
    }
  }, [buzzerTimestamp, getServerTime]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

const ScoreBoard = () => {
  const { match } = useMatch();
  const {
    view: { vp },
  } = useView();

  const buzzerTimestamp =
    match.matchType === Sports.Handball ? match.buzzer : null;
  const showBuzzer = useBuzzerTimer(buzzerTimestamp);

  const homeLogoUrl = useClubLogo(match.homeTeam);
  const awayLogoUrl = useClubLogo(match.awayTeam);

  const getLogoUrl = useCallback((teamName: string): string | undefined => {
    if (teamName === match.homeTeam) return homeLogoUrl;
    if (teamName === match.awayTeam) return awayLogoUrl;
    return undefined;
  }, [homeLogoUrl, awayLogoUrl, match.homeTeam, match.awayTeam]);

  return (
    <div
      className={`scoreboard scoreboard-${match.matchType} scoreboard-${vp.key}`}
    >
      <AdImage imageType={IMAGE_TYPES.smallAds} />
      <Team
        className="home"
        team={getTeam("home", match, getLogoUrl)}
        score={match.homeScore}
        penalties={match.home2min}
        timeouts={match.homeTimeouts}
        redCards={match.homeRedCards ?? 0}
      />
      <Team
        className="away"
        team={getTeam("away", match, getLogoUrl)}
        score={match.awayScore}
        penalties={match.away2min}
        timeouts={match.awayTimeouts}
        redCards={match.awayRedCards ?? 0}
      />
      {match.injuryTime ? (
        <div className="injury-time">
          <span>+{match.injuryTime}</span>
        </div>
      ) : null}
      <Clock className="clock matchclock" />
      {match.timeout ? <TimeoutClock className="clock timeoutclock" /> : null}
      {showBuzzer && <audio src={buzzer} autoPlay />}
    </div>
  );
};

export default ScoreBoard;
