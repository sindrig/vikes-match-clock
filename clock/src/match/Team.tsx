import React from "react";
import { connect, ConnectedProps } from "react-redux";

import { Sports } from "../constants";
import TwoMinClock from "./TwoMinClock";
import { RootState, TwoMinPenalty } from "../types";
import "./RedCard.css";

interface OwnProps {
  score: number;
  className: string;
  team: {
    image?: string;
    name: string;
  };
  penalties: TwoMinPenalty[];
  timeouts: number;
  redCards: number;
}

const stateToProps = ({ match }: RootState) => ({ match });

const connector = connect(stateToProps);

type TeamProps = ConnectedProps<typeof connector> & OwnProps;

const Team: React.FC<TeamProps> = ({
  score,
  className,
  team,
  match: { matchType },
  penalties,
  timeouts,
  redCards,
}) => (
  <div className={`team ${String(className)}`}>
    {team.image && (
      <div className="img-wrapper">
        <img src={team.image} alt={String(team.name)} />
      </div>
    )}
    {redCards > 0 && (
      <div className="red-cards">
        {[...Array(redCards).keys()].map((i) => (
          <div className="red-card" key={String(i)} />
        ))}
      </div>
    )}
    <div className="team-name">
      {matchType === Sports.Handball && team.name}
    </div>
    <span className="score">{score}</span>
    <div className={`team-timeouts team-timeouts-${String(className)}`}>
      {[...Array(timeouts).keys()].map((i) => (
        <div key={String(i)} className="team-timeout">
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

export default connector(Team);
