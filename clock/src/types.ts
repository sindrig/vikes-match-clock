import { Sports } from "./constants";

// Two-minute penalty type
export interface TwoMinPenalty {
  [field: string]: unknown;
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
  [field: string]: unknown;
  name: string;
  id?: number | string;
  number?: number | string;
  role?: string;
  show?: boolean;
}

// Overlay on player assets
export interface AssetOverlay {
  [field: string]: unknown;
  text: string;
  blink?: boolean;
  effect?: string;
}

// Shared structural fields. Presentation constraints belong to consumers.
export interface AssetFields {
  [field: string]: unknown;
  key: string;
  url?: string;
  loop?: boolean;
  background?: string;
  name?: string;
  number?: number | string;
  role?: string;
  overlay?: AssetOverlay | null;
  teamName?: string;
  fullName?: string;
  isGoalCelebration?: boolean;
}

export interface ImageAsset extends AssetFields {
  type: "IMAGE";
}
export interface VideoAsset extends AssetFields {
  type: "VIDEO";
}
export interface UrlAsset extends AssetFields {
  type: "URL";
}
export interface PlayerImageAsset extends AssetFields {
  type: "PLAYER";
}
export interface NoImagePlayerAsset extends AssetFields {
  type: "NO_IMAGE_PLAYER";
}
export type PlayerCardAsset = PlayerImageAsset | NoImagePlayerAsset;
export interface MotmAsset extends AssetFields {
  type: "MOTM";
  originalAssetType?: PlayerCardAsset["type"];
}
export interface SubstitutionAsset extends AssetFields {
  type: "SUB";
  subIn: PlayerCardAsset;
  subOut: PlayerCardAsset;
}
export type Asset =
  | ImageAsset
  | VideoAsset
  | UrlAsset
  | PlayerCardAsset
  | MotmAsset
  | SubstitutionAsset;

interface CurrentAssetFields {
  [field: string]: unknown;
  asset: Asset;
  time: number | null;
}
// Absence is only persisted legacy playback, never a malformed present ID.
export type CurrentAsset = CurrentAssetFields &
  ({ occurrenceId: string } | { occurrenceId?: undefined });

// Roster type
export type Roster = { home: Player[]; away: Player[] };

