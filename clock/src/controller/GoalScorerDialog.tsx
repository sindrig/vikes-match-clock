import { useCallback } from "react";
import { Player } from "../types";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import {
  useController,
  useListeners,
  usePerimeter,
} from "../contexts/FirebaseStateContext";
import {
  buildGoalScorerOverlayCommand,
  goalScorerPlayerFromSelection,
} from "../contexts/firebaseParsers";
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
  const { setPerimeterOverlay } = usePerimeter();
  const { venues } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  // Missing or invalid mappings leave the perimeter unconfigured. The
  // main-screen reveal remains available independently of that mapping.
  const isWebVenue = venues[listenPrefix]?.perimeterDisplay?.renderer === "web";

  const selectPlayer = useCallback(
    (player: Player) => {
      // Warm the goal background without making its load time delay the live
      // player reveal. Large videos can take several seconds to buffer.
      if (goalGif2) void preloadMedia(goalGif2);

      const scorerPlayer = isWebVenue
        ? goalScorerPlayerFromSelection(player)
        : undefined;
      const semanticCommand = scorerPlayer
        ? buildGoalScorerOverlayCommand(scorerPlayer)
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
        if (semanticCommand) {
          setPerimeterOverlay(semanticCommand);
        }
      });

      onClose();
    },
    [
      teamName,
      listenPrefix,
      isWebVenue,
      renderAsset,
      onClose,
      goalGif2,
      setPerimeterOverlay,
    ],
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
