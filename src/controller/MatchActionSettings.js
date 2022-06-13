import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import matchActions from "../actions/match";
import viewActions from "../actions/view";
import { matchPropType } from "../propTypes";
import TeamSelector from "./TeamSelector";
import { VIEWS } from "../reducers/controller";
import { BACKGROUNDS } from "../reducers/view";
import { SPORTS } from "../constants";
import HalfStops from "./HalfStops";

const MatchActionSettings = ({
  view,
  match,
  updateMatch,
  background,
  setBackground,
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
        <div>
          Bakgrunnur:
          <select
            className="background-selector"
            value={background}
            onChange={({ target: { value } }) => setBackground(value)}
          >
            {Object.keys(BACKGROUNDS).map((key) => (
              <option key={key}>{key}</option>
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
  background: PropTypes.string.isRequired,
  setBackground: PropTypes.func.isRequired,
};

const stateToProps = ({
  controller: { view },
  match,
  view: { background },
}) => ({ view, match, background });
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
      addGoal: matchActions.addGoal,
      matchTimeout: matchActions.matchTimeout,
      removeTimeout: matchActions.removeTimeout,
      setBackground: viewActions.setBackground,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(MatchActionSettings);
