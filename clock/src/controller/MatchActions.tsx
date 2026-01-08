import React, { useState } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import IconButton from "rsuite/IconButton";
import Button from "rsuite/Button";
import PlayIcon from "@rsuite/icons/PlayOutline";
import PauseIcon from "@rsuite/icons/PauseRound";
import HistoryIcon from "@rsuite/icons/History";
import matchActions from "../actions/match";
import controllerActions from "../actions/controller";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { VIEWS } from "../reducers/controller";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import assetTypes from "./asset/AssetTypes";
import baddi from "../images/baddi.gif";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import RedCardManipulation from "./RedCardManipulation";
import { RootState, Match } from "../types";

const roundMillisToSeconds = (millis: number): number =>
  Math.floor(millis / 1000) * 1000;
const WRAPPER_CLASSNAME = "control-item playerControls withborder";

const clockManipulationBox = (
  seconds: number,
  match: Match,
  updateMatch: (update: Partial<Match>) => void,
): React.JSX.Element => {
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
        disabled={!!match.timeout}
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
        disabled={!!match.timeout}
      >
        -{humanReadableSeconds}
        {unit}
      </button>
    </div>
  );
};

const mapStateToProps = ({
  controller: { view, availableMatches, selectedMatch },
  match,
  remote: { listenPrefix },
}: RootState) => {
  const selectedMatchObj = selectedMatch
    ? availableMatches[selectedMatch]
    : undefined;
  return {
    view,
    listenPrefix,
    match,
    homeTeam: selectedMatchObj?.players
      ? selectedMatchObj.players[match.homeTeamId] || []
      : [],
    awayTeam: selectedMatchObj?.players
      ? selectedMatchObj.players[match.awayTeamId] || []
      : [],
  };
};

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
      pauseMatch: matchActions.pauseMatch,
      startMatch: matchActions.startMatch,
      addGoal: matchActions.addGoal,
      matchTimeout: matchActions.matchTimeout,
      removeTimeout: matchActions.removeTimeout,
      countdown: matchActions.countdown,
      renderAsset: controllerActions.renderAsset,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

const MatchActions: React.FC<PropsFromRedux> = ({
  view,
  match,
  updateMatch,
  pauseMatch,
  matchTimeout,
  removeTimeout,
  startMatch,
  addGoal,
  renderAsset,
  homeTeam,
  awayTeam,
  countdown,
  listenPrefix,
}) => {
  const [showScorerSelector, setShowScorerSelector] = useState<string | null>(
    null,
  );
  const [goalScorer, setGoalScorer] = useState<number | string>(0);

  const goal = (awayOrHome: "home" | "away"): void => {
    addGoal({ team: awayOrHome });
    const teamName = awayOrHome === "home" ? match.homeTeam : match.awayTeam;
    if (
      match.matchType === Sports.Football &&
      teamName === "Víkingur R" &&
      listenPrefix.startsWith("vik")
    ) {
      renderAsset({
        key: baddi,
        type: assetTypes.IMAGE,
      });
      setShowScorerSelector(awayOrHome);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const gs =
      typeof goalScorer === "string" ? parseInt(goalScorer, 10) : goalScorer;

    (showScorerSelector === "away" ? awayTeam : homeTeam).forEach((player) => {
      if (player.number === gs) {
        getPlayerAssetObject({
          listenPrefix,
          player,
          teamName: "Víkingur R",
          preferExt: "fagn",
          preferType: "gif",
        }).then((asset) => {
          if (asset) {
            renderAsset({ ...asset, background: baddi } as typeof asset);
          }
          setShowScorerSelector(null);
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
              renderAsset(null);
              setShowScorerSelector(null);
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
            <button type="button" onClick={() => goal("home")}>
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
            <button type="button" onClick={() => goal("away")}>
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
                onClick={() => pauseMatch()}
                disabled={!!match.timeout}
              >
                <PauseIcon /> Pása
              </Button>
            ) : (
              <React.Fragment>
                <Button
                  color="green"
                  appearance="primary"
                  onClick={startMatch}
                  disabled={!!match.timeout}
                >
                  <PlayIcon /> Byrja
                </Button>
                {match.showInjuryTime ? (
                  <Button
                    color="blue"
                    appearance="primary"
                    onClick={() => pauseMatch({ isHalfEnd: true })}
                    disabled={!!match.timeout}
                  >
                    <PlayIcon /> Næsti hálfleikur
                  </Button>
                ) : null}
              </React.Fragment>
            )}
            <IconButton
              size="xs"
              icon={<HistoryIcon />}
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
          <RedCardManipulation />
          <div className="control-item stdbuttons">
            {match.matchType === Sports.Football ? (
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

            {match.matchType === Sports.Football &&
            !match.started &&
            match.matchStartTime &&
            !match.timeElapsed ? (
              <div style={{ whiteSpace: "nowrap", width: "400px" }}>
                <Button color="green" appearance="primary" onClick={countdown}>
                  Hefja niðurtalningu
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <div>
        <div className="control-item">
          {match.matchType === Sports.Handball ? (
            <div>
              <PenaltiesManipulationBox team="home" />
              <PenaltiesManipulationBox team="away" />
            </div>
          ) : null}
        </div>
        {match.matchType === Sports.Handball ? (
          <div className="control-item">
            {match.timeout ? (
              <button type="button" onClick={removeTimeout}>
                Eyða Leikhlé
              </button>
            ) : (
              <React.Fragment>
                {[
                  { team: "home" as const, name: "heima" },
                  { team: "away" as const, name: "úti" },
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

export default connector(MatchActions);
