import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "rsuite";
import { Player } from "../types";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import { useController } from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { isVideoUrl } from "../utils/matchUtils";

function preloadMedia(url: string): Promise<void> {
  if (isVideoUrl(url)) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.oncanplaythrough = () => resolve();
      video.onerror = () => resolve();
      video.src = url;
    });
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}
interface GoalScorerDialogProps {
  open: boolean;
  players: Player[];
  teamName: string;
  goalGif2?: string | null;
  onClose: () => void;
}

const GoalScorerDialog = ({
  open,
  players,
  teamName,
  goalGif2,
  onClose,
}: GoalScorerDialogProps) => {
  const { renderAsset } = useController();
  const { listenPrefix } = useRemoteSettings();
  const [numberInput, setNumberInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = numberInput
    ? players.filter((p) => String(p.number ?? "").startsWith(numberInput))
    : players;

  const selectPlayer = useCallback(
    (player: Player) => {
      const bgReady = goalGif2 ? preloadMedia(goalGif2) : Promise.resolve();
      void Promise.all([
        getPlayerAssetObject({
          player,
          teamName,
          preferExt: "fagn",
          listenPrefix,
        }),
        bgReady,
      ]).then(([asset]) => {
        if (asset) {
          const goalAsset = goalGif2
            ? { ...asset, background: goalGif2, isGoalCelebration: true }
            : { ...asset, isGoalCelebration: true };
          renderAsset(goalAsset);
        }
      });
      onClose();
    },
    [teamName, listenPrefix, renderAsset, onClose, goalGif2],
  );

  const handleEntered = useCallback(() => {
    setNumberInput("");
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (filtered.length === 1 && numberInput.length > 0) {
      const handleEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter" && filtered[0]) {
          e.preventDefault();
          selectPlayer(filtered[0]);
        }
      };
      window.addEventListener("keydown", handleEnter);
      return () => window.removeEventListener("keydown", handleEnter);
    }
  }, [filtered, numberInput, selectPlayer]);

  const formatPlayer = (p: Player): string => {
    const num = p.number ?? "";
    return `#${String(num)} ${p.name}`;
  };

  return (
    <Modal open={open} onClose={onClose} onEntered={handleEntered} size="xs">
      <Modal.Header>
        <Modal.Title>Markaskorari &mdash; {teamName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={numberInput}
          onChange={(e) => setNumberInput(e.target.value)}
          placeholder="Sláðu inn númer leikmanns..."
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 18,
            boxSizing: "border-box",
            marginBottom: 10,
          }}
          autoFocus
        />
        <div
          style={{
            maxHeight: 350,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: 8, opacity: 0.5 }}>
              Enginn leikmaður með númer &quot;{numberInput}&quot;
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={`${String(p.number)}-${p.name}`}
              type="button"
              onClick={() => selectPlayer(p)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                fontSize: 15,
                border: "1px solid #3c3f43",
                borderRadius: 4,
                background: filtered.length === 1 ? "#1675e0" : "transparent",
                color: filtered.length === 1 ? "white" : "inherit",
                cursor: "pointer",
              }}
            >
              {formatPlayer(p)}
            </button>
          ))}
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default GoalScorerDialog;
