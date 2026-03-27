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
  ksiMatchId?: number;
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
}

// Player type
export interface Player {
  name: string;
  id?: number;
  number?: number | string;
  role?: string;
  show?: boolean;
}

// Overlay on player assets
export interface AssetOverlay {
  text: string;
  blink?: boolean;
  effect?: string;
}

// Asset type
export interface Asset {
  key: string;
  type: string;
  url?: string;
  background?: string;
  name?: string;
  number?: number | string;
  role?: string;
  overlay?: AssetOverlay | null;
  teamName?: string;
  originalAssetType?: string;
  subIn?: Asset;
  subOut?: Asset;
}

// Current asset with timing
export interface CurrentAsset {
  asset: Asset;
  time: number | null;
}

// Roster type
export type Roster = { home: Player[]; away: Player[] };

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

// Queue state type
export interface QueueState {
  id: string;
  name: string;
  items: Asset[];
  autoPlay: boolean;
  imageSeconds: number;
  cycle: boolean;
  order: number;
}

// Controller state type
export interface ControllerState {
  queues: Record<string, QueueState>;
  activeQueueId: string | null;
  playing: boolean;
  assetView: string;
  view: string;
  roster: Roster;
  currentAsset: CurrentAsset | null;
  refreshToken: string;
  tab?: string;
}

// Theme configuration for customising the clock layout
export interface ThemeConfig {
  // Score boxes
  scoreBoxBg: string;
  scoreBoxColor: string;
  scoreBoxBorder: string;
  scoreBoxFontSize: string;
  scoreBoxFontFamily: string;

  // Clock box
  clockBg: string;
  clockColor: string;
  clockBorder: string;
  clockFontSizeMin: string;
  clockFontSizeMax: string;
  clockFontFamily: string;

  // Clock position (percentages)
  clockTop: string;
  clockLeft: string;
  clockWidth: string;
  clockHeight: string;

  // Score position (percentages)
  scoreTop: string;
  scoreHeight: string;
  scoreWidth: string;

  // Logo position (percentages)
  logoTop: string;
  logoHeight: string;
  logoWidth: string;

  // Injury time
  injuryTimeColor: string;
  injuryTimeFontSize: string;
  injuryTimeTop: string;
  injuryTimeLeft: string;

  // Team name
  teamNameColor: string;
  teamNameFontFamily: string;

  // Red cards
  redCardColor: string;

  // Penalty boxes (handball)
  penaltyBg: string;
  penaltyColor: string;
  penaltyBorder: string;

  // Timeout dots
  timeoutColor: string;

  // Idle screen
  idleTextColor: string;
  idleTextFontSize: string;
  idleLogoTop: string;
  idleLogoLeft: string;
  idleLogoWidth: string;
  idleTextTop: string;
}

// Custom theme preset (user-created or copy of built-in)
export interface CustomPreset {
  name: string;
  theme: ThemeConfig;
  basedOn?: string; // built-in preset name this was derived from
}

// View state type
export interface ViewState {
  vp: ViewPort;
  background: string;
  idleImage?: string;
  blackoutStart?: string;
  blackoutEnd?: string;
  theme?: ThemeConfig;
  themePreset?: string;
  customPresets?: Record<string, CustomPreset>;
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
    teamId?: number;
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