// Viewport type
export interface ViewPort {
  [field: string]: unknown;
  style: {
    [field: string]: unknown;
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
  [field: string]: unknown;
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
  idleTextStroke: string;
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

// Firebase auth state type
export interface FirebaseAuthState {
  isLoaded: boolean;
  isEmpty: boolean;
  uid?: string;
  email?: string | null;
}

export interface VenueConfig {
  [field: string]: unknown;
  homeTeam?: number;
}

export interface VenueScreen extends ViewPort {
  [field: string]: unknown;
}

// Validated locations/{location} metadata, shared by admin and runtime.
export interface Venue {
  [field: string]: unknown;
  // Original snapshot for metadata edits; runtime decisions use validated fields.
  document?: Readonly<Record<string, unknown>>;
  label: string;
  pitchIds: number[];
  config: VenueConfig;
  // Keep Firebase child keys so edits also work with sparse arrays and maps.
  screens: Record<string, VenueScreen>;
  perimeterDisplay?: PerimeterDisplayConfig;
}

// Venue metadata is independent of the flattened scoreboard selector entries.
export interface ListenersState {
  available: string[];
  venues: Record<string, Venue>;
  screens: Array<{
    screen: ViewPort;
    label: string;
    key: string;
    pitchIds?: number[];
    perimeterDisplay?: PerimeterDisplayConfig;
  }>;
}

// Published venue geometry for a web perimeter installation.
// This lives under locations/{location}/perimeterDisplay and is independent
// from the desired runtime state under states/{location}.
export type PerimeterRenderer = "web";
export type PerimeterRotation = 0 | 90 | 180 | 270;

export interface PerimeterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PerimeterFramebuffer {
  width: number;
  height: number;
  background: "black";
}

export interface PerimeterLogicalScreen {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface PerimeterRegionTransform {
  rotation: PerimeterRotation;
  flipX: boolean;
  flipY: boolean;
  allowScaling: boolean;
  allowClipping: boolean;
  allowSourceOverlap: boolean;
  allowDestinationOverlap: boolean;
  zIndex: number;
}

export interface PerimeterRegion {
  id: string;
  logicalScreenId: string;
  source: PerimeterRect;
  destination: PerimeterRect;
  transform: PerimeterRegionTransform;
}

export interface PerimeterCompatibilityKeys {
  base: Record<string, string>;
  overlay: Record<string, string>;
}

export interface PerimeterPlaybackDefaults {
  cueDurationMs: number;
  videoPolicy: "fit-to-cue";
}

export interface PerimeterDisplayConfig {
  version: 1;
  revision: string;
  renderer: PerimeterRenderer;
  framebuffer: PerimeterFramebuffer;
  logicalScreens: Record<string, PerimeterLogicalScreen>;
  compatibilityKeys: PerimeterCompatibilityKeys;
  regions: PerimeterRegion[];
  playback: PerimeterPlaybackDefaults;
}

export type DisplayTarget =
  | { kind: "scoreboard"; screenKey: string }
  | { kind: "perimeter" };

// Perimeter LED desired state
export interface PerimeterState {
  enabled: boolean;
  state: "on" | "off";
  // Opaque token written by the controller to request that every web
  // perimeter display immediately advances its base timeline to the next
  // ad column. A new token value means "skip now"; absent/null is inert.
  skipCue?: string | null;
  // Opaque token written by the controller to request a full page reload of
  // every web perimeter display (remote restart). A new token value means
  // "restart now"; absent/null is inert.
  refreshToken?: string | null;
  // Goal-scorer celebration presentation selected in the perimeter admin
  // view. Absent/invalid values fall back to the default style in the
  // web runtime; the field only affects web-rendered scorer bands.
  scorerCelebration?: ScorerCelebrationStyle;
  idleClock?: boolean;
  // Player band presentation selected in the perimeter admin view for web
  // venues. Absent/invalid values fall back to the default band style.
  playerDisplayStyle?: PlayerBandStyle;
  // Substitution band presentation selected in the perimeter admin view for
  // web venues. Absent/invalid values fall back to the default style.
  substitutionStyle?: SubstitutionBandStyle;
}

// Visual presentation styles for the web perimeter player band. The band is
// derived from the scoreboard's current player asset; the style only changes
// how the display browser animates it.
export type PlayerBandStyle = "plain" | "glow" | "streamer";

// Visual presentation styles for the web perimeter substitution band. The
// settled two-player unit layout is shared; the styles differ in their
// entrance and post-entrance motion.
export type SubstitutionBandStyle = "static" | "relay" | "flash";

// Visual presentation styles for the web goal-scorer perimeter band. The
// semantic version-2 command is unchanged by the style; it only changes how
// the display browser animates the composed band.
export type ScorerCelebrationStyle =
  | "ribbon"
  | "tunnel"
  | "wave"
  | "procession"
  | "cutout";

// -- Perimeter overlay (goal-triggered video sequences) ----------------------

export interface PerimeterOverlayFile {
  name: string;
  source: string;
  generation?: string;
}

export interface PerimeterOverlayColumn {
  durationMs: number;
  files: Record<string, PerimeterOverlayFile>;
}

// Version-1 overlay command: timed columns of prepared media files (goal
// videos, named media pairs, prepared scorer PNGs). Unchanged from the
// original single overlay type; the active overlay channel is now a
// discriminated union of this and GoalScorerOverlayCommand.
export interface PerimeterFileOverlay {
  version: 1;
  id: string;
  columns: PerimeterOverlayColumn[];
}

// Semantic player payload carried by a version-2 scorer command. Values are
// display data only: no generated file references, download URLs, colors,
// dimensions, or layout values. The active subscription scopes the location,
// the deployment provides the bucket, and the published web mapping provides
// the logical-screen dimensions.
export interface GoalScorerOverlayPlayer {
  // Safe KSI player identifier (also used to derive the approved Storage
  // celebration-image path `{location}/players/{id}-fagn.png`).
  id: string;
  // Bounded, non-empty display name.
  name: string;
  // Shirt number normalized to a digit-only string.
  number: string;
}

// Version-2 overlay command: semantic goal scorer composed by web perimeter
// browsers. A fresh command instance per selection, so re-selecting the same
// player is still a new replacement request.
export interface GoalScorerOverlayCommand {
  version: 2;
  kind: "goal-scorer";
  id: string;
  player: GoalScorerOverlayPlayer;
}

export type PerimeterOverlay = PerimeterFileOverlay | GoalScorerOverlayCommand;

// Operator-configured home-goal overlay media: the overlay files played as
// soon as a home goal is scored, before any scorer selection replaces it.
// Stored under states/{location}/perimeter/goalVideo with one file per
// overlay target ("2" and "4"); absent config falls back to the legacy
// `{location}/perimeter/goal-48.mp4` + `goal-40.mp4` pair.
export interface PerimeterGoalVideoConfig {
  files: Record<string, PerimeterOverlayFile>;
}

// An ordinary image/video selected from the main-screen media library.
export interface MainScreenMediaAsset extends AssetFields {
  type: "IMAGE" | "VIDEO";
  name: string;
  url: string;
}

// A named, operator-created pair of perimeter overlay files (one per target),
// optionally linked to an ordinary main-screen image/video.
// Stored under states/{location}/perimeter/mediaPairs/{pairId}; reused by the
// single active overlay channel via PerimeterOverlay.
export interface PerimeterMediaPair {
  name: string;
  files: Record<string, PerimeterOverlayFile>;
  mainScreenAsset?: MainScreenMediaAsset;
}

// -- Perimeter ad layout (Firebase-controlled column-based ads) -------------

// Desired layout written by the controller to states/{location}/perimeter/adLayout
export interface PerimeterAdLayoutFile {
  name: string;
  source: string; // gs:// URI
  // Firebase Storage generation. Legacy Resolume records may omit it, but
  // browser playback must not activate content without immutable identity.
  generation?: string;
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

// Ad lane derived from the published web mapping
export interface PerimeterAdLane {
  id: string;
  name: string;
}

// -- Audit trail --------------------------------------------------------------

// Shared state subtrees that can carry an audit record when an authenticated
// client mutates them. Perimeter and clubOverride writes are folded into the
// same `perimeter`/`clubOverrides` areas with their changed sub-paths.
export type AuditStateArea =
  | "match"
  | "controller"
  | "view"
  | "perimeter"
  | "clubOverrides";

// An immutable, append-only record of a single authenticated mutation. Stored
// under audit/{location}/{eventId}; `changes` is the exact update-path map
// that was sent to Firebase (including `null` deletions). `id` is the Firebase
// event key, attached when a collection is read back.
export interface AuditEvent {
  id?: string;
  timestamp: number;
  uid: string;
  sessionId: string;
  action: string;
  stateArea: AuditStateArea;
  changes: Record<string, unknown>;
}

// -- Perimeter brightness (Vnnox LED brightness) -----------------------------

// The controller's requested brightness is stored as a whole integer
// percentage (0..100) at states/{location}/perimeter/brightness. Absent
// (null) means "no command" and is inert; the parsed value is a bare number.

// Daemon-published brightness status at perimeter/{location}/brightnessStatus.
// `appliedPercent` is present only after the daemon verified the screen read.
// `requestedPercent` is `null` only for a configuration-caused `failed`
// status published before any command was ever requested (e.g. on daemon
// startup when Vnnox is enabled but misconfigured) and for the `shadow`
// phase (prediction published without writes); every other status
// (including a command-caused `failed`) always carries the requested value.
export type PerimeterBrightnessPhase =
  | "pending"
  | "applied"
  | "failed"
  | "shadow";

// Brightness control mode reported by the daemon: "auto" while the
// automatic sun/weather prediction drives writes, "manual" otherwise.
// Older daemons publish neither `mode` nor `predicted`; the parser treats
// an absent mode as "manual".
export type PerimeterBrightnessAutoMode = "auto" | "manual";

// Daemon-published prediction inside a `mode: "auto"` brightness status.
// `cloudCover` is a fraction 0..1; `weatherAgeMin` is the age of the last
// good Open-Meteo response (absent until the first forecast lands);
// `weatherStale` is true once the weather is older than 3 h and the daemon
// fell back to a fixed 0.8 cloud cover. `percent` is the model's target
// percentage when the daemon publishes it.
export interface PerimeterBrightnessPredicted {
  lux: number;
  percent?: number;
  sunElevationDeg: number;
  cloudCover: number;
  weatherAgeMin?: number;
  weatherStale: boolean;
}

// Controller-written auto-brightness config at
// states/{location}/perimeter/brightnessAuto. Absent node = auto disabled.
// The daemon clamps the auto target to [max(min, 1), min(max, 99)] — 0 and
// 100 are manual-only values by design.
export interface PerimeterBrightnessAutoConfig {
  enabled: boolean; // auto master switch
  min: number; // night floor (percent)
  max: number; // ceiling (percent)
  exponent: number; // "aggressiveness": lower = brighter earlier
  cloudWeight: number; // 0 = ignore clouds, 1 = full Kasten-Czeplak
  luxMin: number; // lux that maps onto min (night anchor)
  luxMax: number; // lux that maps onto max (clear high-sun anchor)
}

// Stored node: config plus the Firebase server timestamp of the last write.
export interface PerimeterBrightnessAuto extends PerimeterBrightnessAutoConfig {
  updatedAt: number;
}

// Daemon-published brightness status at perimeter/{location}/brightnessStatus.
// `appliedPercent` is present only after the daemon verified the screen read.
// `requestedPercent` is `null` only for a configuration-caused `failed`
// status published before any command was ever requested (e.g. on daemon
// startup when Vnnox is enabled but misconfigured); every other status
// (including a command-caused `failed`) always carries the requested value.
export interface PerimeterBrightnessStatus {
  requestedPercent: number | null;
  appliedPercent: number | null;
  phase: PerimeterBrightnessPhase;
  error: string | null;
  updatedAt: number; // Firebase server timestamp
  // Present when the daemon supports automatic brightness; an absent field
  // parses as "manual" for backward compatibility.
  mode: PerimeterBrightnessAutoMode;
  predicted?: PerimeterBrightnessPredicted;
}
