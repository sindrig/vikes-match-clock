import { useCallback } from "react";
import { Player, GoalScorerPlayerStatus, PerimeterFileOverlay } from "../types";
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

// Build a perimeter overlay command from the player's prepared file pair. The
// pair's `files` map is keyed by the overlay layer IDs ("2" and "4") and is
// directly usable as an overlay column.
const buildScorerOverlay = (
  files: Record<string, { name: string; source: string }>,
): PerimeterFileOverlay => ({
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
  const { screens } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  // The venue's published renderer selects the overlay path: web venues
  // compose the scorer in the browser from semantic data, Resolume venues
  // keep the prepared-PNG workflow, and a missing/invalid mapping leaves
  // the generic goal overlay unchanged.
  const renderer = screens.find((entry) => entry.key === listenPrefix)
    ?.perimeterDisplay?.renderer;

  const selectPlayer = useCallback(
    (player: Player) => {
      // Warm the goal background without making its load time delay the live
      // player reveal. Large videos can take several seconds to buffer.
      if (goalGif2) void preloadMedia(goalGif2);

      let perimeterFiles:
        | Record<string, { name: string; source: string }>
        | undefined;
      let semanticCommand:
        | ReturnType<typeof buildGoalScorerOverlayCommand>
        | undefined;
      if (renderer === "web") {
        // Web venues compose the scorer in the browser from semantic data;
        // generated perimeter media is neither required nor referenced.
        const scorerPlayer = goalScorerPlayerFromSelection(player);
        if (scorerPlayer) {
          semanticCommand = buildGoalScorerOverlayCommand(scorerPlayer);
        }
      } else if (renderer === "resolume") {
        // Retain the prepared-file workflow for Resolume venues: only a
        // ready personalized or crest-fallback result replaces the generic
        // goal overlay.
        const result =
          player.id !== undefined && player.id !== null
            ? goalScorerPreparationStatus?.players[String(player.id)]
            : undefined;
        perimeterFiles =
          result &&
          (result.status === "ready" || result.status === "fallback") &&
          result.files?.["2"] &&
          result.files["4"]
            ? result.files
            : undefined;
      }
      // A missing or invalid published mapping intentionally leaves the
      // generic goal overlay unchanged.

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
        if (perimeterFiles) {
          setPerimeterOverlay(buildScorerOverlay(perimeterFiles));
        }
      });

      onClose();
    },
    [
      teamName,
      listenPrefix,
      renderer,
      renderAsset,
      onClose,
      goalGif2,
      goalScorerPreparationStatus,
      setPerimeterOverlay,
    ],
  );

  // Per-player readiness for the selection dialog. Web venues do not use
  // roster-wide generated media: absent preparation status must never mark
  // players unavailable, so web readiness stays unlabeled.
  const readiness: Record<string, GoalScorerPlayerStatus> = {};
  if (renderer === "resolume") {
    for (const [playerId, result] of Object.entries(
      goalScorerPreparationStatus?.players ?? {},
    )) {
      readiness[playerId] = result.status;
    }
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
