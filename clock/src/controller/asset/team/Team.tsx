import React, { useState } from "react";
import CloseIcon from "@rsuite/icons/Close";
import { Button, IconButton } from "rsuite";

import TeamPlayer from "./TeamPlayer";
import { Player } from "../../../types";

import "./Team.css";
import {
  useController,
  useMatch,
} from "../../../contexts/FirebaseStateContext";

interface OwnProps {
  teamName: "homeTeam" | "awayTeam";
  selectPlayer?: ((player: Player, teamName: string) => void) | null;
}

const Team = ({ teamName, selectPlayer }: OwnProps): React.JSX.Element => {
  const {
    controller: { roster },
    editPlayer,
    deletePlayer,
    addPlayer,
  } = useController();
  const { match } = useMatch();

  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const side = teamName === "homeTeam" ? "home" : "away";
  const team = roster[side] || [];

  const displayTeamName =
    teamName === "homeTeam" ? match.homeTeam : match.awayTeam;

  const addEmptyLine = (): void => {
    addPlayer(side);
  };

  const removePlayer = (idx: number): void => {
    deletePlayer(side, idx);
  };

  const updatePlayer = (
    idx: number,
  ): ((updatedPlayer: Partial<Player>) => void) => {
    return (updatedPlayer: Partial<Player>) => {
      console.log("updatedPlayer", updatedPlayer);
      editPlayer(side, idx, updatedPlayer);
    };
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
          onChange={({ target: { value } }) => setInputValue(value)}
          placeholder="# leikmanns og ENTER"
          className="player-input"
        />
      </form>
    );
  };

  return (
    <div className="team-asset-container">
      <span>{error}</span>
      {selectPlayer ? renderForm() : null}
      <div className="team-name">{displayTeamName}</div>
      {displayTeamName
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
      {displayTeamName ? (
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
