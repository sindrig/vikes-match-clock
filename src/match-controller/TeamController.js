import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";

import ControlButton from "./ControlButton";
import matchActions from "../actions/match";

const TeamController = ({ goal, penalty, timeout, started, team }) => (
  <div className={`match-controller-box match-controller-box-${team}`}>
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

TeamController.propTypes = {
  goal: PropTypes.func.isRequired,
  penalty: PropTypes.func.isRequired,
  timeout: PropTypes.func.isRequired,
  started: PropTypes.number,
  team: PropTypes.string.isRequired,
};

TeamController.defaultProps = {
  started: null,
};

const dispatchToProps = (dispatch, { team }) => ({
  goal: () => dispatch(matchActions.addGoal({ team })),
  penalty: () => dispatch(matchActions.addPenalty({ team })),
  timeout: () => dispatch(matchActions.matchTimeout({ team })),
});

export default connect(null, dispatchToProps)(TeamController);
