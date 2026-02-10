import React from "react";
import { Sports } from "../constants";
import TwoMinClock from "./TwoMinClock";
import { TwoMinPenalty } from "../types";
import { useMatch } from "../contexts/FirebaseStateContext";
import "./RedCard.css";

interface TeamProps {
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

const Team: React.FC<TeamProps> = ({
  score,
  className,
  team,
  penalties,
  timeouts,
  redCards,
}) => {
  const { match } = useMatch();
  const { matchType } = match;

  return (
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
};

export default Team;
