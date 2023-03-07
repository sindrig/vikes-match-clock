import React from "react";
import { connect } from "react-redux";
import { matchPropType, viewPortPropType } from "../propTypes";

import Team from "../match/Team";
import Clock from "../match/Clock";
import TimeoutClock from "../match/TimeoutClock";
import AdImage from "../utils/AdImage";

import clubLogos from "../images/clubLogos";
import { SPORTS } from "../constants";
import buzzer from "../sounds/buzzersound.mp3";
import { IMAGE_TYPES } from "../controller/media";

import "./ScoreBoard.css";

const getTeam = (id, match) => {
  const name = match[`${id}Team`];
  const imageName = name.replace(/[ -.]/g, "").toLowerCase();
  return {
    image: clubLogos[imageName] || null,
    name,
    id,
  };
};

const ScoreBoard = ({ match, vp }) => (
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
    />
    <Team
      className="away"
      team={getTeam("away", match)}
      score={match.awayScore}
      penalties={match.away2min}
      timeouts={match.awayTimeouts}
    />
    {match.injuryTime ? (
      <div className="injury-time">
        <span>+{match.injuryTime}</span>
      </div>
    ) : null}
    <Clock className="clock matchclock" />
    {match.timeout ? <TimeoutClock className="clock timeoutclock" /> : null}
    {match.matchType === SPORTS.handball &&
      match.buzzer &&
      Date.now() - match.buzzer < 3000 &&
      Date.now() - match.buzzer >= 0 && <audio src={buzzer} autoPlay />}
  </div>
);

ScoreBoard.propTypes = {
  match: matchPropType.isRequired,
  vp: viewPortPropType.isRequired,
};

const stateToProps = ({ match, view: { vp } }) => ({ match, vp });

export default connect(stateToProps)(ScoreBoard);
