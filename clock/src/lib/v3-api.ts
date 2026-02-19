import axios from "axios";
import apiConfig from "../apiConfig";
import { AvailableMatches, ListenersState, Player } from "../types";

interface Person {
  id: number;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface V3Team {
  id: number;
  name: string;
  shortName?: string | null;
  logo?: string | null;
  imageUrl?: string | null;
}

interface Result {
  regular?: number | null;
  overtime?: number | null;
  penalty?: number | null;
}

interface MatchPhase {
  id: number;
  name: string;
}

interface Competition {
  id: number;
  name: string;
  shortName?: string | null;
}

interface Facility {
  id: number;
  name: string;
  city?: string | null;
}

export interface V3Match {
  id: number;
  homeTeam: V3Team;
  awayTeam: V3Team;
  homeTeamResult?: Result | null;
  awayTeamResult?: Result | null;
  homeTeamRedCards?: number | null;
  awayTeamRedCards?: number | null;
  liveStatus: string;
  minute?: number | null;
  currentMinute?: string | null;
  dateTimeUTC: string;
  round?: number | null;
  status?: string | null;
  statusDescription?: string | null;
  currentMatchPhase?: MatchPhase | null;
  competition: Competition;
  facility?: Facility | null;
  attendance?: number | null;
  showEvents?: boolean | null;
  allowDetail?: boolean | null;
}

interface TeamPlayer {
  shirtNumber?: number | null;
  captain: boolean;
  goalkeeper: boolean;
  startingLineup: boolean;
  person: Person;
}

interface MatchAndTeamOfficial {
  person: Person;
  role?: string | null;
}

interface TeamLineup {
  players: TeamPlayer[];
  officials: MatchAndTeamOfficial[];
}

interface LineupsResponse {
  home: TeamLineup;
  away: TeamLineup;
}

interface WeatherResponse {
  temp: number;
  service: string;
  main: Record<string, unknown>;
}

export function getTeamId(
  screens: ListenersState["screens"],
  listenPrefix: string,
): number {
  const screen = screens.find((s: { key?: string }) => s.key === listenPrefix);
  return screen?.teamId ?? 2492;
}

export async function fetchMatchesByTeam(
  teamId: number,
  date?: string,
): Promise<V3Match[]> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const response = await axios.get<V3Match[]>(
    `${apiConfig.gateWayUrl}v3/${teamId}/matches/${d}`,
  );
  return response.data;
}

export async function fetchLineups(
  teamId: number,
  matchId: number,
): Promise<LineupsResponse> {
  const response = await axios.get<LineupsResponse>(
    `${apiConfig.gateWayUrl}v3/${teamId}/matches/${matchId}/lineups`,
  );
  return response.data;
}

export async function fetchWeather(
  lat = 64.1285,
  lon = -21.8681,
): Promise<{ temp: number }> {
  const response = await axios.get<WeatherResponse>(
    `${apiConfig.gateWayUrl}v3/weather?lat=${lat}&lon=${lon}`,
  );
  return { temp: response.data.temp };
}

function mapRole(tp: TeamPlayer): string {
  if (tp.goalkeeper && tp.startingLineup) return "Markma\u00F0ur";
  if (tp.goalkeeper && !tp.startingLineup) return "Varamarkma\u00F0ur";
  if (tp.captain) return "Fyrirli\u00F0i";
  if (tp.startingLineup && !tp.goalkeeper) return "Leikma\u00F0ur";
  return "Varama\u00F0ur";
}

export function transformLineups(
  lineups: LineupsResponse,
  match: V3Match,
): Record<string, Player[]> {
  const mapPlayers = (lineup: TeamLineup): Player[] => {
    const players: Player[] = lineup.players.map((tp) => ({
      name: tp.person.name,
      id: tp.person.id,
      number: tp.shirtNumber ?? undefined,
      role: mapRole(tp),
      show: tp.startingLineup,
    }));

    const officials: Player[] = lineup.officials.map((official) => ({
      name: official.person.name,
      id: official.person.id,
      number: undefined,
      role: "\u00DEj\u00E1lfari",
      show: false,
    }));

    return [...players, ...officials];
  };

  return {
    [String(match.homeTeam.id)]: mapPlayers(lineups.home),
    [String(match.awayTeam.id)]: mapPlayers(lineups.away),
  };
}

export async function fetchAvailableMatches(
  teamId: number,
): Promise<AvailableMatches> {
  const matches = await fetchMatchesByTeam(teamId);
  const result: AvailableMatches = {};

  for (const match of matches) {
    const lineups = await fetchLineups(teamId, match.id);
    const players = transformLineups(lineups, match);
    result[String(match.id)] = {
      players,
      group: match.competition.name,
    };
  }

  return result;
}
