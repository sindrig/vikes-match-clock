import { Sports } from "./constants";

// Two-minute penalty type
export interface TwoMinPenalty {
  atTimeElapsed: number;
  key: string;
  penaltyLength: number;
}

export type InjuryTimeDisplayMode = "stop" | "full" | "minutes";

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
  halftimeCountdown: boolean;
  injuryTimeDisplayMode: InjuryTimeDisplayMode;
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
  fullName?: string;
  originalAssetType?: string;
  subIn?: Asset;
  subOut?: Asset;
  isGoalCelebration?: boolean;
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
  scoreBoxStroke: string;

  // Clock box
  clockBg: string;
  clockColor: string;
  clockBorder: string;
  clockFontSizeMin: string;
  clockFontSizeMax: string;
  clockFontFamily: string;
  clockStroke: string;

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

  // Per-team logo scale (percentage, e.g. "100%")
  homeLogoScale: string;
  awayLogoScale: string;

  // Injury time
  injuryTimeColor: string;
  injuryTimeFontSize: string;
  injuryTimeTop: string;
  injuryTimeLeft: string;
  injuryTimeStroke: string;

  // Team name
  teamNameColor: string;
  teamNameFontFamily: string;

  // Player number/name
  playerNumberColor: string;
  playerNameColor: string;
  playerNumberFontFamily: string;
  playerNameFontFamily: string;

  // Red cards
  redCardColor: string;
  redCardTop: string;
  redCardLeft: string;

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
  idleLogoHeight: string;
  idleTextTop: string;
  idleClockTop: string;
  idleClockLeft: string;
  idleTempTop: string;
  idleTempLeft: string;
  idleAdTop: string;
  idleAdLeft: string;
  idleAdWidth: string;
  idleAdHeight: string;

  // Ad image position (scoreboard)
  adTop: string;
  adLeft: string;
  adWidth: string;
  adHeight: string;

  // Background image (URL from Firebase Storage, or empty for none)
  backgroundImage: string;
}

// Custom theme preset (user-created or copy of built-in)
export interface CustomPreset {
  name: string;
  theme: ThemeConfig;
  basedOn?: string; // built-in preset name this was derived from
}

// Club override (bundled or fully custom club with custom logo)
export interface ClubOverride {
  name: string; // Display name (e.g., "Víkingur R")
  clubId: string; // KSÍ club ID (e.g., "2492") or "-1" for custom
  logoUrl: string; // Firebase Storage download URL
  isOverride: boolean; // true = bundled club with replaced logo; false = fully custom club
}

// View state type
export interface ViewState {
  vp: ViewPort;
  background: string;
  idleImage?: string;
  idleAd?: string | null;
  blackoutStart?: string;
  blackoutEnd?: string;
  theme?: ThemeConfig;
  themePreset?: string;
  customPresets?: Record<string, CustomPreset>;
  goalGif1?: string | null;
  goalGif2?: string | null;
  goalGifSameImage?: boolean;
  showGoalscorerName?: boolean;
  showGoalscorerNumber?: boolean;
  flickerInitialOn?: number;
  flickerInitialOff?: number;
  flickerOnGrowth?: number;
  flickerOffDecay?: number;
  flickerCycles?: number;
  flickerJitter?: number;
  homeTeamRevealBackground?: string | null;
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

// Perimeter LED (Resolume) state type
export interface PerimeterState {
  enabled: boolean;
  state: "on" | "off";
}

// A single clip in the perimeter composition preview.
export interface PerimeterClip {
  id: number | null;
  filename: string;
  thumbnail?: string;
}

// A Resolume column in the perimeter composition preview.
export interface PerimeterColumn {
  id: number | null;
  name: string;
  clips: PerimeterClip[];
}

// Read-only snapshot of the Resolume composition, published by the
// perimeter-control daemon to `perimeter/{location}`.
export interface PerimeterPreview {
  updatedAt: number | null;
  columns: PerimeterColumn[];
}

// -- Perimeter overlay (goal-triggered video sequences) ----------------------

export interface PerimeterOverlayFile {
  name: string;
  source: string;
}

export interface PerimeterOverlayColumn {
  durationMs: number;
  files: Record<string, PerimeterOverlayFile>;
}

export interface PerimeterOverlay {
  version: number;
  id: string;
  columns: PerimeterOverlayColumn[];
}

export type PerimeterOverlayPhase =
  | "downloading"
  | "copying"
  | "loading"
  | "playing"
  | "error";

export interface PerimeterOverlayStatus {
  commandId: string | null;
  phase: PerimeterOverlayPhase;
  activeColumn: number;
  error: string | null;
}

// A named, operator-created pair of perimeter overlay files (one per target).
// Stored under states/{location}/perimeter/mediaPairs/{pairId}; reused by the
// single active overlay channel via PerimeterOverlay.
export interface PerimeterMediaPair {
  name: string;
  files: Record<string, PerimeterOverlayFile>;
}

// -- Perimeter ad layout (Firebase-controlled column-based ads) -------------

// Desired layout written by the controller to states/{location}/perimeter/adLayout
export interface PerimeterAdLayoutFile {
  name: string;
  source: string; // gs:// URI
}

export interface PerimeterAdLayoutColumn {
  id: string; // uuid
  files: Record<string, PerimeterAdLayoutFile>;
}

export interface PerimeterAdLayout {
  version: number;
  revision: string; // uuid, changes for every edit including reorder
  columns: PerimeterAdLayoutColumn[];
}

// Daemon-published lane metadata
export interface PerimeterAdLane {
  id: string;
  name: string;
}

// Applied file with daemon-resolved thumbnail
export interface PerimeterAppliedAdFile {
  name: string;
  thumbnail?: string; // base64 data URL
}

// Applied column: which deck columns hold this ad, and the per-lane files.
// The deck autopilot cycles these columns; the daemon only deploys content.
export interface PerimeterAppliedAdColumn {
  id: string; // uuid matching desired column
  deckColumns: number[]; // 1-based deck column indices holding this ad
  files: Record<string, PerimeterAppliedAdFile>;
}

export type PerimeterAdPhase = "loading" | "playing" | "error" | "idle";

// Daemon-published applied layout at perimeter/{location}/adLayout
export interface PerimeterAppliedAdLayout {
  lanes: PerimeterAdLane[];
  revision: string; // matching the applied desired revision
  phase: PerimeterAdPhase;
  error: string | null;
  updatedAt: number; // Firebase server timestamp
  columns: PerimeterAppliedAdColumn[];
}

// -- Perimeter brightness (Vnnox LED brightness) -----------------------------

// The controller's requested brightness is stored as a whole integer
// percentage (0..100) at states/{location}/perimeter/brightness. Absent
// (null) means "no command" and is inert; the parsed value is a bare number.

export type PerimeterBrightnessPhase = "pending" | "applied" | "failed";

// Daemon-published brightness status at perimeter/{location}/brightnessStatus.
// `appliedPercent` is present only after the daemon verified the screen read.
export interface PerimeterBrightnessStatus {
  requestedPercent: number;
  appliedPercent: number | null;
  phase: PerimeterBrightnessPhase;
  error: string | null;
  updatedAt: number; // Firebase server timestamp
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
