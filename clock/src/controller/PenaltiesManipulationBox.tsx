import { useState } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";

import matchActions from "../actions/match";
import { formatMillisAsTime } from "../utils/timeUtils";
import { RootState } from "../types";

interface Penalty {
  key: string;
  atTimeElapsed: number;
  penaltyLength: number;
}

interface OwnProps {
  team: "home" | "away";
}

const teamToTimeoutKey = (team: string): string => `${team}2min`;

const translateTeam = (team: string): string =>
  ({ home: "Heima", away: "Úti" }[team] || team);

const MAX_TIMEOUTS_PER_TEAM = 4;

const mapStateToProps = (state: RootState, ownProps: OwnProps) => ({
  team: ownProps.team,
  penalties: (state.match as any)[teamToTimeoutKey(ownProps.team)] as Penalty[],
  started: state.match.started,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      addPenalty: matchActions.addPenalty,
      removePenalty: matchActions.removePenalty,
      addToPenalty: matchActions.addToPenalty,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

const PenaltiesManipulationBox = ({
  penalties,
  team,
  addPenalty,
  started,
  removePenalty,
  addToPenalty,
}: PropsFromRedux) => {
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
              addToPenalty(editingPenalty.key);
              setEditingPenalty(null);
            }}
          >
            Bæta við 2 mín
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => addPenalty({ team })}
        disabled={penalties.length >= MAX_TIMEOUTS_PER_TEAM || !!started}
        className="add-penalty"
      >
        {`2 mín - ${translateTeam(team)}`}
      </button>
    </div>
  );
};

export default connector(PenaltiesManipulationBox);
