import React from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import { VIEWS } from "../reducers/controller";

import controllerActions from "../actions/controller";
import matchActions from "../actions/match";
import TeamController from "./TeamController";
import ControlButton from "./ControlButton";
import { RootState } from "../types";

import "./MatchController.css";

const stateToProps = ({ match }: RootState) => ({ match });

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      selectView: controllerActions.selectView,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type MatchControllerProps = ConnectedProps<typeof connector>;

const MatchController: React.FC<MatchControllerProps> = ({
  match: { started, timeout },
  selectView,
  pauseMatch,
  startMatch,
}) => (
  <div className="match-controller">
    <TeamController team="home" started={started} />
    <div className="match-controller-box">
      <ControlButton
        className="yellow"
        big
        onClick={started ? pauseMatch : startMatch}
        disabled={!!timeout}
      >
        {started ? "Stop" : "Start"}
      </ControlButton>
      <ControlButton onClick={() => selectView(VIEWS.match)}>
        Leiðrétta
      </ControlButton>
    </div>
    <TeamController team="away" started={started} />
  </div>
);

export default connector(MatchController);
