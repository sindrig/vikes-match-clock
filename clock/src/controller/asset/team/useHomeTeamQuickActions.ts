import { useLayoutEffect, useRef, useState } from "react";

import {
  useController,
  useMatch,
  useView,
} from "../../../contexts/FirebaseStateContext";
import { useLocalState } from "../../../contexts/LocalStateContext";
import { MutationRejectedError } from "../../../lib/mutationSession";
import assetTypes from "../AssetTypes";
import { Player } from "../../../types";
import { getMOTMAsset, getPlayerAssetObject } from "./assetHelpers";

type TeamKey = "homeTeam" | "awayTeam";
type QuickActionMode = null | "subOff" | "subOn" | "playerCard" | "motm";

const trimLastName = (player: Player): Player => ({
  ...player,
  name: player.name
    .split(" ")
    .slice(0, player.name.split(" ").length - 1)
    .join(" "),
});

export function useHomeTeamQuickActions() {
  const { match } = useMatch();
  const { controller, appendSubstitutionAndActivate, renderAsset } =
    useController();
  const { view } = useView();
  const { listenPrefix, mutationSession } = useLocalState();
  const { roster } = controller;

  const [error, setError] = useState("");

  const [modalMode, setModalMode] = useState<QuickActionMode>(null);
  const [subSide, setSubSide] = useState<"home" | "away">("home");
  const [subOffPlayer, setSubOffPlayer] = useState<Player | null>(null);
  const currentSelection = useRef<symbol | null>(null);
  useLayoutEffect(
    () => () => {
      currentSelection.current = null;
    },
    [],
  );

  const retireSelection = (): void => {
    currentSelection.current = null;
    setError("");
  };

  // Shared with the team tab: feedback belongs to the latest explicit action,
  // even when an independent substitution is still preparing or committing.
  const beginAction = () => {
    const selection = Symbol();
    currentSelection.current = selection;
    const origin = mutationSession.getSnapshot();
    const isSelected = () => currentSelection.current === selection;
    const ownsUI = () => isSelected() && mutationSession.isCurrent(origin);
    setError("");
    return {
      isSelected,
      ownsUI,
      canReport: (failure: unknown) =>
        isSelected() && (failure instanceof MutationRejectedError || ownsUI()),
    };
  };

  const showPlayerCard = (
    player: Player,
    teamKey: TeamKey,
    isSelected = () => true,
  ): Promise<void> => {
    const actualTeamName =
      teamKey === "homeTeam" ? match.homeTeam : match.awayTeam;
    return (async () => {
      const playerAsset = await getPlayerAssetObject({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!playerAsset || !isSelected()) return;
      const homeRevealBg = view.homeTeamRevealBackground;
      const assetWithBg =
        teamKey === "homeTeam" && homeRevealBg
          ? { ...playerAsset, background: homeRevealBg }
          : playerAsset;
      await renderAsset(assetWithBg);
    })();
  };

  const showMOTM = (
    player: Player,
    teamKey: TeamKey,
    isSelected = () => true,
  ): Promise<void> => {
    const actualTeamName =
      teamKey === "homeTeam" ? match.homeTeam : match.awayTeam;
    return (async () => {
      const motmAsset = await getMOTMAsset({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!motmAsset || !isSelected()) return;
      const homeRevealBg = view.homeTeamRevealBackground;
      const assetWithBg =
        teamKey === "homeTeam" && homeRevealBg
          ? { ...motmAsset, background: homeRevealBg }
          : motmAsset;
      await renderAsset(assetWithBg);
    })();
  };

  const openSubModal = (side: "home" | "away"): void => {
    retireSelection();
    setSubSide(side);
    setSubOffPlayer(null);
    setModalMode("subOff");
  };

  const openPlayerCardModal = (): void => {
    retireSelection();
    setSubOffPlayer(null);
    setModalMode("playerCard");
  };

  const openMOTMModal = (): void => {
    retireSelection();
    setSubOffPlayer(null);
    setModalMode("motm");
  };

  const handleSubOffSelect = (player: Player): void => {
    setSubOffPlayer(player);
    setModalMode("subOn");
  };

  const handleSubOnSelect = (player: Player): void => {
    if (!subOffPlayer) return;
    const outgoing = subOffPlayer;
    const side = subSide;
    const actualTeamName = side === "home" ? match.homeTeam : match.awayTeam;
    // Capture before the first await. Never use a ref to a newer command here.
    const commit = appendSubstitutionAndActivate;
    const action = beginAction();
    setModalMode(null);

    void (async () => {
      try {
        const [subInObj, subOutObj] = await Promise.all([
          getPlayerAssetObject({
            player: trimLastName(player),
            teamName: actualTeamName,
            listenPrefix,
          }),
          getPlayerAssetObject({
            player: trimLastName(outgoing),
            teamName: actualTeamName,
            listenPrefix,
          }),
        ]);
        if (!subInObj || !subOutObj)
          throw new Error("Ekki tókst að undirbúa skiptingu.");
        const homeRevealBg =
          side === "home" ? view.homeTeamRevealBackground : null;
        const finalSubIn = homeRevealBg
          ? { ...subInObj, background: homeRevealBg }
          : subInObj;
        const finalSubOut = homeRevealBg
          ? { ...subOutObj, background: homeRevealBg }
          : subOutObj;
        await commit({
          side,
          outgoing,
          incoming: player,
          asset: {
            type: assetTypes.SUB,
            subIn: { ...finalSubIn, fullName: player.name },
            subOut: { ...finalSubOut, fullName: outgoing.name },
            key: `sub-${subInObj.key}-${subOutObj.key}`,
          },
        });
      } catch (failure) {
        // Retiring feedback must not cancel a still-valid substitution intent.
        if (!action.ownsUI()) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Ekki tókst að vista skiptingu.",
        );
      }
    })();
  };

  const getModalTitle = (): string => {
    if (modalMode === "subOff" || modalMode === "subOn") {
      const teamName = subSide === "home" ? match.homeTeam : match.awayTeam;
      return `Skipting – ${teamName}`;
    }
    if (modalMode === "playerCard") return "Birta leikmann";
    if (modalMode === "motm") return "Maður leiksins";
    return "";
  };

  const getModalInstruction = (): string => {
    if (modalMode === "subOff") return "Veldu leikmann sem fer AF velli";
    if (modalMode === "subOn" && subOffPlayer) {
      const num = subOffPlayer.number ?? "";
      return `#${String(num)} ${subOffPlayer.name} fer af – veldu leikmann sem kemur INN`;
    }
    if (modalMode === "playerCard") return "Veldu leikmann til að birta";
    if (modalMode === "motm") return "Veldu mann leiksins";
    return "";
  };

  const getModalPlayers = (): Player[] => {
    if (modalMode === "subOff") {
      return (roster[subSide] || []).filter((p) => p.show);
    }
    if (modalMode === "subOn") {
      return (roster[subSide] || []).filter((p) => !p.show && p.number != null);
    }
    if (modalMode === "playerCard" || modalMode === "motm") {
      return roster.home;
    }
    return [];
  };

  const handleModalSelect = (player: Player): void => {
    if (modalMode === "subOff") {
      handleSubOffSelect(player);
    } else if (modalMode === "subOn") {
      handleSubOnSelect(player);
    } else if (modalMode === "playerCard" || modalMode === "motm") {
      const action = beginAction();
      const show = modalMode === "playerCard" ? showPlayerCard : showMOTM;
      void show(player, "homeTeam", action.isSelected)
        .then(() => {
          if (action.ownsUI()) closeModal();
        })
        .catch((failure: unknown) => {
          // A current draft can explain an origin rejection before submission.
          // A submitted write's late feedback belongs only to its old session.
          if (action.canReport(failure)) reportError(failure);
        });
    }
  };

  const reportError = (failure: unknown): void => {
    setError(
      failure instanceof Error
        ? failure.message
        : "Ekki tókst að birta leikmann.",
    );
  };

  const closeModal = (): void => {
    retireSelection();
    setModalMode(null);
    setSubOffPlayer(null);
  };

  return {
    error,
    modalMode,
    modalTitle: getModalTitle(),
    modalInstruction: getModalInstruction(),
    modalPlayers: getModalPlayers(),
    openSubModal,
    openPlayerCardModal,
    openMOTMModal,
    handleModalSelect,
    closeModal,
    showPlayerCard,
    showMOTM,
    beginAction,
  };
}
