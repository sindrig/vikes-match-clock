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

export interface Style {
	height: number;
	width: number;
}

export interface Screen {
	name: string;
	key: string;
	fontSize: string;
	style: Style;
}

export interface Location {
	label: string;
	pitchIds: number[];
	screens: Screen[];
}
