export interface MatchConfig {
	awayTeam: string;
	awayTeamId: string;
	homeTeam: string;
	homeTeamId: string;
	matchId: string;
}

export interface PitchConfig {
	pitch: number;
	match: MatchConfig;
}
