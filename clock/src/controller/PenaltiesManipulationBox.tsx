import { useState } from "react";
import { formatMillisAsTime } from "../utils/timeUtils";
import { teamToStateKey, translateTeam } from "../utils/matchUtils";
import { useMatch } from "../contexts/FirebaseStateContext";
import { PENALTY_LENGTH } from "../constants";

interface Penalty {
  key: string;
  atTimeElapsed: number;
  penaltyLength: number;
}

interface OwnProps {
  team: "home" | "away";
}

const MAX_TIMEOUTS_PER_TEAM = 4;

const uuidv4 = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const PenaltiesManipulationBox = ({ team }: OwnProps) => {
  const { match, addPenalty, removePenalty, addToPenalty } = useMatch();
  const started = match.started;
  const penalties = match[
    teamToStateKey(team) as keyof typeof match
  ] as Penalty[];

  const [editingPenalty, setEditingPenalty] = useState<Penalty | null>(null);

  return (
    <div className="penalty-manipulation">
      {penalties.map((penalty) => {
        const { key, atTimeElapsed } = penalty;
        return (
          <div className="manipulate-penalty" key={key}>
            <button
              type="button"
              onClick={() => setEditingPenalty(penalty)}
              disabled={!!started}
            >
              {`Breyta: ${translateTeam(team)} (${formatMillisAsTime(
                atTimeElapsed,
              )})`}
            </button>
          </div>
        );
      })}
      {editingPenalty && (
        <div id="penalty-manipulation-box">
          <span>{`Breyta: ${translateTeam(team)} (${formatMillisAsTime(
            editingPenalty.atTimeElapsed,
          )})`}</span>
          <button
            onClick={() => {
              removePenalty(editingPenalty.key);
              setEditingPenalty(null);
            }}
          >
            Eyða
          </button>
          <button
            onClick={() => {
              addToPenalty(editingPenalty.key, PENALTY_LENGTH);
              setEditingPenalty(null);
            }}
          >
            Bæta við 2 mín
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => addPenalty(team, uuidv4(), PENALTY_LENGTH)}
        disabled={penalties.length >= MAX_TIMEOUTS_PER_TEAM || !!started}
        className="add-penalty"
      >
        {`2 mín - ${translateTeam(team)}`}
      </button>
    </div>
  );
};

export default PenaltiesManipulationBox;
