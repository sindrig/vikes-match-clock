import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import matchActions from "../actions/match";
import viewActions from "../actions/view";
import TeamSelector from "./TeamSelector";
import HalfStops from "./HalfStops";
import { Sports } from "../constants";
import clubLogos from "../images/clubLogos";
import { VIEWS } from "../reducers/controller";
import { BACKGROUNDS } from "../reducers/view";
import { RootState } from "../types";

const mapStateToProps = (state: RootState) => ({
  view: state.controller.view,
  match: state.match,
  background: state.view.background,
  idleImage: state.view.idleImage,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
      addGoal: matchActions.addGoal,
      matchTimeout: matchActions.matchTimeout,
      removeTimeout: matchActions.removeTimeout,
      setBackground: viewActions.setBackground,
      setIdleImage: viewActions.setIdleImage,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

const MatchActionSettings = ({
  view,
  match,
  updateMatch,
  background,
  idleImage,
  setBackground,
  setIdleImage,
}: PropsFromRedux) => (
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
          Leikur hefst:
          <input
            type="text"
            className="match-start-time-selector"
            value={match.matchStartTime}
            onChange={({ target: { value } }) =>
              updateMatch({ matchStartTime: value })
            }
          />
        </div>
        <div>
          Íþrótt:
          <select
            className="match-type-selector"
            value={match.matchType}
            onChange={({ target: { value } }) =>
              updateMatch({ matchType: value as any })
            }
          >
            {Object.values(Sports).map((s) => (
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
        <div>
          Idle logo:
          <select
            className="idle-selector"
            value={idleImage}
            onChange={({ target: { value } }) => setIdleImage(value)}
          >
            <option value={"null"} key={"null"}>
              No idle screen between images
            </option>
            {Object.keys(clubLogos).map((key) => (
              <option value={key} key={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  </div>
);

export default connector(MatchActionSettings);
