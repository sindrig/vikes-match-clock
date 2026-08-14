import React, { useState } from "react";

import { RingLoader } from "react-spinners";

import Team from "./Team";
import TeamPlayerSelectionModal from "./TeamPlayerSelectionModal";
import ResolveRosterModal from "./ResolveRosterModal";
import { getPlayerAssetObject } from "./assetHelpers";
import { useHomeTeamQuickActions } from "./useHomeTeamQuickActions";
import { Asset, Player } from "../../../types";
import {
  useController,
  useMatch,
  useListeners,
  useView,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import "../../../api/clientConfig";
import { getLineups } from "../../../api/client";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";
import { resolveGoalBackground } from "../../../utils/matchUtils";

interface OwnProps {
  previousView: () => void;
}

const TeamAssetController = (props: OwnProps): React.JSX.Element => {
  const { previousView } = props;
  const { match } = useMatch();
  const {
    controller,
    setRoster,
    clearRoster,
    createQueue,
    deleteQueue,
    addItemsToQueue,
    showItemNow,
  } = useController();
  const { roster } = controller;
  const { screens } = useListeners();
  const { view } = useView();
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectPlayerAsset, setSelectPlayerAsset] = useState(false);
  const [selectMOTM, setSelectMOTM] = useState(false);
  const [goalScorerOpen, setGoalScorerOpen] = useState(false);
  const [resolveRosterSide, setResolveRosterSide] = useState<
    "home" | "away" | null
  >(null);

  const {
    modalMode: quickActionsModalMode,
    modalTitle: quickActionsModalTitle,
    modalInstruction: quickActionsModalInstruction,
    modalPlayers: quickActionsModalPlayers,
    openSubModal,
    handleModalSelect: quickActionsHandleModalSelect,
    closeModal: quickActionsCloseModal,
    showPlayerCard,
    showMOTM,
  } = useHomeTeamQuickActions();

  const refetchRoster = (): void => {
    if (!match.ksiMatchId) return;
    setLoading(true);
    const teamId = getTeamId(screens, listenPrefix);
    void getLineups({
      path: { teamId, matchId: match.ksiMatchId },
    })
      .then((result) => {
        const lineups = result.data ?? {
          home: { players: [], officials: [] },
          away: { players: [], officials: [] },
        };
        const rosterData = transformLineups(lineups);
        setRoster(rosterData);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const handleResolveRosterConfirm = (players: Player[]): void => {
    if (!resolveRosterSide) return;
    setRoster({ ...roster, [resolveRosterSide]: players });
    setResolveRosterSide(null);
  };

  const addTeamToQueue = async (side: "home" | "away"): Promise<void> => {
    const players = roster[side];
    const teamName = side === "home" ? match.homeTeam : match.awayTeam;

    const playersToShow = players.filter((p) => p.show);
    if (playersToShow.some((p) => !p.name || p.id === undefined)) {
      setError("Missing name/number for some players to show");
      return;
    }

    const assetPromises = playersToShow.map((player) =>
      getPlayerAssetObject({ player, teamName, listenPrefix }),
    );

    const existingQueue = Object.values(controller.queues).find(
      (q) => q.name === teamName,
    );
    if (existingQueue) {
      deleteQueue(existingQueue.id);
    }
    const newQueueId = createQueue(teamName, { cycle: false });

    const resolved = await Promise.all(assetPromises);
    const validAssets: Asset[] = resolved.filter((a) => a !== null);
    const homeRevealBg = view.homeTeamRevealBackground;
    const assetsWithBg =
      side === "home" && homeRevealBg
        ? validAssets.map((a) => ({ ...a, background: homeRevealBg }))
        : validAssets;
    addItemsToQueue(newQueueId, assetsWithBg);

    previousView();
  };

  const selectPlayerAssetAction = (
    player: Player,
    teamName: "homeTeam" | "awayTeam",
  ): void => {
    void showPlayerCard(player, teamName).then(() => {
      setSelectPlayerAsset(false);
      setSelectMOTM(false);
    });
  };

  const selectMOTMAction = (
    player: Player,
    teamName: "homeTeam" | "awayTeam",
  ): void => {
    void showMOTM(player, teamName).then(() => {
      setSelectPlayerAsset(false);
      setSelectMOTM(false);
    });
  };

  const handleGoalScorerModalSelect = (player: Player): void => {
    const actualTeamName = match.homeTeam;
    setGoalScorerOpen(false);
    void (async () => {
      const goalAsset = await getPlayerAssetObject({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!goalAsset) return;
      const goalBg = resolveGoalBackground(view);
      showItemNow({
        ...goalAsset,
        isGoalCelebration: true,
        ...(goalBg ? { background: goalBg } : {}),
      });
    })();
  };

  const isPlayerActionActive = selectPlayerAsset || selectMOTM;

  const renderCancelButton = (): React.JSX.Element | null => {
    if (selectPlayerAsset || selectMOTM) {
      return (
        <button
          type="button"
          className="cancel-btn"
          onClick={() => {
            setSelectPlayerAsset(false);
            setSelectMOTM(false);
          }}
        >
          Hætta við birtingu
        </button>
      );
    }
    return null;
  };

  const renderPlayerActions = (): React.JSX.Element => {
    return (
      <div className="button-group">
        <div className="button-group-label">Leikmannaval</div>
        {isPlayerActionActive ? (
          renderCancelButton()
        ) : (
          <div className="button-row">
            <button type="button" onClick={() => setSelectPlayerAsset(true)}>
              Birta leikmann
            </button>
            <button type="button" onClick={() => setGoalScorerOpen(true)}>
              Birta markaskorara
            </button>
            <button type="button" onClick={() => setSelectMOTM(true)}>
              Birta mann leiksins
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderControls = (): React.JSX.Element => {
    const hasPlayers = roster.home.length > 0 || roster.away.length > 0;
    return (
      <div className="team-controls">
        <div className="button-group">
          <div className="button-group-label">Lið</div>
          <div className="button-row">
            {match.ksiMatchId !== undefined ? (
              <button type="button" onClick={refetchRoster}>
                Sækja lið
              </button>
            ) : null}
            {hasPlayers ? (
              <button
                type="button"
                onClick={() =>
                  window.confirm("Ertu alveg viss?") && clearRoster()
                }
              >
                Hreinsa lið
              </button>
            ) : null}
          </div>
        </div>
        {hasPlayers ? renderPlayerActions() : null}
      </div>
    );
  };

  const renderTeam = (teamName: "homeTeam" | "awayTeam"): React.JSX.Element => {
    const side = teamName === "homeTeam" ? "home" : "away";
    const players = roster[side] || [];
    const hasPlayers = players.length > 0;

    let selectPlayerAction:
      | ((player: Player, teamName: "homeTeam" | "awayTeam") => void)
      | null = null;
    if (selectPlayerAsset) {
      selectPlayerAction = selectPlayerAssetAction;
    } else if (selectMOTM) {
      selectPlayerAction = selectMOTMAction;
    }
    return (
      <div className="team-column-wrapper">
        {hasPlayers && !isPlayerActionActive ? (
          <>
            <button
              type="button"
              className="queue-team-btn"
              onClick={() => void addTeamToQueue(side)}
            >
              Setja lið í biðröð
            </button>
            <button
              type="button"
              className="queue-team-btn"
              onClick={() => openSubModal(side)}
            >
              Skipting
            </button>
          </>
        ) : null}
        {!hasPlayers &&
        (side === "home" ? match.homeTeamId : match.awayTeamId) ? (
          <button
            type="button"
            className="queue-team-btn"
            onClick={() => setResolveRosterSide(side)}
          >
            Búa til leikmannahóp
          </button>
        ) : null}
        <Team teamName={teamName} selectPlayer={selectPlayerAction} />
      </div>
    );
  };

  if (!match.homeTeam || !match.awayTeam) {
    return <div>Veldu lið fyrst</div>;
  }
  return (
    <div className="team-asset-controller">
      <RingLoader loading={loading} />
      {!loading && renderControls()}
      <span className="error">{error}</span>
      <div className="team-columns">
        {renderTeam("homeTeam")}
        {renderTeam("awayTeam")}
      </div>
      <TeamPlayerSelectionModal
        open={goalScorerOpen}
        onClose={() => setGoalScorerOpen(false)}
        title="Veldu markaskorara"
        instruction="Veldu leikmann sem skoraði"
        players={roster.home}
        onSelect={handleGoalScorerModalSelect}
      />
      <TeamPlayerSelectionModal
        open={quickActionsModalMode !== null}
        onClose={quickActionsCloseModal}
        title={quickActionsModalTitle}
        instruction={quickActionsModalInstruction}
        players={quickActionsModalPlayers}
        onSelect={quickActionsHandleModalSelect}
      />
      <ResolveRosterModal
        open={resolveRosterSide !== null}
        onClose={() => setResolveRosterSide(null)}
        teamId={
          resolveRosterSide === "home" ? match.homeTeamId : match.awayTeamId
        }
        teamName={
          resolveRosterSide === "home" ? match.homeTeam : match.awayTeam
        }
        onConfirm={handleResolveRosterConfirm}
      />
    </div>
  );
};

export default TeamAssetController;
