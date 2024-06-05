export interface MatchListMatchTeam {
	name: string;
	id: string;
}

export interface MatchListMatch {
	date: string;
	time: string;
	home: MatchListMatchTeam;
	away: MatchListMatchTeam;
	match_id: number | "custom";
}

export interface MatchList {
	matches: MatchListMatch[];
}

export interface MatchIdsMatch {
	group: string;
	starts: string;
	id: string;
	home: string;
	away: string;
}

export interface MatchIdsResponse {
	matches: MatchIdsMatch[];
}

export interface Player {
	id: number;
	name: string;
}

export interface Person {
	id: number | string;
	name: string;
	role: string;

	show: boolean;
}

export interface Player extends Person {
	number: number;
}

export interface MatchReport {
	group: string;
	sex: "kk" | "kvk";
	players: { [key: number]: Player[] };
}
