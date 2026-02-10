import React, { useState } from "react";
import IconButton from "rsuite/IconButton";
import Button from "rsuite/Button";
import PlayIcon from "@rsuite/icons/PlayOutline";
import PauseIcon from "@rsuite/icons/PauseRound";
import HistoryIcon from "@rsuite/icons/History";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { VIEWS } from "../constants";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import assetTypes from "./asset/AssetTypes";
import baddi from "../images/baddi.gif";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import RedCardManipulation from "./RedCardManipulation";
import { Match } from "../types";
import {
  roundMillisToSeconds,
  formatTimeUnit,
  shouldShowGoalCelebration,
  isMatchResetDisabled,
} from "../utils/matchUtils";
import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";

const WRAPPER_CLASSNAME = "control-item playerControls withborder";

const clockManipulationBox = (
  seconds: number,
  match: Match,
  updateMatch: (update: Partial<Match>) => void,
): React.JSX.Element => {
  const { value, unit } = formatTimeUnit(seconds);
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
        +{value}
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
        -{value}
        {unit}
      </button>
    </div>
  );
};

const MatchActions = () => {
  const {
    match,
    updateMatch,
    pauseMatch,
    startMatch,
    addGoal,
    matchTimeout,
    removeTimeout,
    countdown,
  } = useMatch();

  const { controller, renderAsset } = useController();
  const { listenPrefix } = useRemoteSettings();

  const { view, availableMatches, selectedMatch } = controller;

  const selectedMatchObj = selectedMatch
    ? availableMatches[selectedMatch]
    : undefined;

  const homeTeam = selectedMatchObj?.players
    ? selectedMatchObj.players[match.homeTeamId] || []
    : [];
  const awayTeam = selectedMatchObj?.players
    ? selectedMatchObj.players[match.awayTeamId] || []
    : [];

  const [showScorerSelector, setShowScorerSelector] = useState<string | null>(
    null,
  );
  const [goalScorer, setGoalScorer] = useState<number | string>(0);

  const goal = (awayOrHome: "home" | "away"): void => {
    addGoal(awayOrHome);
    const teamName = awayOrHome === "home" ? match.homeTeam : match.awayTeam;
    if (shouldShowGoalCelebration(match.matchType, teamName, listenPrefix)) {
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
        void getPlayerAssetObject({
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
                    onClick={() => pauseMatch(true)}
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
              disabled={isMatchResetDisabled(match)}
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
                    onClick={() => matchTimeout(team)}
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

export default MatchActions;
