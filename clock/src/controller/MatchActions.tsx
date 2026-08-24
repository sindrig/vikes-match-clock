import { useState } from "react";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import Modal from "rsuite/Modal";
import PlayIcon from "@rsuite/icons/PlayOutline";
import PauseIcon from "@rsuite/icons/PauseRound";
import HistoryIcon from "@rsuite/icons/History";
import TimeIcon from "@rsuite/icons/Time";
import PenaltiesManipulationBox from "./PenaltiesManipulationBox";
import { Sports } from "../constants";
import RedCardManipulation from "./RedCardManipulation";
import { Match } from "../types";
import {
  formatTimeUnit,
  isMatchResetDisabled,
  isHalftimeTransitionEligible,
} from "../utils/matchUtils";
import { useMatch, useFirebaseState } from "../contexts/FirebaseStateContext";

// Backward corrections at or above this magnitude require explicit operator
// confirmation before they are applied.
const BACKWARD_CORRECTION_CONFIRM_THRESHOLD_MS = 60 * 1000;

const ClockManipulationButton = ({
  seconds,
  match,
  adjustMatchTime,
  direction,
}: {
  seconds: number;
  match: Match;
  adjustMatchTime: (deltaMs: number) => void;
  direction: "add" | "subtract";
}) => {
  const { value, unit } = formatTimeUnit(seconds);
  const multiplier = direction === "add" ? 1 : -1;
  const prefix = direction === "add" ? "+" : "-";
  const deltaMs = seconds * 1000 * multiplier;
  return (
    <button
      type="button"
      className="time-adjust-btn"
      onClick={() => {
        // Substantial backward time corrections are destructive: require an
        // explicit confirmation so an accidental tap cannot rewind the clock.
        if (
          deltaMs < 0 &&
          -deltaMs >= BACKWARD_CORRECTION_CONFIRM_THRESHOLD_MS
        ) {
          const confirmed = window.confirm(
            `Ertu viss um að leiðrétta tímann aftur um ${value}${unit}?`,
          );
          if (!confirmed) return;
        }
        adjustMatchTime(deltaMs);
      }}
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
  adjustMatchTime,
}: {
  open: boolean;
  onClose: () => void;
  match: Match;
  adjustMatchTime: (deltaMs: number) => void;
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
                    adjustMatchTime={adjustMatchTime}
                    direction="add"
                  />
                  <ClockManipulationButton
                    seconds={seconds}
                    match={match}
                    adjustMatchTime={adjustMatchTime}
                    direction="subtract"
                  />
                </ButtonGroup>
              </div>
            );
          })}
        </div>
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
    adjustMatchTime,
    pauseMatch,
    startMatch,
    resetMatch,
    matchTimeout,
    removeTimeout,
    countdown,
    startHalftimeCountdown,
    stopHalftimeCountdown,
  } = useMatch();
  const { writeEligible } = useFirebaseState();

  const [showTimeDialog, setShowTimeDialog] = useState(false);

  return (
    <div className="match-actions">
      <div className="match-actions-clock">
        <div className="match-actions-clock-primary">
          {match.halftimeCountdown ? (
            <Button
              color="orange"
              appearance="primary"
              size="sm"
              onClick={stopHalftimeCountdown}
              disabled={!writeEligible}
              block
            >
              <PauseIcon /> Stöðva niðurtalningu
            </Button>
          ) : match.started ? (
            <Button
              color="yellow"
              appearance="primary"
              size="sm"
              onClick={() => pauseMatch()}
              disabled={!!match.timeout || !writeEligible}
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
              disabled={!!match.timeout || !writeEligible}
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
                  disabled={!!match.timeout || !writeEligible}
                  block
                >
                  Hefja niðurtalningu
                </Button>
              )
            : !match.started &&
              isHalftimeTransitionEligible(match) &&
              match.injuryTimeDisplayMode !== "stop" && (
                <Button
                  color="blue"
                  appearance="primary"
                  size="sm"
                  onClick={startHalftimeCountdown}
                  disabled={!!match.timeout || !writeEligible}
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
            onClick={() => window.confirm("Ertu alveg viss?") && resetMatch()}
            disabled={isMatchResetDisabled(match)}
          >
            <HistoryIcon /> Reset
          </Button>
          <Button size="xs" onClick={() => setShowTimeDialog(true)}>
            <TimeIcon /> Tímastjórnun
          </Button>
        </div>
      </div>

      <div className="match-actions-clock-secondary">
        <RedCardManipulation />
        {match.matchType === Sports.Football && (
          <input
            type="number"
            className="longerInput"
            placeholder="Uppbót (mín)"
            value={match.injuryTime || ""}
            onChange={({ target: { value } }) =>
              updateMatch({ injuryTime: parseInt(value, 10) })
            }
          />
        )}
      </div>

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
        adjustMatchTime={adjustMatchTime}
      />
    </div>
  );
};

export default MatchActions;
