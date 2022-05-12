import React, { useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import IconButton from "rsuite/IconButton";
import Button from "rsuite/Button";
import PlayIcon from "@rsuite/icons/PlayOutline";
import PauseIcon from "@rsuite/icons/PauseRound";
import HistoryIcon from "@rsuite/icons/History";
import matchActions from "../actions/match";
import controllerActions from "../actions/controller";
import { matchPropType, playerPropType } from "../propTypes";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { VIEWS } from "../reducers/controller";
import { SPORTS, DEFAULT_HALFSTOPS } from "../constants";
import assetTypes from "./asset/AssetTypes";
import baddi from "../images/baddi.gif";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";

const roundMillisToSeconds = (millis) => Math.floor(millis / 1000) * 1000;
const WRAPPER_CLASSNAME = "control-item playerControls withborder";

const clockManipulationBox = (seconds, match, updateMatch) => {
  const unit = seconds >= 60 ? "m" : "s";
  const humanReadableSeconds = seconds >= 60 ? seconds / 60 : seconds;
  return (
    <div className="control-item stdbuttons">
      <button
        type="button"
        onClick={() =>
          updateMatch({
            timeElapsed:
              roundMillisToSeconds(match.timeElapsed) + seconds * 1000,
          })
        }
        disabled={match.timeout}
      >
        +{humanReadableSeconds}
        {unit}
      </button>
      <button
        type="button"
        onClick={() =>
          updateMatch({
            timeElapsed:
              roundMillisToSeconds(match.timeElapsed) - seconds * 1000,
          })
        }
        disabled={match.timeout}
      >
        -{humanReadableSeconds}
        {unit}
      </button>
    </div>
  );
};

const MatchActions = ({
  view,
  match,
  updateMatch,
  pauseMatch,
  matchTimeout,
  removeTimeout,
  startMatch,
  addGoal,
  renderAsset,
  team,
}) => {
  const [showScorerSelector, setShowScorerSelector] = useState(false);
  const [goalScorer, setGoalScorer] = useState(0);
  const homeGoal = () => {
    addGoal({ team: "home" });
    if (match.homeTeam === "Víkingur R") {
      renderAsset({
        asset: {
          key: baddi,
          type: assetTypes.IMAGE,
        },
      });
      setShowScorerSelector(true);
    }
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    const gs = parseInt(goalScorer, 10);
    team.forEach((player) => {
      if (player.number === gs) {
        getPlayerAssetObject({
          player,
          teamName: "Víkingur R",
          overlay: {
            text: "",
            blink: true,
            effect: "blink",
          },
        }).then((asset) => {
          renderAsset({
            asset,
          });
          setShowScorerSelector(false);
        });
      }
    });
  };
  if (showScorerSelector) {
    return (
      <div className={[WRAPPER_CLASSNAME, "home-scorer-selector"].join(" ")}>
        <form onSubmit={handleSubmit}>
          <label>
            Númer markaskorara:
            <input
              type="number"
              value={goalScorer}
              autoFocus
              onChange={(event) => setGoalScorer(event.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <input
            type="submit"
            value="Birta"
            className="rs-btn rs-btn-primary rs-btn-green"
          />
          <button
            onClick={() => {
              renderAsset(0);
              setShowScorerSelector(false);
            }}
            className="rs-btn rs-btn-primary rs-btn-red"
          >
            Hætta við
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className={WRAPPER_CLASSNAME}>
      {view === VIEWS.match && (
        <div>
          <div className="control-item stdbuttons">
            <button type="button" onClick={homeGoal}>
              H +1
            </button>
            <button
              type="button"
              onClick={() => updateMatch({ homeScore: match.homeScore - 1 })}
              disabled={match.homeScore <= 0}
            >
              H -1
            </button>
          </div>
          <div className="control-item stdbuttons">
            <button type="button" onClick={() => addGoal({ team: "away" })}>
              Ú +1
            </button>
            <button
              type="button"
              onClick={() => updateMatch({ awayScore: match.awayScore - 1 })}
              disabled={match.awayScore <= 0}
            >
              Ú -1
            </button>
          </div>
          <div className="control-item">
            {match.started ? (
              <Button
                color="yellow"
                appearance="primary"
                placement="left"
                onClick={pauseMatch}
                disabled={!!match.timeout}
              >
                <PauseIcon /> Pása
              </Button>
            ) : (
              <Button
                color="green"
                appearance="primary"
                placement="left"
                onClick={startMatch}
                disabled={!!match.timeout}
              >
                <PlayIcon /> Byrja
              </Button>
            )}
            <IconButton
              size="xs"
              icon={<HistoryIcon />}
              placement="left"
              onClick={() =>
                window.confirm("Ertu alveg viss?") &&
                updateMatch({
                  started: 0,
                  timeElapsed: 0,
                  home2min: [],
                  away2min: [],
                  timeout: 0,
                  homeTimeouts: 0,
                  awayTimeouts: 0,
                  buzzer: false,
                  halfStops: DEFAULT_HALFSTOPS[match.matchType],
                })
              }
              disabled={
                !match.started &&
                !match.timeElapsed &&
                DEFAULT_HALFSTOPS[match.matchType][0] === match.halfStops[0] &&
                !match.timeout
                  ? true
                  : false
              }
              color="red"
              appearance="primary"
            >
              Reset
            </IconButton>
          </div>
          {clockManipulationBox(1, match, updateMatch)}
          {clockManipulationBox(5, match, updateMatch)}
          {clockManipulationBox(60, match, updateMatch)}
          {clockManipulationBox(60 * 5, match, updateMatch)}
          <div className="control-item stdbuttons">
            {match.matchType === SPORTS.football ? (
              <div style={{ whiteSpace: "nowrap", width: "400px" }}>
                {" "}
                <input
                  type="number"
                  className="longerInput"
                  placeholder="Uppbótartími"
                  value={match.injuryTime || ""}
                  onChange={({ target: { value } }) =>
                    updateMatch({ injuryTime: parseInt(value, 10) })
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
      <div>
        <div className="control-item">
          {match.matchType === SPORTS.handball ? (
            <div>
              <PenaltiesManipulationBox team="home" />
              <PenaltiesManipulationBox team="away" />
            </div>
          ) : null}
        </div>
        {match.matchType === SPORTS.handball ? (
          <div className="control-item">
            {match.timeout ? (
              <button type="button" onClick={removeTimeout}>
                Eyða Leikhlé
              </button>
            ) : (
              <React.Fragment>
                {[
                  { team: "home", name: "heima" },
                  { team: "away", name: "úti" },
                ].map(({ team, name }) => (
                  <button
                    type="button"
                    key={team}
                    onClick={() => matchTimeout({ team })}
                  >
                    {`Leikhlé ${name}`}
                  </button>
                ))}
              </React.Fragment>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

MatchActions.propTypes = {
  updateMatch: PropTypes.func.isRequired,
  pauseMatch: PropTypes.func.isRequired,
  startMatch: PropTypes.func.isRequired,
  addGoal: PropTypes.func.isRequired,
  matchTimeout: PropTypes.func.isRequired,
  removeTimeout: PropTypes.func.isRequired,
  match: matchPropType.isRequired,
  view: PropTypes.string.isRequired,
  renderAsset: PropTypes.func.isRequired,
  team: PropTypes.arrayOf(playerPropType).isRequired,
};

const stateToProps = ({
  controller: { view, availableMatches, selectedMatch },
  match,
}) => {
  const selectedMatchObj = availableMatches[selectedMatch];
  const teamId = match.homeTeamId;
  return {
    view,
    match,
    team: selectedMatchObj ? selectedMatchObj.players[teamId] || [] : [],
  };
};
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
      addGoal: matchActions.addGoal,
      matchTimeout: matchActions.matchTimeout,
      removeTimeout: matchActions.removeTimeout,
      renderAsset: controllerActions.renderAsset,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(MatchActions);
