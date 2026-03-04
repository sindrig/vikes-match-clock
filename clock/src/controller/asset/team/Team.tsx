import React, { useState } from "react";
import { Button } from "rsuite";

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
  } = useController();
  const { match } = useMatch();

  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const side = teamName === "homeTeam" ? "home" : "away";
  const team = roster[side] || [];

  const displayTeamName =
    teamName === "homeTeam" ? match.homeTeam : match.awayTeam;

  const toggleShow = (idx: number, currentShow: boolean): void => {
    editPlayer(side, idx, { show: !currentShow });
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

  const formatPlayerLabel = (p: Player): string => {
    const num = p.number ?? (p.role ? p.role[0] : "");
    return `#${String(num)} - ${String(p.name ?? "")}`;
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
                >
                  {formatPlayerLabel(p)}
                </Button>
              ) : (
                <label className="player-row">
                  <input
                    type="checkbox"
                    checked={p.show || false}
                    onChange={() => toggleShow(i, p.show || false)}
                  />
                  <span className="player-number">
                    {String(p.number ?? "")}
                  </span>
                  <span className="player-name">{p.name ?? ""}</span>
                </label>
              )}
            </div>
          ))
        : null}
    </div>
  );
};

export default Team;
