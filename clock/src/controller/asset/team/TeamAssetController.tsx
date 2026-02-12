import React, { useState } from "react";
import axios from "axios";

import { RingLoader } from "react-spinners";
import clubIds from "../../../club-ids";
import apiConfig from "../../../apiConfig";

import Team from "./Team";
import SubView from "./SubView";
import assetTypes from "../AssetTypes";
import MatchSelector from "./MatchSelector";
import { getMOTMAsset, getPlayerAssetObject } from "./assetHelpers";
import { Player, AvailableMatches } from "../../../types";
import {
  useController,
  useMatch,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";

interface SubPlayer extends Player {
  teamName: string;
}

interface OwnProps {
  // TODO: Fix any usage [Asset types across components need unification - addAssets accepts mixed sync/async assets]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addAssets: (assets: any[], options?: { showNow?: boolean }) => void;
  previousView: () => void;
}

const TeamAssetController = (props: OwnProps): React.JSX.Element => {
  const { addAssets, previousView } = props;
  const { match } = useMatch();
  const {
    controller: { availableMatches, selectedMatch },
    clearMatchPlayers,
    setAvailableMatches,
  } = useController();
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

  const getAvailableMatches = (homeTeam: string, awayTeam: string) => {
    const options = {
      params: {
        homeTeam: clubIds[homeTeam as keyof typeof clubIds],
        awayTeam: clubIds[awayTeam as keyof typeof clubIds],
      },
    };
    return axios
      .get<AvailableMatches>(`${apiConfig.gateWayUrl}match-report`, options)
      .then((response) => {
        setAvailableMatches(response.data);
      });
  };

  const getTeamPlayers = (): { homeTeam: Player[]; awayTeam: Player[] } => {
    const { homeTeam, awayTeam } = match;
    const selectedMatchObj = selectedMatch
      ? availableMatches[selectedMatch]
      : undefined;
    const clubIdsMap = clubIds as Record<string, string>;
    const homeTeamId = clubIdsMap[homeTeam];
    const awayTeamId = clubIdsMap[awayTeam];
    return {
      homeTeam:
        selectedMatchObj?.players && homeTeamId
          ? selectedMatchObj.players[homeTeamId] || []
          : [],
      awayTeam:
        selectedMatchObj?.players && awayTeamId
          ? selectedMatchObj.players[awayTeamId] || []
          : [],
    };
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

  const addPlayersToQ = (): void => {
    const { homeTeam, awayTeam } = getTeamPlayers();
    const teamAssets = [
      { team: awayTeam, teamName: match.awayTeam },
      { team: homeTeam, teamName: match.homeTeam },
    ].map(({ team, teamName }) =>
      team
        .filter((p) => p.show)
        .map((player) =>
          getPlayerAssetObject({ player, teamName, listenPrefix }),
        ),
    );
    const flattened = ([] as unknown[]).concat(...teamAssets);
    if (!flattened.every((i) => i)) {
      setError("Missing name/number for some players to show");
    } else {
      addAssets(flattened);
      previousView();
    }
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
        addAssets(
          [
            {
              type: assetTypes.SUB,
              subIn: subInObj,
              subOut: subOutObj,
              key: `sub-${subInObj.key}-${subOutObj.key}`,
            },
          ],
          {
            showNow: true,
          },
        );
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
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: actualTeamName,
          listenPrefix,
        }),
      ],
      {
        showNow: true,
      },
    );
    clearState();
  };

  const selectGoalScorerAction = (player: Player, teamName: string): void => {
    const actualTeamName =
      teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: actualTeamName,
          overlay: {
            text: "",
            blink: true,
            effect: effect,
          },
          listenPrefix,
        }),
      ],
      {
        showNow: true,
      },
    );
    clearState();
  };

  const selectMOTMAction = (player: Player, teamName: string): void => {
    const actualTeamName =
      teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    addAssets(
      [getMOTMAsset({ player, teamName: actualTeamName, listenPrefix })],
      {
        showNow: true,
      },
    );
    clearState();
  };

  const autoFill = (): void => {
    const { homeTeam, awayTeam } = match;
    if (!homeTeam || !awayTeam) {
      setError("Choose teams first");
      return;
    }
    setLoading(true);
    void getAvailableMatches(homeTeam, awayTeam)
      .then(() => setError(""))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const renderActionButtons = (): React.JSX.Element => {
    if (selectSubs) {
      return (
        <button
          type="button"
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
    return (
      <div>
        <div className="control-item stdbuttons">
          <button type="button" onClick={() => setSelectSubs(true)}>
            Skipting
          </button>
        </div>
        <div className="control-item stdbuttons">
          <button type="button" onClick={() => setSelectPlayerAsset(true)}>
            Birta leikmann
          </button>
        </div>
        <div className="control-item stdbuttons">
          <button type="button" onClick={() => setSelectGoalScorer(true)}>
            Birta markaskorara
          </button>
        </div>
        <div className="control-item stdbuttons">
          <button type="button" onClick={() => setSelectMOTM(true)}>
            Birta mann leiksins
          </button>
        </div>
        <div className="control-item stdbuttons">
          <select
            onChange={({ target: { value } }) => setEffect(value)}
            value={effect}
          >
            <option value="blink" key="Blink">
              Blink
            </option>
            <option value="shaker" key="Shaker">
              Shaker
            </option>
            <option value="scaleit" key="Scale Up">
              Scale Up
            </option>
          </select>
        </div>
      </div>
    );
  };

  const renderActionControllers = (): React.JSX.Element => {
    return (
      <div className="sub-controller control-item stdbuttons">
        {renderActionButtons()}
        {selectSubs ? (
          <div className="control-item">
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
          </div>
        ) : null}
      </div>
    );
  };

  const renderControls = (): React.JSX.Element => {
    const { homeTeam, awayTeam } = getTeamPlayers();
    return (
      <div>
        {!(homeTeam.length || awayTeam.length) ? (
          <div className="control-item stdbuttons">
            <button type="button" onClick={autoFill}>
              Sækja lið
            </button>
          </div>
        ) : null}
        {homeTeam.length ||
        awayTeam.length ||
        Object.keys(availableMatches).length ? (
          <div className="control-item stdbuttons">
            <button
              type="button"
              onClick={() =>
                window.confirm("Ertu alveg viss?") && clearMatchPlayers()
              }
            >
              Hreinsa lið
            </button>
          </div>
        ) : null}
        {homeTeam.length || awayTeam.length ? (
          <div className="control-item stdbuttons">
            <button type="button" onClick={addPlayersToQ}>
              Setja lið í biðröð
            </button>
          </div>
        ) : null}
        {availableMatches && Object.keys(availableMatches || {}).length > 1 ? (
          <MatchSelector />
        ) : null}
        {homeTeam.length || awayTeam.length ? renderActionControllers() : null}
      </div>
    );
  };

  const renderTeam = (teamName: "homeTeam" | "awayTeam"): React.JSX.Element => {
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
    return <Team teamName={teamName} selectPlayer={selectPlayerAction} />;
  };

  if (!match.homeTeam || !match.awayTeam) {
    return <div>Veldu lið fyrst</div>;
  }
  return (
    <div className="team-asset-controller">
      <RingLoader loading={loading} />
      {!loading && renderControls()}
      <span className="error">{error}</span>
      <div className="team-asset-controller">
        {renderTeam("homeTeam")}
        {renderTeam("awayTeam")}
      </div>
    </div>
  );
};

export default TeamAssetController;
