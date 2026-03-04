import TeamSelector from "./TeamSelector";
import HalfStops from "./HalfStops";
import clubLogos from "../images/clubLogos";
import { Sports, VIEWS, BACKGROUNDS } from "../constants";
import {
  useMatch,
  useController,
  useView,
} from "../contexts/FirebaseStateContext";

const MatchActionSettings = () => {
  const { match, updateMatch } = useMatch();
  const { controller } = useController();
  const {
    view: viewState,
    setBackground,
    setIdleImage,
    setBlackoutStart,
    setBlackoutEnd,
  } = useView();

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
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid #ccc",
            }}
          >
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Næturstilling:
            </label>
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <input
                type="time"
                className="blackout-time-selector"
                value={viewState.blackoutStart ?? ""}
                onChange={({ target: { value } }) =>
                  setBlackoutStart(value || undefined)
                }
              />
              <span>–</span>
              <input
                type="time"
                className="blackout-time-selector"
                value={viewState.blackoutEnd ?? ""}
                onChange={({ target: { value } }) =>
                  setBlackoutEnd(value || undefined)
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchActionSettings;
