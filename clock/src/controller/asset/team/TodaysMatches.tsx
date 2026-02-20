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
  transformLineups,
  getTeamId,
  V3Match,
} from "../../../lib/v3-api";

interface MatchData {
  match_id: string;
  date: string;
  time: string;
  competition: string;
  home: {
    name: string;
  };
  away: {
    name: string;
  };
}

const TodaysMatches = (): React.JSX.Element => {
  const { setAvailableMatches } = useController();
  const { updateMatch } = useMatch();
  const { screens } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [v3Matches, setV3Matches] = useState<V3Match[]>([]);

  const fetchTodaysMatches = async (): Promise<void> => {
    const teamId = getTeamId(screens, listenPrefix);
    setLoading(true);

    try {
      const fetched = await fetchMatchesByTeam(teamId);
      const mapped: MatchData[] = fetched.map((match) => {
        const dt = new Date(match.dateTimeUTC);
        return {
          match_id: String(match.id),
          date: dt.toLocaleDateString("is-IS"),
          time: dt.toLocaleTimeString("is-IS", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          competition: match.competition.name,
          home: { name: match.homeTeam.name },
          away: { name: match.awayTeam.name },
        };
      });
      setError("");
      setMatches(mapped);
      setV3Matches(fetched);
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
      let v3Match = v3Matches.find((m) => String(m.id) === matchId);
      if (!v3Match) {
        const freshMatches = await fetchMatchesByTeam(teamId);
        v3Match = freshMatches.find((m) => String(m.id) === matchId);
      }
      if (!v3Match) {
        setError("Match not found");
        setLoading(false);
        return;
      }
      const players = transformLineups(lineups, v3Match);
      setAvailableMatches({
        [matchId]: {
          players,
          group: v3Match.competition.name,
        },
      });
      setError("");
      setLoading(false);
      setMatches([]);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
      setLoading(false);
    }
  };

  const selectMatchHandler = async (match: MatchData): Promise<void> => {
    setLoading(true);
    updateMatch({
      homeTeam: match.home.name,
      awayTeam: match.away.name,
      matchStartTime: match.time,
    });

    const teamId = getTeamId(screens, listenPrefix);
    const matchId = Number(match.match_id);

    try {
      const v3Match = v3Matches.find((m) => String(m.id) === match.match_id);
      const lineups = await fetchLineups(teamId, matchId);
      if (v3Match) {
        const players = transformLineups(lineups, v3Match);
        setAvailableMatches({
          [match.match_id]: {
            players,
            group: v3Match.competition.name,
          },
        });
      }
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
            key={match.match_id}
            onClick={() => {
              void selectMatchHandler(match);
            }}
          >
            {match.date} {match.time} {match.competition} [{match.home.name} -{" "}
            {match.away.name}]{" "}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TodaysMatches;
