import { Sports } from "./constants";

// Two-minute penalty type
export interface TwoMinPenalty {
  atTimeElapsed: number;
  key: string;
  penaltyLength: number;
}

// Match type
export interface Match {
  homeScore: number;
  awayScore: number;
  started: number;
  timeElapsed: number;
  halfStops: number[];
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  injuryTime: number;
  matchType: Sports;
  matchStartTime?: string;
  home2min: TwoMinPenalty[];
  away2min: TwoMinPenalty[];
  timeout: number;
  homeTimeouts: number;
  awayTimeouts: number;
  homeRedCards?: number;
  awayRedCards?: number;
  buzzer: number | false;
  countdown: boolean;
  showInjuryTime?: boolean;
  error?: unknown;
  pending?: boolean;
}

// Player type
export interface Player {
  name: string;
  id?: number;
  number?: number | string;
  role?: string;
  show?: boolean;
}

// Asset type
export interface Asset {
  key: string;
  type: string;
}

// Current asset with timing
export interface CurrentAsset {
  asset: Asset;
  time: number | null;
}

// Team players type
export interface TeamPlayers {
  homeTeam: Player[];
  awayTeam: Player[];
}

// Available match type
export interface AvailableMatch {
  group?: string;
  sex?: string;
  players: Record<string, Player[]>;
}

// Available matches type
export type AvailableMatches = Record<string, AvailableMatch>;

// Viewport type
export interface ViewPort {
  style: {
    height: number;
    width: number;
  };
  fontSize?: string;
  name: string;
  key: string;
}

// Background type
export interface Background {
  backgroundImage?: string;
  backgroundColor?: string;
}

// Controller state type
export interface ControllerState {
  selectedAssets: Asset[];
  cycle: boolean;
  imageSeconds: number;
  autoPlay: boolean;
  playing: boolean;
  assetView: string;
  view: string;
  availableMatches: AvailableMatches;
  selectedMatch: string | null;
  currentAsset: CurrentAsset | null;
  refreshToken: string;
  tab?: string;
}

// View state type
export interface ViewState {
  vp: ViewPort;
  background: string;
  idleImage?: string;
}

// Remote state type
export interface RemoteState {
  sync: boolean;
  listenPrefix: string;
  email?: string;
  password?: string;
}

// Firebase auth state type
export interface FirebaseAuthState {
  isLoaded: boolean;
  isEmpty: boolean;
  uid?: string;
  email?: string | null;
}

// Listeners state type
export interface ListenersState {
  available: string[];
  screens: Array<{
    screen: ViewPort;
    label: string;
    key: string;
    pitchIds?: string[];
  }>;
}

// Root state type
export interface RootState {
  match: Match;
  controller: ControllerState;
  view: ViewState;
  remote: RemoteState;
  auth: FirebaseAuthState;
  listeners: ListenersState;
}


