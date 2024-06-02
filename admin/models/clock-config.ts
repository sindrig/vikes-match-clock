import type { MatchListMatch } from "./api-responses";

export interface MatchConfig {
	awayTeam: string;
	awayTeamId: string;
	homeTeam: string;
	homeTeamId: string;
	inProgress?: MatchListMatch;
	awayScore: number;
	homeScore: number;
	started: number;
	timeElapsed: number;
}

export interface ControllerConfig {
	selectedMatch: number | null;
	view: "idle" | "match";
}

export interface PitchConfig {
	match: MatchConfig;
	controller: ControllerConfig;
}

export interface Screen {
	label: string;
	pitch: number;
}
