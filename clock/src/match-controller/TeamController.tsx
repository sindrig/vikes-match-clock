import React from "react";
import { useMatch } from "../contexts/FirebaseStateContext";
import { PENALTY_LENGTH } from "../constants";

import ControlButton from "./ControlButton";

interface TeamControllerProps {
  team: "home" | "away";
  started: number | null;
}

const TeamController: React.FC<TeamControllerProps> = ({ team, started }) => {
  const { addGoal, addPenalty, matchTimeout } = useMatch();

  return (
    <div
      className={`match-controller-box match-controller-box-${String(team)}`}
    >
      <ControlButton className="yellow" onClick={() => addGoal(team)}>
        Mark
      </ControlButton>
      <ControlButton
        className="red"
        onClick={() => addPenalty(team, crypto.randomUUID(), PENALTY_LENGTH)}
        disabled={!!started}
      >
        Brottvísun
      </ControlButton>
      <ControlButton className="green" onClick={() => matchTimeout(team)}>
        Leikhlé
      </ControlButton>
    </div>
  );
};

export default TeamController;
