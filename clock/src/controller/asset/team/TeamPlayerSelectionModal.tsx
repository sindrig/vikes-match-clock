import React from "react";
import { Modal } from "rsuite";

import { Player, GoalScorerPlayerStatus } from "../../../types";

import "./TeamPlayerSelectionModal.css";

interface TeamPlayerSelectionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  players: Player[];
  onSelect: (player: Player) => void;
  /** Optional instruction text shown below the title */
  instruction?: string;
  /**
   * Optional per-player readiness map (keyed by player id). When present, each
   * player button renders a small readiness label so the operator can see at a
   * glance whether perimeter media is ready for that player before selecting.
   */
  readiness?: Record<string, GoalScorerPlayerStatus>;
}

const READINESS_LABELS: Partial<Record<GoalScorerPlayerStatus, string>> = {
  preparing: "Undirbýr",
  ready: "Tilbúið",
  fallback: "Skjöldur",
  unavailable: "Ekki tiltækt",
  failed: "Villa",
};

const TeamPlayerSelectionModal: React.FC<TeamPlayerSelectionModalProps> = ({
  open,
  onClose,
  title,
  players,
  onSelect,
  instruction,
  readiness,
}) => {
  const byNumber = (a: Player, b: Player): number =>
    (Number(a.number) || Infinity) - (Number(b.number) || Infinity);
  const starters = players.filter((p) => p.show).sort(byNumber);
  const bench = players.filter((p) => !p.show).sort(byNumber);

  const renderPlayerButton = (player: Player): React.JSX.Element => {
    const status =
      player.id !== undefined && player.id !== null
        ? readiness?.[String(player.id)]
        : undefined;
    const statusLabel = status ? READINESS_LABELS[status] : undefined;
    return (
      <button
        key={`${String(player.number)}-${player.name}`}
        type="button"
        className={`player-grid-cell${status ? ` player-grid-readiness-${status}` : ""}`}
        onClick={() => onSelect(player)}
      >
        <span className="player-grid-number">
          {player.number ?? (player.role ? player.role[0] : "?")}
        </span>
        <span className="player-grid-name">{player.name}</span>
        {statusLabel && (
          <span className="player-grid-readiness">{statusLabel}</span>
        )}
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      className="player-select-modal"
    >
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {instruction && (
          <p className="player-select-instruction">{instruction}</p>
        )}
        {starters.length > 0 && (
          <>
            <div className="player-select-section-label">Á velli</div>
            <div className="player-grid">
              {starters.map(renderPlayerButton)}
            </div>
          </>
        )}
        {bench.length > 0 && (
          <>
            <div className="player-select-section-label bench-label">
              Varamenn
            </div>
            <div className="player-grid">{bench.map(renderPlayerButton)}</div>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default TeamPlayerSelectionModal;
