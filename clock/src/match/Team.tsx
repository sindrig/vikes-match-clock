import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";

import { matchPropType, twoMinPropType } from "../propTypes";
import { Sports } from "../constants";
import TwoMinClock from "./TwoMinClock";
import "./RedCard.css";

const Team = ({
  score,
  className,
  team,
  match: { matchType },
  penalties,
  timeouts,
  redCards,
}) => (
  <div className={`team ${className}`}>
    {team.image && (
      <div className="img-wrapper">
        <img src={team.image} alt={team.name} />
      </div>
    )}
    {redCards > 0 && (
      <div className="red-cards">
        {[...Array(redCards).keys()].map((i) => (
          <div className="red-card" key={i} />
        ))}
      </div>
    )}
    <div className="team-name">
      {matchType === Sports.Handball && team.name}
    </div>
    <span className="score">{score}</span>
    <div className={`team-timeouts team-timeouts-${className}`}>
      {[...Array(timeouts).keys()].map((i) => (
        <div key={i} className="team-timeout">
          &#8226;
        </div>
      ))}
    </div>
    <div className="penalties">
      {penalties.map(({ atTimeElapsed, key, penaltyLength }) => (
        <TwoMinClock
          atTimeElapsed={atTimeElapsed}
          key={key}
          uniqueKey={key}
          penaltyLength={penaltyLength}
        />
      ))}
    </div>
  </div>
);

Team.propTypes = {
  score: PropTypes.number.isRequired,
  className: PropTypes.string.isRequired,
  team: PropTypes.shape({
    image: PropTypes.string,
    name: PropTypes.string,
  }).isRequired,
  match: matchPropType.isRequired,
  penalties: PropTypes.arrayOf(twoMinPropType),
  timeouts: PropTypes.number.isRequired,
  redCards: PropTypes.number.isRequired,
};

Team.defaultProps = {
  penalties: [],
};

const stateToProps = ({ match }) => ({ match });

export default connect(stateToProps)(Team);
