import React, { useState } from "react";
import axios from "axios";
import { RingLoader } from "react-spinners";

import apiConfig from "../../../apiConfig";
import { Player } from "../../../types";
import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";

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

interface MatchReportResponse {
  players: Record<string, Player[]>;
  group?: string;
  sex?: string;
}

interface MatchesResponse {
  matches: MatchData[];
}

const MatchesOnPitch = (): React.JSX.Element => {
  const { setAvailableMatches } = useController();
  const { updateMatch } = useMatch();
  const { screens } = useListeners();
  const { listenPrefix } = useRemoteSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchData[]>([]);

  const fetchMatchesOnPitch = async (): Promise<void> => {
    const matching = screens.filter(({ key }) => {
      return key === listenPrefix;
    });
    if (!matching.length) {
      setError("No screen found");
      return;
    }
    setLoading(true);

    const firstMatch = matching[0];
    const options = {
      params: {
        location: firstMatch?.pitchIds?.[0],
        action: "get-matches",
      },
    };
    try {
      const {
        data: { matches: fetchedMatches },
      } = await axios.get<MatchesResponse>(
        `${apiConfig.gateWayUrl}match-report/v2`,
        options,
      );
      setError("");
      setMatches(fetchedMatches);
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

    setLoading(true);

    const options = {
      params: {
        matchId,
        action: "get-report",
      },
    };
    try {
      const { data } = await axios.get<MatchReportResponse>(
        `${apiConfig.gateWayUrl}match-report/v2`,
        options,
      );
      setAvailableMatches({
        [matchId]: {
          players: data.players,
          group: data.group,
          sex: data.sex,
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
    const home = match.home;
    const away = match.away;
    updateMatch({
      homeTeam: home.name,
      awayTeam: away.name,
      matchStartTime: match.time,
    });

    const options = {
      params: {
        matchId: match.match_id,
        action: "get-report",
      },
    };
    try {
      const { data } = await axios.get<MatchReportResponse>(
        `${apiConfig.gateWayUrl}match-report/v2`,
        options,
      );
      setAvailableMatches({
        [match.match_id]: {
          players: data.players,
          group: data.group,
          sex: data.sex,
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

  if (!matches.length) {
    return (
      <div>
        <RingLoader loading={loading} />
        <div className="control-item stdbuttons">
          <button
            type="button"
            onClick={() => {
              void fetchMatchesOnPitch();
            }}
          >
            Sækja leiki á velli
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

export default MatchesOnPitch;
