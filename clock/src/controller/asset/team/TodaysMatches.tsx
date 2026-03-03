import React, { useState } from "react";
import { RingLoader } from "react-spinners";

import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import "../../../api/clientConfig";
import {
  getMatches,
  getMatchInfo,
  getLineups,
  type Match,
  type Team,
} from "../../../api/client";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";

const getClubName = (team: Team): string => team.parent?.name ?? team.name;

const TodaysMatches = (): React.JSX.Element => {
  const { setRoster } = useController();
  const { updateMatch } = useMatch();
  const { screens } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);

  const fetchTodaysMatches = async (): Promise<void> => {
    const teamId = getTeamId(screens, listenPrefix);
    setLoading(true);

    try {
      const result = await getMatches({
        path: { teamId, date: new Date().toISOString().slice(0, 10) },
        query: { utcOffset: 0 },
      });
      const fetched = result.data ?? [];
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
      const infoResult = await getMatchInfo({
        path: { teamId, matchId: Number(matchId) },
      });
      const match = infoResult.data;
      if (!match) {
        setError("Match not found");
        setLoading(false);
        return;
      }

      updateMatch({
        homeTeam: getClubName(match.homeTeam),
        awayTeam: getClubName(match.awayTeam),
        matchStartTime: new Date(match.dateTimeUTC).toLocaleTimeString(
          "is-IS",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        ),
        ksiMatchId: match.id,
      });

      const lineupsResult = await getLineups({
        path: { teamId, matchId: match.id },
      });
      const lineups = lineupsResult.data ?? {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };
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

  const selectMatchHandler = async (match: Match): Promise<void> => {
    setLoading(true);
    updateMatch({
      homeTeam: getClubName(match.homeTeam),
      awayTeam: getClubName(match.awayTeam),
      matchStartTime: new Date(match.dateTimeUTC).toLocaleTimeString("is-IS", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      ksiMatchId: match.id,
    });

    const teamId = getTeamId(screens, listenPrefix);

    try {
      const result = await getLineups({
        path: { teamId, matchId: match.id },
      });
      const lineups = result.data ?? {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };
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
