import React, { useState } from "react";
import { RingLoader } from "react-spinners";

import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import {
  fetchMatchesByTeam,
  fetchLineups,
  ApiMatch,
} from "../../../lib/api";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";

const TodaysMatches = (): React.JSX.Element => {
  const { setRoster } = useController();
  const { updateMatch } = useMatch();
  const { screens } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<ApiMatch[]>([]);

  const fetchTodaysMatches = async (): Promise<void> => {
    const teamId = getTeamId(screens, listenPrefix);
    setLoading(true);

    try {
      const fetched = await fetchMatchesByTeam(teamId);
      setError("");
      setMatches(fetched);
      setLoading(false);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchMatchReport = async (): Promise<void> => {
    const matchId = prompt("ID á leikskýrslu");
    if (!matchId) return;

    const teamId = getTeamId(screens, listenPrefix);
    setLoading(true);

    try {
      const lineups = await fetchLineups(teamId, Number(matchId));
      let foundMatch = matches.find((m) => String(m.id) === matchId);
      if (!foundMatch) {
        const freshMatches = await fetchMatchesByTeam(teamId);
        foundMatch = freshMatches.find((m) => String(m.id) === matchId);
      }
      if (!foundMatch) {
        setError("Match not found");
        setLoading(false);
        return;
      }
      const roster = transformLineups(lineups);
      setRoster(roster);
      updateMatch({ ksiMatchId: Number(matchId) });
      setError("");
      setLoading(false);
      setMatches([]);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
      setLoading(false);
    }
  };

  const selectMatchHandler = async (match: ApiMatch): Promise<void> => {
    setLoading(true);
    updateMatch({
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      matchStartTime: new Date(match.dateTimeUTC).toLocaleTimeString("is-IS", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      ksiMatchId: match.id,
    });

    const teamId = getTeamId(screens, listenPrefix);

    try {
      const lineups = await fetchLineups(teamId, match.id);
      const roster = transformLineups(lineups);
      setRoster(roster);
      setError("");
      setLoading(false);
      setMatches([]);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
      setLoading(false);
    }
  };

  if (!matches.length) {
    return (
      <div>
        <RingLoader loading={loading} />
        <div className="control-item stdbuttons">
          <button
            type="button"
            onClick={() => {
              void fetchTodaysMatches();
            }}
          >
            Sækja leiki í dag
          </button>
          <button
            type="button"
            onClick={() => {
              void fetchMatchReport();
            }}
          >
            Slá inn ID leikskýrslu
          </button>
        </div>
        <span className="error">{error}</span>
      </div>
    );
  }
  return (
    <div>
      <RingLoader loading={loading} />
      <div className="control-item stdbuttons">
        {matches.map((match) => (
          <button
            type="button"
            key={match.id}
            onClick={() => {
              void selectMatchHandler(match);
            }}
          >
            {new Date(match.dateTimeUTC).toLocaleDateString("is-IS")}{" "}
            {new Date(match.dateTimeUTC).toLocaleTimeString("is-IS", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            {match.competition.name} [{match.homeTeam.name} -{" "}
            {match.awayTeam.name}]{" "}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TodaysMatches;
