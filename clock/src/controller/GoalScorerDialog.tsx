import { useCallback } from "react";
import { Player, GoalScorerPlayerStatus } from "../types";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import { useController, usePerimeter } from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { preloadMedia } from "../utils/matchUtils";
import TeamPlayerSelectionModal from "./asset/team/TeamPlayerSelectionModal";

interface GoalScorerDialogProps {
  open: boolean;
  players: Player[];
  teamName: string;
  goalGif2?: string | null;
  onClose: () => void;
}

// Build a perimeter overlay command from the player's prepared file pair. The
// pair's `files` map is keyed by the overlay layer IDs ("2" and "4") and is
// directly usable as an overlay column.
const buildScorerOverlay = (
  files: Record<string, { name: string; source: string }>,
) => ({
  version: 1,
  id: crypto.randomUUID(),
  columns: [{ durationMs: 10000, files }],
});

const GoalScorerDialog = ({
  open,
  players,
  teamName,
  goalGif2,
  onClose,
}: GoalScorerDialogProps) => {
  const { renderAsset } = useController();
  const { goalScorerPreparationStatus, setPerimeterOverlay } = usePerimeter();
  const { listenPrefix } = useRemoteSettings();

  const selectPlayer = useCallback(
    (player: Player) => {
      // Retain the main-screen player reveal (existing behavior).
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

      // Replace the generic perimeter overlay ONLY when the selected player's
      // current preparation result supplies a ready or fallback target pair.
      // When media is preparing, unavailable, or failed the generic overlay
      // stays active (the operator sees the readiness in the dialog and the
      // perimeter status view).
      const result =
        player.id !== undefined && player.id !== null
          ? goalScorerPreparationStatus?.players[String(player.id)]
          : undefined;
      if (
        result &&
        (result.status === "ready" || result.status === "fallback") &&
        result.files?.["2"] &&
        result.files["4"]
      ) {
        setPerimeterOverlay(buildScorerOverlay(result.files));
      }

      onClose();
    },
    [
      teamName,
      listenPrefix,
      renderAsset,
      onClose,
      goalGif2,
      goalScorerPreparationStatus,
      setPerimeterOverlay,
    ],
  );

  // Per-player readiness for the selection dialog so the operator can see at a
  // glance whether perimeter media is ready before attributing the goal.
  const readiness: Record<string, GoalScorerPlayerStatus> = {};
  for (const [playerId, result] of Object.entries(
    goalScorerPreparationStatus?.players ?? {},
  )) {
    readiness[playerId] = result.status;
  }

  return (
    <TeamPlayerSelectionModal
      open={open}
      onClose={onClose}
      title={`Markaskorari — ${teamName}`}
      instruction="Veldu leikmann sem skoraði"
      players={players}
      onSelect={selectPlayer}
      readiness={readiness}
    />
  );
};

export default GoalScorerDialog;
