import axios from "axios";
import apiConfig from "../apiConfig";

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

export interface ApiMatch {
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

export interface TeamPlayer {
  shirtNumber?: number | null;
  captain: boolean;
  goalkeeper: boolean;
  startingLineup: boolean;
  person: Person;
}

export interface MatchAndTeamOfficial {
  person: Person;
  role?: string | null;
}

export interface TeamLineup {
  players: TeamPlayer[];
  officials: MatchAndTeamOfficial[];
}

export interface LineupsResponse {
  home: TeamLineup;
  away: TeamLineup;
}

interface WeatherResponse {
  temp: number;
  service: string;
  main: Record<string, unknown>;
}


export async function fetchMatchesByTeam(
  teamId: number,
  date?: string,
): Promise<ApiMatch[]> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const response = await axios.get<ApiMatch[]>(
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

