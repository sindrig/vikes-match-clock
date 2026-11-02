import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const currentSelection = useRef<symbol | null>(null);

  useLayoutEffect(() => {
    if (!open) currentSelection.current = null;
    return () => {
      currentSelection.current = null;
    };
  }, [open]);

  const closeDialog = useCallback(() => {
    currentSelection.current = null;
    onClose();
  }, [onClose]);

  // Missing or invalid mappings leave the perimeter unconfigured. The
  // main-screen reveal remains available independently of that mapping.
  const isWebVenue = venues[listenPrefix]?.perimeterDisplay?.renderer === "web";

  const selectPlayer = useCallback(
    (player: Player) => {
      if (!open) return;
      // Dismissal or a newer selection retires this continuation. A submitted
      // write cannot be cancelled, but its acknowledgement must not close a
      // reopened dialog or submit another command for an obsolete selection.
      const selection = Symbol();
      currentSelection.current = selection;
      const isCurrent = () => currentSelection.current === selection;
      setError(null);
      // Warm the goal background without making its load time delay the live
      // player reveal. Large videos can take several seconds to buffer.
      if (goalGif2) void preloadMedia(goalGif2).catch(console.error);

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
      })
        .then(async (asset) => {
          if (!isCurrent()) return;
          if (asset) {
            const goalAsset = goalGif2
              ? { ...asset, background: goalGif2, isGoalCelebration: true }
              : { ...asset, isGoalCelebration: true };
            await renderAsset(goalAsset);
          }
          if (!isCurrent()) return;

          // Submit the main-screen command before the perimeter command, so the
          // large display does not trail the LED overlay.
          if (semanticCommand) {
            await setPerimeterOverlay(semanticCommand);
          }
          if (isCurrent()) closeDialog();
        })
        .catch((failure: unknown) => {
          if (!isCurrent()) return;
          setError(
            failure instanceof Error
              ? failure.message
              : "Ekki tókst að birta markaskorara.",
          );
        });
    },
    [
      teamName,
      listenPrefix,
      isWebVenue,
      renderAsset,
      open,
      closeDialog,
      goalGif2,
      setPerimeterOverlay,
    ],
  );

  return (
    <TeamPlayerSelectionModal
      open={open}
      onClose={closeDialog}
      title={`Markaskorari — ${teamName}`}
      instruction="Veldu leikmann sem skoraði"
      players={players}
      onSelect={selectPlayer}
      error={error}
    />
  );
};

export default GoalScorerDialog;
