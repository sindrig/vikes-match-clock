import React from "react";
import { useMatch } from "../contexts/FirebaseStateContext";
import { PENALTY_LENGTH } from "../constants";

import ControlButton from "./ControlButton";

interface TeamControllerProps {
  team: string;
  started: number | null;
}

const uuidv4 = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const TeamController: React.FC<TeamControllerProps> = ({ team, started }) => {
  const { addGoal, addPenalty, matchTimeout } = useMatch();
  const teamKey = team as "home" | "away";

  return (
    <div
      className={`match-controller-box match-controller-box-${String(team)}`}
    >
      <ControlButton className="yellow" onClick={() => addGoal(teamKey)}>
        Mark
      </ControlButton>
      <ControlButton
        className="red"
        onClick={() => addPenalty(teamKey, uuidv4(), PENALTY_LENGTH)}
        disabled={!!started}
      >
        Brottvísun
      </ControlButton>
      <ControlButton className="green" onClick={() => matchTimeout(teamKey)}>
        Leikhlé
      </ControlButton>
    </div>
  );
};

export default TeamController;
