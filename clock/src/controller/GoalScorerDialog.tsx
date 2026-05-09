import { useCallback } from "react";
import { Player } from "../types";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import { useController } from "../contexts/FirebaseStateContext";
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

const GoalScorerDialog = ({
  open,
  players,
  teamName,
  goalGif2,
  onClose,
}: GoalScorerDialogProps) => {
  const { renderAsset } = useController();
  const { listenPrefix } = useRemoteSettings();

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

  return (
    <TeamPlayerSelectionModal
      open={open}
      onClose={onClose}
      title={`Markaskorari — ${teamName}`}
      instruction="Veldu leikmann sem skoraði"
      players={players}
      onSelect={selectPlayer}
    />
  );
};

export default GoalScorerDialog;
