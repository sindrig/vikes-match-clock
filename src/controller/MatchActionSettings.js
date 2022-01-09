import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import matchActions from "../actions/match";
import { matchPropType } from "../propTypes";
import TeamSelector from "./TeamSelector";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { VIEWS } from "../reducers/controller";
import { SPORTS } from "../constants";
import HalfStops from "./HalfStops";

const MatchActionSettings = ({
  view,
  match,
  updateMatch,
  pauseMatch,
  matchTimeout,
  removeTimeout,
  startMatch,
  addGoal,
}) => (
  <div className="control-item playerControls withborder">
    {view === VIEWS.match && (
      <div>  
        <div className="control-item">
          <div>
            <HalfStops />
          </div>
        </div>
      </div>
    )}
    <div>
      <div className="control-item">
        <TeamSelector teamAttrName="homeTeam" />
        <TeamSelector teamAttrName="awayTeam" />
        <div>
          Íþrótt:
          <select
            className="match-type-selector"
            value={match.matchType}
            onChange={({ target: { value } }) =>
              updateMatch({ matchType: value })
            }
          >
            {Object.keys(SPORTS).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  </div>
);

MatchActionSettings.propTypes = {
  updateMatch: PropTypes.func.isRequired,
  pauseMatch: PropTypes.func.isRequired,
  startMatch: PropTypes.func.isRequired,
  addGoal: PropTypes.func.isRequired,
  matchTimeout: PropTypes.func.isRequired,
  removeTimeout: PropTypes.func.isRequired,
  match: matchPropType.isRequired,
  view: PropTypes.string.isRequired,
};

const stateToProps = ({ controller: { view }, match }) => ({ view, match });
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
      addGoal: matchActions.addGoal,
      matchTimeout: matchActions.matchTimeout,
      removeTimeout: matchActions.removeTimeout,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(MatchActionSettings);
