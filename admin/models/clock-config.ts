import type { MatchListMatch, MatchReport } from "./api-responses";

export interface NumericMatchConfigAttrs {
	awayScore: number;
	homeScore: number;
	started: number;
	timeElapsed: number;
}

export interface MatchConfig extends NumericMatchConfigAttrs {
	awayTeam: string;
	awayTeamId: string;
	homeTeam: string;
	homeTeamId: string;
	inProgress?: MatchListMatch;
}

export enum AssetTypes {
	FREE_TEXT = "FREE_TEXT",
	IMAGE = "IMAGE",
	NO_IMAGE_PLAYER = "NO_IMAGE_PLAYER",
	PLAYER = "PLAYER",
	RUV = "RUV",
	SUB = "SUB",
	URL = "URL",
}

export interface BaseAsset {
	key: string;
}

export interface ImageAsset extends BaseAsset {
	type: AssetTypes.IMAGE;
	url: string;
}

export interface UrlAsset extends BaseAsset {
	type: AssetTypes.URL;
}

export interface RuvAsset extends BaseAsset {
	type: AssetTypes.RUV;
}

export interface PlayerAsset extends BaseAsset {
	type: AssetTypes.PLAYER | AssetTypes.NO_IMAGE_PLAYER;
	background?: string;
	number?: string | number;
	role?: string;
	name: string;
	overlay?: {
		text: string;
		blink?: boolean;
		effect: "blink" | "shaker" | "scaleit";
	};
	teamName: string;
}

export interface SubAsset extends BaseAsset {
	type: AssetTypes.SUB;
	subIn: PlayerAsset;
	subOut: PlayerAsset;
}

export interface TextAsset extends BaseAsset {
	type: AssetTypes.FREE_TEXT;
}

type Asset =
	| ImageAsset
	| UrlAsset
	| RuvAsset
	| PlayerAsset
	| SubAsset
	| TextAsset;

export interface ControllerConfig {
	selectedMatch: number | null;
	view: "idle" | "match";
	currentAsset?: Asset | 0;
	availableMatches?: { [key: number]: MatchReport };
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

export interface LocationConfig {
	homeTeam?: number;
	goalScorerBackground?: string;
}

export interface Location {
	label: string;
	config: LocationConfig;
	pitchIds: number[];
	screens: Screen[];
}
