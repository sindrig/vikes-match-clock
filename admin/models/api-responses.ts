export interface MatchListMatchTeam {
	name: string;
	id: string;
}

export interface MatchListMatch {
	date: string;
	time: string;
	home: MatchListMatchTeam;
	away: MatchListMatchTeam;
	match_id: number | null;
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
