import { useState } from "react";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import Modal from "rsuite/Modal";
import PlayIcon from "@rsuite/icons/PlayOutline";
import PauseIcon from "@rsuite/icons/PauseRound";
import HistoryIcon from "@rsuite/icons/History";
import TimeIcon from "@rsuite/icons/Time";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import RedCardManipulation from "./RedCardManipulation";
import { Match } from "../types";
import {
  roundMillisToSeconds,
  formatTimeUnit,
  isMatchResetDisabled,
} from "../utils/matchUtils";
import { useMatch } from "../contexts/FirebaseStateContext";

const ClockManipulationButton = ({
  seconds,
  match,
  updateMatch,
  direction,
}: {
  seconds: number;
  match: Match;
  updateMatch: (update: Partial<Match>) => void;
  direction: "add" | "subtract";
}) => {
  const { value, unit } = formatTimeUnit(seconds);
  const multiplier = direction === "add" ? 1 : -1;
  const prefix = direction === "add" ? "+" : "-";
  return (
    <button
      type="button"
      className="time-adjust-btn"
      onClick={() =>
        updateMatch({
          timeElapsed:
            roundMillisToSeconds(match.timeElapsed) +
            seconds * 1000 * multiplier,
        })
      }
      disabled={!!match.timeout}
    >
      {prefix}
      {value}
      {unit}
    </button>
  );
};

const TimeControlDialog = ({
  open,
  onClose,
  match,
  updateMatch,
}: {
  open: boolean;
  onClose: () => void;
  match: Match;
  updateMatch: (update: Partial<Match>) => void;
}) => {
  const timeSteps = [1, 5, 60, 60 * 5];
  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>Tímastjórnun</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="time-control-grid">
          {timeSteps.map((seconds) => {
            const { value, unit } = formatTimeUnit(seconds);
            return (
              <div key={seconds} className="time-control-row">
                <span className="time-control-label">
                  {value}
                  {unit}
                </span>
                <ButtonGroup size="sm">
                  <ClockManipulationButton
                    seconds={seconds}
                    match={match}
                    updateMatch={updateMatch}
                    direction="add"
                  />
                  <ClockManipulationButton
                    seconds={seconds}
                    match={match}
                    updateMatch={updateMatch}
                    direction="subtract"
                  />
                </ButtonGroup>
              </div>
            );
          })}
        </div>
        {match.matchType === Sports.Football ? (
          <div className="time-control-section">
            <label className="time-control-label">Uppbótartími</label>
            <input
              type="number"
              className="longerInput"
              placeholder="Mín"
              value={match.injuryTime || ""}
              onChange={({ target: { value } }) =>
                updateMatch({ injuryTime: parseInt(value, 10) })
              }
            />
          </div>
        ) : null}
        {match.matchType === Sports.Handball ? (
          <div className="time-control-section-penalties">
            <PenaltiesManipulationBox team="home" />
            <PenaltiesManipulationBox team="away" />
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

const MatchActions = () => {
  const {
    match,
    updateMatch,
    pauseMatch,
    startMatch,
    matchTimeout,
    removeTimeout,
    countdown,
  } = useMatch();

  const [showTimeDialog, setShowTimeDialog] = useState(false);

  return (
    <div className="match-actions">
      <div className="match-actions-clock">
        <div className="match-actions-clock-primary">
          {match.started ? (
            <Button
              color="yellow"
              appearance="primary"
              size="sm"
              onClick={() => pauseMatch()}
              disabled={!!match.timeout}
              block
            >
              <PauseIcon /> Pása
            </Button>
          ) : (
            <Button
              color="green"
              appearance="primary"
              size="sm"
              onClick={startMatch}
              disabled={!!match.timeout}
              block
            >
              <PlayIcon /> Byrja
            </Button>
          )}
          {!match.started && !match.timeElapsed
            ? match.matchType === Sports.Football &&
              match.matchStartTime && (
                <Button
                  color="green"
                  appearance="primary"
                  size="sm"
                  onClick={countdown}
                  disabled={!!match.timeout}
                  block
                >
                  Hefja niðurtalningu
                </Button>
              )
            : !match.started &&
              match.showInjuryTime && (
                <Button
                  color="blue"
                  appearance="primary"
                  size="sm"
                  onClick={() => pauseMatch(true)}
                  disabled={!!match.timeout}
                  block
                >
                  Næsti hálfleikur
                </Button>
              )}
        </div>
        <div className="match-actions-clock-secondary">
          <Button
            size="xs"
            color="red"
            appearance="primary"
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
          >
            <HistoryIcon /> Reset
          </Button>
          <Button size="xs" onClick={() => setShowTimeDialog(true)}>
            <TimeIcon /> Tímastjórnun
          </Button>
        </div>
      </div>

      <RedCardManipulation />

      {match.matchType === Sports.Handball ? (
        <div className="match-actions-handball">
          <div className="match-actions-timeouts">
            {match.timeout ? (
              <Button size="sm" onClick={removeTimeout}>
                Eyða Leikhlé
              </Button>
            ) : (
              <ButtonGroup size="sm">
                {[
                  { team: "home" as const, name: "heima" },
                  { team: "away" as const, name: "úti" },
                ].map(({ team, name }) => (
                  <Button key={team} onClick={() => matchTimeout(team)}>
                    {`Leikhlé ${name}`}
                  </Button>
                ))}
              </ButtonGroup>
            )}
          </div>
        </div>
      ) : null}

      <TimeControlDialog
        open={showTimeDialog}
        onClose={() => setShowTimeDialog(false)}
        match={match}
        updateMatch={updateMatch}
      />
    </div>
  );
};

export default MatchActions;
