import { useState } from "react";

import {
  useController,
  useMatch,
  useView,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import assetTypes from "../AssetTypes";
import { Asset, Player } from "../../../types";
import { getMOTMAsset, getPlayerAssetObject } from "./assetHelpers";

type TeamKey = "homeTeam" | "awayTeam";
type QuickActionMode = null | "subOff" | "subOn" | "playerCard" | "motm";

const SUBS_QUEUE_NAME = "Skiptingar";

const trimLastName = (player: Player): Player => ({
  ...player,
  name: player.name
    .split(" ")
    .slice(0, player.name.split(" ").length - 1)
    .join(" "),
});

export function useHomeTeamQuickActions() {
  const { match } = useMatch();
  const {
    controller,
    editPlayer,
    createQueue,
    addItemsToQueue,
    activateQueue,
    showItemNow,
  } = useController();
  const { view } = useView();
  const { listenPrefix } = useRemoteSettings();
  const { roster } = controller;

  const [modalMode, setModalMode] = useState<QuickActionMode>(null);
  const [subSide, setSubSide] = useState<"home" | "away">("home");
  const [subOffPlayer, setSubOffPlayer] = useState<Player | null>(null);

  const addSubToQueue = (asset: Asset): void => {
    const existingQueue = Object.values(controller.queues).find(
      (q) => q.name === SUBS_QUEUE_NAME,
    );
    const queueId = existingQueue
      ? existingQueue.id
      : createQueue(SUBS_QUEUE_NAME, { cycle: false });
    addItemsToQueue(queueId, [asset]);
    activateQueue(queueId);
  };

  const showPlayerCard = (player: Player, teamKey: TeamKey): Promise<void> => {
    const actualTeamName =
      teamKey === "homeTeam" ? match.homeTeam : match.awayTeam;
    return (async () => {
      const playerAsset = await getPlayerAssetObject({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!playerAsset) return;
      const homeRevealBg = view.homeTeamRevealBackground;
      const assetWithBg =
        teamKey === "homeTeam" && homeRevealBg
          ? { ...playerAsset, background: homeRevealBg }
          : playerAsset;
      showItemNow(assetWithBg);
    })();
  };

  const showMOTM = (player: Player, teamKey: TeamKey): Promise<void> => {
    const actualTeamName =
      teamKey === "homeTeam" ? match.homeTeam : match.awayTeam;
    return (async () => {
      const motmAsset = await getMOTMAsset({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!motmAsset) return;
      const homeRevealBg = view.homeTeamRevealBackground;
      const assetWithBg =
        teamKey === "homeTeam" && homeRevealBg
          ? { ...motmAsset, background: homeRevealBg }
          : motmAsset;
      showItemNow(assetWithBg);
    })();
  };

  const openSubModal = (side: "home" | "away"): void => {
    setSubSide(side);
    setSubOffPlayer(null);
    setModalMode("subOff");
  };

  const openPlayerCardModal = (): void => {
    setSubOffPlayer(null);
    setModalMode("playerCard");
  };

  const openMOTMModal = (): void => {
    setSubOffPlayer(null);
    setModalMode("motm");
  };

  const handleSubOffSelect = (player: Player): void => {
    setSubOffPlayer(player);
    setModalMode("subOn");
  };

  const handleSubOnSelect = (player: Player): void => {
    if (!subOffPlayer) return;
    const side = subSide;
    const teamKey: TeamKey = side === "home" ? "homeTeam" : "awayTeam";
    const actualTeamName = side === "home" ? match.homeTeam : match.awayTeam;
    const players = roster[side] || [];

    const offIdx = players.findIndex(
      (p) => p.number === subOffPlayer.number && p.name === subOffPlayer.name,
    );
    const onIdx = players.findIndex(
      (p) => p.number === player.number && p.name === player.name,
    );
    if (offIdx !== -1) editPlayer(side, offIdx, { show: false });
    if (onIdx !== -1) editPlayer(side, onIdx, { show: true });

    setModalMode(null);

    const subOffTrimmed = trimLastName(subOffPlayer);
    const subOnTrimmed = trimLastName(player);

    void (async () => {
      const subInObj = await getPlayerAssetObject({
        player: subOffTrimmed,
        teamName: actualTeamName,
        listenPrefix,
      });
      const subOutObj = await getPlayerAssetObject({
        player: subOnTrimmed,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!subInObj || !subOutObj) return;
      const homeRevealBg = view.homeTeamRevealBackground;
      const isHome = teamKey === "homeTeam";
      const finalSubIn =
        isHome && homeRevealBg
          ? { ...subInObj, background: homeRevealBg }
          : subInObj;
      const finalSubOut =
        isHome && homeRevealBg
          ? { ...subOutObj, background: homeRevealBg }
          : subOutObj;
      addSubToQueue({
        type: assetTypes.SUB,
        subIn: { ...finalSubIn, fullName: subOffPlayer.name },
        subOut: { ...finalSubOut, fullName: player.name },
        key: `sub-${subInObj.key}-${subOutObj.key}`,
      });
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
    } else if (modalMode === "playerCard") {
      void showPlayerCard(player, "homeTeam").then(() => closeModal());
    } else if (modalMode === "motm") {
      void showMOTM(player, "homeTeam").then(() => closeModal());
    }
  };

  const closeModal = (): void => {
    setModalMode(null);
    setSubOffPlayer(null);
  };

  return {
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
  };
}
