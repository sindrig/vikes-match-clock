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
      // Warm the goal background without making its load time delay the live
      // player reveal. Large videos can take several seconds to buffer.
      if (goalGif2) void preloadMedia(goalGif2);

      const result =
        player.id !== undefined && player.id !== null
          ? goalScorerPreparationStatus?.players[String(player.id)]
          : undefined;
      const perimeterFiles =
        result &&
        (result.status === "ready" || result.status === "fallback") &&
        result.files?.["2"] &&
        result.files["4"]
          ? result.files
          : undefined;

      void getPlayerAssetObject({
        player,
        teamName,
        preferExt: "fagn",
        listenPrefix,
      }).then((asset) => {
        if (asset) {
          const goalAsset = goalGif2
            ? { ...asset, background: goalGif2, isGoalCelebration: true }
            : { ...asset, isGoalCelebration: true };
          renderAsset(goalAsset);
        }

        // Submit the main-screen command before the perimeter command, so the
        // large display does not trail the LED overlay.
        if (perimeterFiles) {
          setPerimeterOverlay(buildScorerOverlay(perimeterFiles));
        }
      });

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
