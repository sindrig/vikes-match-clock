import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import matchActions from "../actions/match";
import { twoMinPropType } from "../propTypes";
import { formatMillisAsTime } from "../utils/timeUtils";

const teamToTimeoutKey = (team) => `${team}2min`;

const translateTeam = (team) => ({ home: "Heima", away: "Úti" }[team] || team);

const MAX_TIMEOUTS_PER_TEAM = 4;

const PenaltiesManipulationBox = ({
  penalties,
  team,
  addPenalty,
  started,
  removePenalty,
}) => (
  <div className="penalty-manipulation">
    {penalties.map(({ key, atTimeElapsed }) => (
      <button
        type="button"
        onClick={() => removePenalty(key)}
        key={key}
        className="remove-penalty"
        disabled={started}
      >
        {`Eyða: ${translateTeam(team)} (${formatMillisAsTime(atTimeElapsed)})`}
      </button>
    ))}
    <button
      type="button"
      onClick={() => addPenalty({ team })}
      disabled={penalties.length >= MAX_TIMEOUTS_PER_TEAM || started}
      className="add-penalty"
    >
      {`2 mín - ${translateTeam(team)}`}
    </button>
  </div>
);

PenaltiesManipulationBox.propTypes = {
  penalties: PropTypes.arrayOf(twoMinPropType).isRequired,
  team: PropTypes.string.isRequired,
  addPenalty: PropTypes.func.isRequired,
  removePenalty: PropTypes.func.isRequired,
  started: PropTypes.number,
};

PenaltiesManipulationBox.defaultProps = {
  started: null,
};

const stateToProps = ({ match }, { team }) => ({
  team,
  penalties: match[teamToTimeoutKey(team)],
  started: match.started,
});
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      addPenalty: matchActions.addPenalty,
      removePenalty: matchActions.removePenalty,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(PenaltiesManipulationBox);
