import React from "react";
import { connect, ConnectedProps } from "react-redux";

import ControlButton from "./ControlButton";
import matchActions from "../actions/match";
import type { AppDispatch } from "../store";

interface OwnProps {
  team: string;
  started: number | null;
}

const dispatchToProps = (dispatch: AppDispatch, { team }: OwnProps) => ({
  goal: () => dispatch(matchActions.addGoal({ team })),
  penalty: () => dispatch(matchActions.addPenalty({ team })),
  timeout: () => dispatch(matchActions.matchTimeout({ team })),
});

const connector = connect(null, dispatchToProps);

type TeamControllerProps = ConnectedProps<typeof connector> & OwnProps;

const TeamController: React.FC<TeamControllerProps> = ({ goal, penalty, timeout, started, team }) => (
  <div className={`match-controller-box match-controller-box-${String(team)}`}>
    <ControlButton className="yellow" onClick={goal}>
      Mark
    </ControlButton>
    <ControlButton className="red" onClick={penalty} disabled={!!started}>
      Brottvísun
    </ControlButton>
    <ControlButton className="green" onClick={timeout}>
      Leikhlé
    </ControlButton>
  </div>
);

export default connector(TeamController);
