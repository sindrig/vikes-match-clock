import React, { useState } from "react";

import { RingLoader } from "react-spinners";

import Team from "./Team";
import SubView from "./SubView";
import assetTypes from "../AssetTypes";
import { getMOTMAsset, getPlayerAssetObject } from "./assetHelpers";
import { Asset, Player } from "../../../types";
import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import "../../../api/clientConfig";
import { getLineups } from "../../../api/client";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";

interface SubPlayer extends Player {
  teamName: string;
}

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
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectSubs, setSelectSubs] = useState(false);
  const [subTeam, setSubTeam] = useState<string | null>(null);
  const [subIn, setSubIn] = useState<SubPlayer | null>(null);
  const [subOut, setSubOut] = useState<Player | null>(null);
  const [selectPlayerAsset, setSelectPlayerAsset] = useState(false);
  const [selectGoalScorer, setSelectGoalScorer] = useState(false);
  const [selectMOTM, setSelectMOTM] = useState(false);
  const [effect, setEffect] = useState("blink");

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

  const clearState = (): void => {
    setError("");
    setSelectSubs(false);
    setSubTeam(null);
    setSubIn(null);
    setSubOut(null);
    setSelectPlayerAsset(false);
    setSelectGoalScorer(false);
    setSelectMOTM(false);
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
    const newQueueId = createQueue(teamName);

    const resolved = await Promise.all(assetPromises);
    const validAssets: Asset[] = resolved.filter((a) => a !== null);
    addItemsToQueue(newQueueId, validAssets);

    previousView();
  };

  const selectSubsAction = (player: Player, teamName: string): void => {
    const asset: Player = {
      ...player,
      name: player.name
        .split(" ")
        .slice(0, player.name.split(" ").length - 1)
        .join(" "),
    };
    if (subIn) {
      setSubOut(asset);
      void (async () => {
        const currentSubOut = asset;
        if (!subIn) return;

        const tName =
          subIn.teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
        const subInObj = await getPlayerAssetObject({
          player: subIn,
          teamName: tName,
          listenPrefix,
        });
        const subOutObj = await getPlayerAssetObject({
          player: currentSubOut,
          teamName: tName,
          listenPrefix,
        });
        if (!subInObj || !subOutObj) return;
        showItemNow({
          type: assetTypes.SUB,
          subIn: subInObj,
          subOut: subOutObj,
          key: `sub-${subInObj.key}-${subOutObj.key}`,
        });
        clearState();
      })();
    } else {
      setSubIn({ teamName, ...asset });
      setSubTeam(teamName);
    }
  };

  const selectPlayerAssetAction = (player: Player, teamName: string): void => {
    const actualTeamName =
      teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    void (async () => {
      const playerAsset = await getPlayerAssetObject({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!playerAsset) return;
      showItemNow(playerAsset);
      clearState();
    })();
  };

  const selectGoalScorerAction = (player: Player, teamName: string): void => {
    const actualTeamName =
      teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    void (async () => {
      const goalAsset = await getPlayerAssetObject({
        player,
        teamName: actualTeamName,
        overlay: {
          text: "",
          blink: true,
          effect: effect,
        },
        listenPrefix,
      });
      if (!goalAsset) return;
      showItemNow(goalAsset);
      clearState();
    })();
  };

  const selectMOTMAction = (player: Player, teamName: string): void => {
    const actualTeamName =
      teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    void (async () => {
      const motmAsset = await getMOTMAsset({
        player,
        teamName: actualTeamName,
        listenPrefix,
      });
      if (!motmAsset) return;
      showItemNow(motmAsset);
      clearState();
    })();
  };

  const isPlayerActionActive =
    selectSubs || selectPlayerAsset || selectGoalScorer || selectMOTM;

  const renderCancelButton = (): React.JSX.Element | null => {
    if (selectSubs) {
      return (
        <button
          type="button"
          className="cancel-btn"
          onClick={() => {
            setSelectSubs(false);
            setSubIn(null);
            setSubOut(null);
            setSubTeam(null);
          }}
        >
          Hætta við skiptingu
        </button>
      );
    }
    if (selectPlayerAsset || selectGoalScorer || selectMOTM) {
      return (
        <button
          type="button"
          className="cancel-btn"
          onClick={() => {
            setSelectPlayerAsset(false);
            setSelectGoalScorer(false);
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
          <>
            {renderCancelButton()}
            {selectSubs ? (
              <SubView
                subIn={subIn}
                subOut={subOut}
                subTeam={
                  subTeam
                    ? subTeam === "homeTeam"
                      ? match.homeTeam
                      : match.awayTeam
                    : null
                }
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="button-row">
              <button type="button" onClick={() => setSelectSubs(true)}>
                Skipting
              </button>
              <button type="button" onClick={() => setSelectPlayerAsset(true)}>
                Birta leikmann
              </button>
              <button type="button" onClick={() => setSelectGoalScorer(true)}>
                Birta markaskorara
              </button>
              <button type="button" onClick={() => setSelectMOTM(true)}>
                Birta mann leiksins
              </button>
            </div>
            <select
              className="effect-select"
              onChange={({ target: { value } }) => setEffect(value)}
              value={effect}
            >
              <option value="blink">Blink</option>
              <option value="shaker">Shaker</option>
              <option value="scaleit">Scale Up</option>
            </select>
          </>
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
      | ((player: Player, teamName: string) => void)
      | null = null;
    if (selectSubs) {
      if (!subTeam || subTeam === teamName) {
        selectPlayerAction = selectSubsAction;
      }
    } else if (selectPlayerAsset) {
      selectPlayerAction = selectPlayerAssetAction;
    } else if (selectGoalScorer) {
      selectPlayerAction = selectGoalScorerAction;
    } else if (selectMOTM) {
      selectPlayerAction = selectMOTMAction;
    }
    return (
      <div className="team-column-wrapper">
        {hasPlayers && !isPlayerActionActive ? (
          <button
            type="button"
            className="queue-team-btn"
            onClick={() => void addTeamToQueue(side)}
          >
            Setja lið í biðröð
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
    </div>
  );
};

export default TeamAssetController;
