import { connect, ConnectedProps } from "react-redux";

import Team from "../match/Team";
import Clock from "../match/Clock";
import TimeoutClock from "../match/TimeoutClock";
import AdImage from "../utils/AdImage";

import clubLogos from "../images/clubLogos";
import { Sports } from "../constants";
import buzzer from "../sounds/buzzersound.mp3";
import { IMAGE_TYPES } from "../controller/media";
import { Match, RootState } from "../types";

import "./ScoreBoard.css";

const getTeam = (id: "home" | "away", match: Match) => {
  const name = match[`${id}Team`];
  return {
    image: (clubLogos as Record<string, string>)[name] || undefined,
    name,
  };
};

const stateToProps = ({ match, view: { vp } }: RootState) => ({ match, vp });

const connector = connect(stateToProps);

type ScoreBoardProps = ConnectedProps<typeof connector>;

const ScoreBoard = ({ match, vp }: ScoreBoardProps) => (
  <div
    className={`scoreboard scoreboard-${match.matchType} scoreboard-${vp.key}`}
  >
    <AdImage imageType={IMAGE_TYPES.smallAds} />
    <Team
      className="home"
      team={getTeam("home", match)}
      score={match.homeScore}
      penalties={match.home2min}
      timeouts={match.homeTimeouts}
      redCards={match.homeRedCards ?? 0}
    />
    <Team
      className="away"
      team={getTeam("away", match)}
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
    {match.matchType === Sports.Handball &&
      match.buzzer &&
      Date.now() - match.buzzer < 3000 &&
      Date.now() - match.buzzer >= 0 && <audio src={buzzer} autoPlay />}
  </div>
);

export default connector(ScoreBoard);
