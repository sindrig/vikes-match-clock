import React, { useState } from "react";
import { Modal } from "rsuite";
import { RingLoader } from "react-spinners";

import { Player } from "../../../types";
import { TeamPlayer } from "../../../api/client";
import apiConfig from "../../../apiConfig";

const STARTER_COUNT = 11;
const SUB_COUNT = 12;

interface ResolveRosterModalProps {
  open: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
  onConfirm: (players: Player[]) => void;
}

const isPositiveIntegerText = (v: string): boolean =>
  /^[1-9]\d*$/.test(v.trim());

const toNum = (v: string): number => Number(v.trim());

function mapRole(tp: TeamPlayer): string {
  if (tp.goalkeeper && tp.startingLineup) return "Markmaður";
  if (tp.goalkeeper && !tp.startingLineup) return "Varamarkmaður";
  if (tp.captain) return "Fyrirliði";
  if (tp.startingLineup && !tp.goalkeeper) return "Leikmaður";
  return "Varamáður";
}

function transformSingleLineup(
  players: TeamPlayer[],
  officials: { person: { name: string; id: number } }[],
): Player[] {
  const mappedPlayers: Player[] = players.map((tp) => {
    const player: Player = {
      name: tp.person.name,
      id: tp.person.id,
      role: mapRole(tp),
      show: tp.startingLineup ?? false,
    };
    if (tp.shirtNumber != null) {
      player.number = tp.shirtNumber;
    }
    return player;
  });

  const mappedOfficials: Player[] = officials.map((o) => ({
    name: o.person.name,
    id: o.person.id,
    role: "Þjálfari",
    show: false,
  }));

  return [...mappedPlayers, ...mappedOfficials];
}

const ResolveRosterModal: React.FC<ResolveRosterModalProps> = ({
  open,
  onClose,
  teamId,
  teamName,
  onConfirm,
}) => {
  const [starters, setStarters] = useState<string[]>(
    Array(STARTER_COUNT).fill(""),
  );
  const [subs, setSubs] = useState<string[]>(Array(SUB_COUNT).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Player[] | null>(null);

  const setStarter = (i: number, v: string): void => {
    const next = [...starters];
    next[i] = v;
    setStarters(next);
  };

  const setSub = (i: number, v: string): void => {
    const next = [...subs];
    next[i] = v;
    setSubs(next);
  };

  const validate = (): string | null => {
    const filledStarters = starters.filter((v) => v.trim() !== "");
    if (filledStarters.length < STARTER_COUNT)
      return "Allir byrjunarliðsmenn verða að vera fylltir út";

    const allValues = [...starters, ...subs.filter((v) => v.trim() !== "")];
    for (const value of allValues) {
      if (!isPositiveIntegerText(value)) {
        return "Eingöngu jákvæðar tölur eru leyfðar";
      }
    }

    const allNums = allValues.map(toNum);

    const seen = new Set<number>();
    for (const n of allNums) {
      if (seen.has(n)) return `Tvítekið númer: ${String(n)}`;
      seen.add(n);
    }

    return null;
  };

  const handleSubmit = async (): Promise<void> => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const filledSubs = subs
        .filter((v) => v.trim() !== "")
        .map((v) => toNum(v));
      const res = await fetch(
        `${apiConfig.gateWayUrl}v3/${String(teamId)}/resolve-roster`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            starters: starters.map(toNum),
            substitutes: filledSubs,
          }),
        },
      );
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as {
        players: TeamPlayer[];
        officials: [];
      };
      const players = transformSingleLineup(data.players, data.officials);
      setPreview(players);
    } catch {
      setError("Error fetching roster");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (): void => {
    if (preview) onConfirm(preview);
  };

  const handleClose = (): void => {
    setStarters(Array(STARTER_COUNT).fill(""));
    setSubs(Array(SUB_COUNT).fill(""));
    setError("");
    setPreview(null);
    setLoading(false);
    onClose();
  };

  const renderNumberGrid = (
    count: number,
    values: string[],
    setter: (i: number, v: string) => void,
  ): React.JSX.Element => (
    <div className="roster-number-grid">
      {Array.from({ length: count }, (_, i) => (
        <input
          key={String(i)}
          type="number"
          min="1"
          inputMode="numeric"
          className="roster-number-input"
          value={values[i]}
          onPaste={(e) => e.preventDefault()}
          onChange={(e) => setter(i, e.target.value)}
        />
      ))}
    </div>
  );

  const renderForm = (): React.JSX.Element => (
    <>
      <p className="roster-section-label">
        Byrjunarlið ({String(STARTER_COUNT)})
      </p>
      {renderNumberGrid(STARTER_COUNT, starters, setStarter)}
      <p className="roster-section-label">
        Varamenn ({String(SUB_COUNT)} – valfrjálst)
      </p>
      {renderNumberGrid(SUB_COUNT, subs, setSub)}
    </>
  );

  const renderPreview = (): React.JSX.Element | null => {
    if (!preview) return null;
    const previewStarters = preview.filter((p) => p.show);
    const previewSubs = preview.filter((p) => !p.show);

    const renderRow = (p: Player): React.JSX.Element => (
      <div key={String(p.number ?? "")} className="roster-preview-row">
        <span className="player-number">{String(p.number ?? "")}</span>
        <span className="player-name">{p.name}</span>
        <span className="player-role">{p.role ?? ""}</span>
      </div>
    );

    return (
      <div className="roster-preview">
        <p className="roster-section-label">Byrjunarlið</p>
        {previewStarters.map(renderRow)}
        {previewSubs.length > 0 && (
          <>
            <p className="roster-section-label roster-sub-label">Varamenn</p>
            {previewSubs.map(renderRow)}
          </>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      className="resolve-roster-modal"
    >
      <Modal.Header>
        <Modal.Title>Búa til leikmannahóp – {teamName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && <RingLoader loading size={40} />}
        {error && <span className="error">{error}</span>}
        {!loading && !preview && renderForm()}
        {!loading && preview && renderPreview()}
      </Modal.Body>
      <Modal.Footer>
        {preview ? (
          <button
            type="button"
            className="roster-confirm-btn"
            onClick={handleConfirm}
          >
            Vista leikmannahóp
          </button>
        ) : (
          <button
            type="button"
            className="roster-confirm-btn"
            onClick={() => void handleSubmit()}
            disabled={loading}
          >
            Senda inn
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default ResolveRosterModal;
