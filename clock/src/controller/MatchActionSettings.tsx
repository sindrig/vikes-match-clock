import TeamSelector from "./TeamSelector";
import HalfStops from "./HalfStops";
import { Sports } from "../constants";
import clubLogos from "../images/clubLogos";
import { VIEWS } from "../reducers/controller";
import { BACKGROUNDS } from "../reducers/view";
import { useMatch, useController, useView } from "../contexts/FirebaseStateContext";

const MatchActionSettings = () => {
  const { match, updateMatch } = useMatch();
  const { controller } = useController();
  const { view: viewState, setBackground, setIdleImage } = useView();

  const { view } = controller;
  const { background, idleImage } = viewState;

  return (
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
                updateMatch({ matchType: value as Sports })
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
};

export default MatchActionSettings;
