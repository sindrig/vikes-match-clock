import React, { useState } from "react";
import axios from "axios";
import CloseIcon from "@rsuite/icons/Close";
import ReloadIcon from "@rsuite/icons/Reload";
import { Button, IconButton } from "rsuite";

import TeamPlayer from "./TeamPlayer";
import apiConfig from "../../../apiConfig";
import { Player } from "../../../types";

import "./Team.css";
import { useController, useMatch } from "../../../contexts/FirebaseStateContext";

interface OwnProps {
  teamName: "homeTeam" | "awayTeam";
  selectPlayer?: ((player: Player, teamName: string) => void) | null;
}

interface PlayerResponse {
  id?: number;
  name?: string;
  number?: number | string;
  role?: string;
}

const Team = ({
  teamName,
  selectPlayer,
}: OwnProps): React.JSX.Element => {
  const {
    controller: { availableMatches, selectedMatch },
    editPlayer,
    deletePlayer,
    addPlayer,
  } = useController();
  const { match } = useMatch();

  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedMatchObj = selectedMatch
    ? availableMatches[selectedMatch]
    : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamId = (match as any)[`${teamName}Id`];
  const team = selectedMatchObj?.players
    ? selectedMatchObj.players[String(teamId)] || []
    : [];
  const group = selectedMatchObj?.group;
  const sex = selectedMatchObj?.sex;

  const addEmptyLine = (): void => {
    addPlayer(String(teamId));
  };

  const removePlayer = (idx: number): void => {
    deletePlayer(String(teamId), idx);
  };

  const updatePlayer = (idx: number): ((updatedPlayer: Partial<Player>) => void) => {
    return (updatedPlayer: Partial<Player>) => {
      console.log("updatedPlayer", updatedPlayer);
      editPlayer(String(teamId), idx, updatedPlayer);
    };
  };

  const fetchPlayerId = (idx: number): void => {
    const player = team[idx];

    if (!player || !player.name) {
      setError("Player not found or has no name");
      return;
    }

    const options = {
      params: {
        playerName: player.name,
        teamId,
        group,
        sex,
      },
    };
    setLoading(true);
    axios
      .get<PlayerResponse>(
        `${apiConfig.gateWayUrl}match-report/v2?action=search-for-player`,
        options,
      )
      .then((response) => {
        if (response && response.data && response.data.id) {
          const updatedPlayer: Player = {
            id: response.data.id,
            name: response.data.name || player.name,
            number: response.data.number || player.number,
            role: response.data.role || player.role,
            show: player.show,
          };
          updatePlayer(idx)(updatedPlayer);
        } else {
          setError(`No ID found for player ${String(player.name ?? "unknown")}`);
        }
      })
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const requestedNumber = parseInt(inputValue, 10);
    let found = false;
    team.forEach((player) => {
      if (requestedNumber === parseInt(String(player.number || 0), 10)) {
        selectPlayer?.(player, teamName);
        found = true;
      }
    });
    setError(found ? "" : `No player #${inputValue} found`);
    setInputValue("");
  };

  const renderForm = (): React.JSX.Element => {
    return (
      <form onSubmit={submitForm}>
        <input
          type="text"
          value={inputValue}
          onChange={({ target: { value } }) =>
            setInputValue(value)
          }
          placeholder="# leikmanns og ENTER"
          className="player-input"
        />
      </form>
    );
  };

  return (
    <div
      className="team-asset-container"
      style={loading ? { backgroundColor: "grey" } : {}}
    >
      <span>{error}</span>
      {selectPlayer ? renderForm() : null}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <div className="team-name">{(match as any)[teamName]}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(match as any)[teamName]
        ? team.map((p, i) => (
            <div className="player-whole-line" key={String(i)}>
              {selectPlayer && p.name ? (
                <Button
                  appearance="default"
                  onClick={() => selectPlayer(p, teamName)}
                >{`#${String(p.number ?? (p.role ? p.role[0] : ""))} - ${String(p.name ?? "")}`}</Button>
              ) : (
                <TeamPlayer player={p} onChange={updatePlayer(i)} />
              )}
              {!selectPlayer && !p.id && (
                <IconButton
                  icon={<ReloadIcon />}
                  size="xs"
                  color="blue"
                  appearance="primary"
                  circle
                  onClick={() => fetchPlayerId(i)}
                />
              )}
              {!selectPlayer && (
                <IconButton
                  icon={<CloseIcon />}
                  size="xs"
                  color="red"
                  appearance="primary"
                  circle
                  onClick={() => removePlayer(i)}
                />
              )}
            </div>
          ))
        : null}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(match as any)[teamName] && selectedMatch ? (
        <div>
          <button type="button" onClick={addEmptyLine}>
            Ný lína...
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default Team;
