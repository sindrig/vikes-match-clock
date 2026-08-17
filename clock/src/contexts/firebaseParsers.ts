import type {
  Match,
  InjuryTimeDisplayMode,
  ControllerState,
  ViewState,
  ThemeConfig,
  CustomPreset,
  ClubOverride,
  TwoMinPenalty,
  Asset,
  ViewPort,
  QueueState,
  PerimeterState,
  PerimeterPreview,
  PerimeterColumn,
  PerimeterClip,
  PerimeterOverlay,
  PerimeterOverlayColumn,
  PerimeterOverlayFile,
  PerimeterMediaPair,
  PerimeterAdLayout,
  PerimeterAdLayoutColumn,
  PerimeterAdLayoutFile,
  PerimeterAppliedAdLayout,
  PerimeterAppliedAdColumn,
  PerimeterAppliedAdFile,
  PerimeterAdLane,
  PerimeterAdPhase,
  PerimeterBrightnessStatus,
  PerimeterBrightnessPhase,
} from "../types";
import { Sports, DEFAULT_THEME } from "../constants";

interface LocationData {
  label: string;
  screens: Array<{
    style: { height: number; width: number };
    fontSize?: string;
    name: string;
    key: string;
  }>;
  pitchIds?: string[];
}

export interface ParsedScreen {
  screen: LocationData["screens"][0];
  label: string;
  key: string;
  pitchIds?: string[];
}

export function parseLocations(data: unknown): {
  available: string[];
  screens: ParsedScreen[];
} | null {
  if (!data || typeof data !== "object") return null;

  const locations = data as Record<string, unknown>;
  const available = Object.keys(locations);
  const screens: ParsedScreen[] = [];

  for (const [key, value] of Object.entries(locations)) {
    if (!value || typeof value !== "object") continue;
    const loc = value as Record<string, unknown>;

    const label = typeof loc.label === "string" ? loc.label : key;
    const locScreens = Array.isArray(loc.screens) ? loc.screens : [];
    const pitchIds = Array.isArray(loc.pitchIds)
      ? (loc.pitchIds as string[])
      : undefined;

    for (const screen of locScreens) {
      if (screen && typeof screen === "object") {
        screens.push({
          screen: screen as ParsedScreen["screen"],
          label,
          key,
          pitchIds,
        });
      }
    }
  }

  return { available, screens };
}

function parseTwoMinArray(arr: unknown): TwoMinPenalty[] {
  if (!Array.isArray(arr)) return [];
  const result: TwoMinPenalty[] = [];
  for (const item of arr) {
    if (
      item &&
      typeof item === "object" &&
      "atTimeElapsed" in item &&
      "key" in item &&
      "penaltyLength" in item
    ) {
      result.push(item as TwoMinPenalty);
    }
  }
  return result;
}

function parseAssetArray(arr: unknown): Asset[] {
  if (!Array.isArray(arr)) return [];
  const result: Asset[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && "key" in item && "type" in item) {
      result.push(item as Asset);
    }
  }
  return result;
}

export function parseMatch(data: unknown, defaultMatch: Match): Match | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;

  return {
    ...defaultMatch,
    homeScore:
      typeof raw.homeScore === "number"
        ? raw.homeScore
        : defaultMatch.homeScore,
    awayScore:
      typeof raw.awayScore === "number"
        ? raw.awayScore
        : defaultMatch.awayScore,
    started:
      typeof raw.started === "number" ? raw.started : defaultMatch.started,
    timeElapsed:
      typeof raw.timeElapsed === "number"
        ? raw.timeElapsed
        : defaultMatch.timeElapsed,
    halfStops: Array.isArray(raw.halfStops)
      ? (raw.halfStops as number[])
      : defaultMatch.halfStops,
    homeTeam:
      typeof raw.homeTeam === "string" ? raw.homeTeam : defaultMatch.homeTeam,
    awayTeam:
      typeof raw.awayTeam === "string" ? raw.awayTeam : defaultMatch.awayTeam,
    homeTeamId:
      typeof raw.homeTeamId === "number"
        ? raw.homeTeamId
        : defaultMatch.homeTeamId,
    awayTeamId:
      typeof raw.awayTeamId === "number"
        ? raw.awayTeamId
        : defaultMatch.awayTeamId,
    injuryTime:
      typeof raw.injuryTime === "number"
        ? raw.injuryTime
        : defaultMatch.injuryTime,
    matchType:
      typeof raw.matchType === "string" &&
      Object.values(Sports).includes(raw.matchType as Sports)
        ? (raw.matchType as Match["matchType"])
        : defaultMatch.matchType,
    matchStartTime:
      typeof raw.matchStartTime === "string" ? raw.matchStartTime : undefined,
    ksiMatchId: typeof raw.ksiMatchId === "number" ? raw.ksiMatchId : undefined,
    home2min: parseTwoMinArray(raw.home2min),
    away2min: parseTwoMinArray(raw.away2min),
    timeout:
      typeof raw.timeout === "number" ? raw.timeout : defaultMatch.timeout,
    homeTimeouts:
      typeof raw.homeTimeouts === "number"
        ? raw.homeTimeouts
        : defaultMatch.homeTimeouts,
    awayTimeouts:
      typeof raw.awayTimeouts === "number"
        ? raw.awayTimeouts
        : defaultMatch.awayTimeouts,
    homeRedCards:
      typeof raw.homeRedCards === "number"
        ? raw.homeRedCards
        : defaultMatch.homeRedCards,
    awayRedCards:
      typeof raw.awayRedCards === "number"
        ? raw.awayRedCards
        : defaultMatch.awayRedCards,
    buzzer:
      typeof raw.buzzer === "number"
        ? raw.buzzer
        : raw.buzzer === false
          ? false
          : defaultMatch.buzzer,
    countdown:
      typeof raw.countdown === "boolean"
        ? raw.countdown
        : defaultMatch.countdown,
    halftimeCountdown:
      typeof raw.halftimeCountdown === "boolean"
        ? raw.halftimeCountdown
        : defaultMatch.halftimeCountdown,
    injuryTimeDisplayMode: parseInjuryTimeDisplayMode(raw, defaultMatch),
  };
}

const INJURY_TIME_DISPLAY_MODES = ["stop", "full", "minutes"] as const;

function parseInjuryTimeDisplayMode(
  raw: Record<string, unknown>,
  defaultMatch: Match,
): InjuryTimeDisplayMode {
  if (
    typeof raw.injuryTimeDisplayMode === "string" &&
    (INJURY_TIME_DISPLAY_MODES as readonly string[]).includes(
      raw.injuryTimeDisplayMode,
    )
  ) {
    return raw.injuryTimeDisplayMode as InjuryTimeDisplayMode;
  }
  if (typeof raw.showInjuryTime === "boolean") {
    return raw.showInjuryTime ? "full" : "stop";
  }
  return defaultMatch.injuryTimeDisplayMode;
}

export function parseController(
  data: unknown,
  defaultController: ControllerState,
): ControllerState | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;

  return {
    ...defaultController,
    queues: parseQueueMap(raw.queues),
    activeQueueId:
      typeof raw.activeQueueId === "string"
        ? raw.activeQueueId
        : raw.activeQueueId === null
          ? null
          : defaultController.activeQueueId,
    playing:
      typeof raw.playing === "boolean"
        ? raw.playing
        : defaultController.playing,
    assetView:
      typeof raw.assetView === "string"
        ? raw.assetView
        : defaultController.assetView,
    view: typeof raw.view === "string" ? raw.view : defaultController.view,
    roster:
      raw.roster && typeof raw.roster === "object"
        ? {
            home: Array.isArray((raw.roster as { home?: unknown }).home)
              ? (raw.roster as { home: ControllerState["roster"]["home"] }).home
              : defaultController.roster.home,
            away: Array.isArray((raw.roster as { away?: unknown }).away)
              ? (raw.roster as { away: ControllerState["roster"]["away"] }).away
              : defaultController.roster.away,
          }
        : defaultController.roster,
    currentAsset:
      raw.currentAsset && typeof raw.currentAsset === "object"
        ? (raw.currentAsset as ControllerState["currentAsset"])
        : null,
    refreshToken:
      typeof raw.refreshToken === "string"
        ? raw.refreshToken
        : defaultController.refreshToken,
    tab: typeof raw.tab === "string" ? raw.tab : undefined,
  };
}

export function parseTheme(data: unknown): ThemeConfig | undefined {
  if (!data || typeof data !== "object") return undefined;

  const raw = data as Record<string, unknown>;
  const result: Record<string, string> = {};
  const defaults = DEFAULT_THEME as unknown as Record<string, string>;

  for (const key of Object.keys(defaults)) {
    const val = raw[key];
    result[key] = typeof val === "string" ? val : (defaults[key] ?? "");
  }

  return result as unknown as ThemeConfig;
}

export function parseCustomPresets(
  data: unknown,
): Record<string, CustomPreset> | undefined {
  if (!data || typeof data !== "object") return undefined;

  const raw = data as Record<string, unknown>;
  const result: Record<string, CustomPreset> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;

    const name = typeof entry.name === "string" ? entry.name : key;
    const theme = parseTheme(entry.theme);
    if (!theme) continue;

    const preset: CustomPreset = { name, theme };
    if (typeof entry.basedOn === "string") {
      preset.basedOn = entry.basedOn;
    }

    result[key] = preset;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseView(
  data: unknown,
  defaultView: ViewState,
): ViewState | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;

  return {
    vp:
      raw.vp && typeof raw.vp === "object"
        ? (raw.vp as ViewPort)
        : defaultView.vp,
    background:
      typeof raw.background === "string"
        ? raw.background
        : defaultView.background,
    idleImage: typeof raw.idleImage === "string" ? raw.idleImage : undefined,
    idleAd:
      typeof raw.idleAd === "string"
        ? raw.idleAd
        : raw.idleAd === null
          ? null
          : undefined,
    blackoutStart:
      typeof raw.blackoutStart === "string" ? raw.blackoutStart : undefined,
    blackoutEnd:
      typeof raw.blackoutEnd === "string" ? raw.blackoutEnd : undefined,
    theme: parseTheme(raw.theme),
    themePreset:
      typeof raw.themePreset === "string" ? raw.themePreset : undefined,
    customPresets: parseCustomPresets(raw.customPresets),
    goalGif1:
      typeof raw.goalGif1 === "string"
        ? raw.goalGif1
        : raw.goalGif1 === null
          ? null
          : undefined,
    goalGif2:
      typeof raw.goalGif2 === "string"
        ? raw.goalGif2
        : raw.goalGif2 === null
          ? null
          : undefined,
    goalGifSameImage:
      typeof raw.goalGifSameImage === "boolean"
        ? raw.goalGifSameImage
        : undefined,
    showGoalscorerName:
      typeof raw.showGoalscorerName === "boolean"
        ? raw.showGoalscorerName
        : undefined,
    showGoalscorerNumber:
      typeof raw.showGoalscorerNumber === "boolean"
        ? raw.showGoalscorerNumber
        : undefined,
    flickerInitialOn:
      typeof raw.flickerInitialOn === "number"
        ? raw.flickerInitialOn
        : undefined,
    flickerInitialOff:
      typeof raw.flickerInitialOff === "number"
        ? raw.flickerInitialOff
        : undefined,
    flickerOnGrowth:
      typeof raw.flickerOnGrowth === "number" ? raw.flickerOnGrowth : undefined,
    flickerOffDecay:
      typeof raw.flickerOffDecay === "number" ? raw.flickerOffDecay : undefined,
    flickerCycles:
      typeof raw.flickerCycles === "number" ? raw.flickerCycles : undefined,
    flickerJitter:
      typeof raw.flickerJitter === "number" ? raw.flickerJitter : undefined,
    homeTeamRevealBackground:
      typeof raw.homeTeamRevealBackground === "string"
        ? raw.homeTeamRevealBackground
        : raw.homeTeamRevealBackground === null
          ? null
          : undefined,
  };
}

export function parseQueueMap(data: unknown): Record<string, QueueState> {
  if (!data || typeof data !== "object") return {};

  const raw = data as Record<string, unknown>;
  const result: Record<string, QueueState> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;

    const entry = value as Record<string, unknown>;

    result[key] = {
      id: typeof entry.id === "string" ? entry.id : key,
      name: typeof entry.name === "string" ? entry.name : key,
      items: parseAssetArray(entry.items),
      autoPlay: typeof entry.autoPlay === "boolean" ? entry.autoPlay : false,
      imageSeconds:
        typeof entry.imageSeconds === "number" ? entry.imageSeconds : 3,
      cycle: typeof entry.cycle === "boolean" ? entry.cycle : false,
      order: typeof entry.order === "number" ? entry.order : 0,
    };
  }

  const orders = Object.values(result).map((q) => q.order);
  const uniqueOrders = new Set(orders);

  if (uniqueOrders.size !== orders.length) {
    let nextOrder = 0;
    for (const key of Object.keys(result)) {
      const queue = result[key];
      if (!queue) {
        continue;
      }
      result[key] = { ...queue, order: nextOrder };
      nextOrder += 1;
    }
  }

  return result;
}

export function parsePerimeterState(data: unknown): PerimeterState | undefined {
  if (!data || typeof data !== "object") return undefined;

  const raw = data as Record<string, unknown>;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : false;
  const state = raw.state === "on" || raw.state === "off" ? raw.state : "off";

  return { enabled, state };
}

// Strict, tolerant parse of the daemon-published composition preview. Clips
// and columns without usable data are dropped; the snapshot only becomes
// undefined when the whole payload is not an object.
export function parsePerimeterPreview(
  data: unknown,
): PerimeterPreview | undefined {
  if (!data || typeof data !== "object") return undefined;

  const raw = data as Record<string, unknown>;
  const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : null;

  const columns: PerimeterColumn[] = [];
  if (Array.isArray(raw.columns)) {
    for (const entry of raw.columns) {
      if (!entry || typeof entry !== "object") continue;
      const column = entry as Record<string, unknown>;
      const name = typeof column.name === "string" ? column.name : "";
      if (!name) continue;

      const clips: PerimeterClip[] = [];
      if (Array.isArray(column.clips)) {
        for (const clipEntry of column.clips) {
          if (!clipEntry || typeof clipEntry !== "object") continue;
          const clip = clipEntry as Record<string, unknown>;
          const filename =
            typeof clip.filename === "string" ? clip.filename : "";
          if (!filename) continue;
          const thumbnail =
            typeof clip.thumbnail === "string" ? clip.thumbnail : undefined;
          clips.push({
            id: typeof clip.id === "number" ? clip.id : null,
            filename,
            thumbnail,
          });
        }
      }

      columns.push({
        id: typeof column.id === "number" ? column.id : null,
        name,
        clips,
      });
    }
  }

  return { updatedAt, columns };
}

const MAX_OVERLAY_COLUMNS = 20;
const MAX_OVERLAY_DURATION_MS = 120_000;
const MIN_OVERLAY_DURATION_MS = 100;
const VALID_OVERLAY_VERSIONS = new Set([1]);
const ALLOWED_OVERLAY_BUCKET = "vikes-match-clock-firebase.appspot.com";
// \p{Cc} matches control characters (\x00-\x1f and \x7f-\x9f); written as a
// property escape so the literal contains no raw control characters.
const UNSAFE_FILENAME_RE = /["%\\/]|[\p{Cc}]/u;

function validateOverlayFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (UNSAFE_FILENAME_RE.test(name)) return false;
  return true;
}

// Two source families are permitted for the single active overlay channel:
// the legacy home-goal files under `{location}/perimeter/` and named media-pair
// files under `{location}/perimeter-overlays/{pairId}/48|40/`. Bucket stays the
// approved overlay bucket; the location (when provided) scopes the object path.
function validateOverlaySource(
  source: string,
  options?: { location?: string; bucket?: string },
): boolean {
  if (!source) return false;
  if (!source.startsWith("gs://")) return false;
  const bucketAndPath = source.slice(5);
  const slashIdx = bucketAndPath.indexOf("/");
  if (slashIdx < 0) return false;
  const bucketName = bucketAndPath.slice(0, slashIdx);
  const expectedBucket = options?.bucket ?? ALLOWED_OVERLAY_BUCKET;
  if (bucketName !== expectedBucket) return false;
  const objectPath = bucketAndPath.slice(slashIdx + 1);
  if (!objectPath) return false;
  if (options?.location) {
    const goalPrefix = `${options.location}/perimeter/`;
    const pairPrefix = `${options.location}/perimeter-overlays/`;
    if (
      !objectPath.startsWith(goalPrefix) &&
      !objectPath.startsWith(pairPrefix)
    ) {
      return false;
    }
  }
  return true;
}

function parseOverlayFile(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterOverlayFile | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  const source = typeof raw.source === "string" ? raw.source : "";
  if (!validateOverlayFileName(name)) return undefined;
  if (!validateOverlaySource(source, options)) return undefined;
  return { name, source };
}

function parseOverlayColumn(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterOverlayColumn | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const durationMs =
    typeof raw.durationMs === "number" &&
    raw.durationMs >= MIN_OVERLAY_DURATION_MS &&
    raw.durationMs <= MAX_OVERLAY_DURATION_MS
      ? raw.durationMs
      : 0;
  if (!durationMs) return undefined;
  const filesRaw = raw.files;
  if (!filesRaw || typeof filesRaw !== "object") return undefined;
  const files: Record<string, PerimeterOverlayFile> = {};
  const names = new Set<string>();
  for (const [key, value] of Object.entries(
    filesRaw as Record<string, unknown>,
  )) {
    const parsed = parseOverlayFile(value, options);
    if (!parsed) return undefined;
    if (names.has(parsed.name)) return undefined;
    names.add(parsed.name);
    files[key] = parsed;
  }
  if (names.size === 0) return undefined;
  return { durationMs, files };
}

export function parsePerimeterOverlay(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterOverlay | null {
  if (data === null) return null;
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (!VALID_OVERLAY_VERSIONS.has(version)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const columnsRaw = raw.columns;
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) return null;
  if (columnsRaw.length > MAX_OVERLAY_COLUMNS) return null;
  const columns: PerimeterOverlayColumn[] = [];
  for (const entry of columnsRaw) {
    const column = parseOverlayColumn(entry, options);
    if (!column) return null;
    columns.push(column);
  }
  return { version, id, columns };
}

// -- Named perimeter media pairs ----------------------------------------------
//
// A library of operator-created overlay pairs stored under
// `states/{location}/perimeter/mediaPairs/{pairId}`. Each pair has a required
// name and exactly two files: layer "2" targets the 48-screen column and layer
// "4" targets the 40-screen column. Files must live under the pair's own
// `perimeter-overlays/{pairId}/{48|40}/` prefix in the approved bucket.

const MEDIA_PAIR_TARGETS = [
  { key: "2", folder: "48" },
  { key: "4", folder: "40" },
] as const;
const MEDIA_PAIR_TARGET_KEYS = MEDIA_PAIR_TARGETS.map((target) => target.key);
const MEDIA_PAIR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Must match the daemon's SAFE_FILENAME_RE so a saved pair is always stageable.
const MEDIA_PAIR_FILENAME_RE = /^[A-Za-z0-9._ -]+$/;
const MAX_MEDIA_PAIR_NAME_LENGTH = 80;

function validateMediaPairFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (!MEDIA_PAIR_FILENAME_RE.test(name)) return false;
  return true;
}

function validateMediaPairSource(
  source: string,
  options: { location: string; bucket: string },
  pairId: string,
  targetFolder: string,
): boolean {
  const prefix = `gs://${options.bucket}/${options.location}/perimeter-overlays/${pairId}/${targetFolder}/`;
  if (!source.startsWith(prefix)) return false;
  const filename = source.slice(prefix.length);
  // The suffix must be exactly one daemon-safe filename: a single path
  // segment with no traversal and no `..`, matching the daemon's
  // SAFE_FILENAME_RE so every parsed pair is stageable (the daemon rejects
  // subdirectories and `..` anywhere in the object path).
  if (!filename || filename.length > 255) return false;
  if (filename.includes("/") || filename.includes("..")) return false;
  if (!MEDIA_PAIR_FILENAME_RE.test(filename)) return false;
  return true;
}

export function parsePerimeterMediaPairs(
  data: unknown,
  options?: { location?: string; bucket?: string },
): Record<string, PerimeterMediaPair> {
  if (!data || typeof data !== "object") return {};
  const raw = data as Record<string, unknown>;
  const location = options?.location;
  const bucket = options?.bucket ?? ALLOWED_OVERLAY_BUCKET;

  const result: Record<string, PerimeterMediaPair> = {};
  for (const [pairId, value] of Object.entries(raw)) {
    if (!MEDIA_PAIR_ID_RE.test(pairId)) continue;
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name || name.length > MAX_MEDIA_PAIR_NAME_LENGTH) continue;

    const filesRaw = entry.files;
    if (!filesRaw || typeof filesRaw !== "object") continue;
    const filesMap = filesRaw as Record<string, unknown>;
    const keys = Object.keys(filesMap);
    if (
      keys.length !== MEDIA_PAIR_TARGET_KEYS.length ||
      !MEDIA_PAIR_TARGET_KEYS.every((key) => keys.includes(key))
    ) {
      continue;
    }

    const files: Record<string, PerimeterOverlayFile> = {};
    const seenNames = new Set<string>();
    let valid = true;
    for (const target of MEDIA_PAIR_TARGETS) {
      const fileData = filesMap[target.key];
      if (!fileData || typeof fileData !== "object") {
        valid = false;
        break;
      }
      const file = fileData as Record<string, unknown>;
      const fileName = typeof file.name === "string" ? file.name : "";
      const source = typeof file.source === "string" ? file.source : "";
      if (!validateMediaPairFileName(fileName) || seenNames.has(fileName)) {
        valid = false;
        break;
      }
      seenNames.add(fileName);
      if (location) {
        if (
          !validateMediaPairSource(
            source,
            { location, bucket },
            pairId,
            target.folder,
          )
        ) {
          valid = false;
          break;
        }
      } else if (!validateOverlaySource(source)) {
        valid = false;
        break;
      }
      files[target.key] = { name: fileName, source };
    }
    if (!valid) continue;

    result[pairId] = { name, files };
  }

  return result;
}

export function parseClubOverrides(
  data: unknown,
): Record<string, ClubOverride> {
  if (!data || typeof data !== "object") return {};

  const raw = data as Record<string, unknown>;
  const result: Record<string, ClubOverride> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;

    if (typeof entry.name !== "string") continue;
    if (typeof entry.clubId !== "string") continue;
    if (typeof entry.logoUrl !== "string") continue;
    if (typeof entry.isOverride !== "boolean") continue;

    const override: ClubOverride = {
      name: entry.name,
      clubId: entry.clubId,
      logoUrl: entry.logoUrl,
      isOverride: entry.isOverride,
    };

    result[key] = override;
  }

  return result;
}

// -- Perimeter ad layout parsers ----------------------------------------------

const MAX_AD_COLUMNS = 20;
const VALID_AD_VERSION = 1;
const ALLOWED_AD_BUCKET = "vikes-match-clock-firebase.appspot.com";
// Control chars, traversal chars, Windows-invalid chars
const AD_UNSAFE_FILENAME_RE = /["%\\/:*?<>|]|[\p{Cc}]/u;
const AD_WINDOWS_DEVICE_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export function validateAdFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name === "." || name === "..") return false;
  if (AD_UNSAFE_FILENAME_RE.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  if (AD_WINDOWS_DEVICE_RE.test(name)) return false;
  return true;
}

function validateAdSource(
  source: string,
  options?: { location?: string; bucket?: string },
): boolean {
  if (!source) return false;
  if (!source.startsWith("gs://")) return false;
  const bucketAndPath = source.slice(5);
  const slashIdx = bucketAndPath.indexOf("/");
  if (slashIdx < 0) return false;
  const bucketName = bucketAndPath.slice(0, slashIdx);
  const expectedBucket = options?.bucket ?? ALLOWED_AD_BUCKET;
  if (bucketName !== expectedBucket) return false;
  const objectPath = bucketAndPath.slice(slashIdx + 1);
  if (!objectPath) return false;
  if (options?.location) {
    const prefix = `${options.location}/perimeter/`;
    if (!objectPath.startsWith(prefix)) return false;
  }
  return true;
}

function parseAdLayoutFile(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterAdLayoutFile | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  const source = typeof raw.source === "string" ? raw.source : "";
  if (!validateAdFileName(name)) return undefined;
  if (!validateAdSource(source, options)) return undefined;
  return { name, source };
}

function parseAdLayoutColumn(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterAdLayoutColumn | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return undefined;
  const filesRaw = raw.files;
  if (!filesRaw || typeof filesRaw !== "object") return undefined;
  const files: Record<string, PerimeterAdLayoutFile> = {};
  // The same filename may be reused across lanes only for the same GCS object
  // (the daemon stages lane files to a shared remote dir keyed by name).
  const sourcesByName = new Map<string, string>();
  for (const [key, value] of Object.entries(
    filesRaw as Record<string, unknown>,
  )) {
    const parsed = parseAdLayoutFile(value, options);
    if (!parsed) return undefined;
    const existing = sourcesByName.get(parsed.name);
    if (existing !== undefined && existing !== parsed.source) return undefined;
    sourcesByName.set(parsed.name, parsed.source);
    files[key] = parsed;
  }
  if (Object.keys(files).length === 0) return undefined;
  return { id, files };
}

export function parsePerimeterAdLayout(
  data: unknown,
  options?: { location?: string; bucket?: string },
): PerimeterAdLayout | null {
  // null means clear/no layout
  if (data === null || data === undefined) return null;
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (version !== VALID_AD_VERSION) return null;
  const revision = typeof raw.revision === "string" ? raw.revision : "";
  if (!revision) return null;
  const columnsRaw = raw.columns;
  if (!Array.isArray(columnsRaw)) return null;
  if (columnsRaw.length > MAX_AD_COLUMNS) return null;
  const columns: PerimeterAdLayoutColumn[] = [];
  const seenIds = new Set<string>();
  for (const entry of columnsRaw) {
    const column = parseAdLayoutColumn(entry, options);
    if (!column) return null;
    if (seenIds.has(column.id)) return null;
    seenIds.add(column.id);
    columns.push(column);
  }
  return { version, revision, columns };
}

// Parse the daemon-published applied layout
function parseAppliedAdFile(data: unknown): PerimeterAppliedAdFile | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!validateAdFileName(name)) return undefined;
  const thumbnail =
    typeof raw.thumbnail === "string" ? raw.thumbnail : undefined;
  return { name, thumbnail };
}

function parseAppliedAdColumn(
  data: unknown,
): PerimeterAppliedAdColumn | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return undefined;
  // deckColumns is optional: a layout column with no mapped deck columns
  // (more layout columns than deck columns) still reports its files.
  let deckColumns: number[] = [];
  if (Array.isArray(raw.deckColumns)) {
    deckColumns = raw.deckColumns
      .map((dc) => (typeof dc === "number" && Number.isInteger(dc) ? dc : -1))
      .filter((dc) => dc >= 1);
  }
  const filesRaw = raw.files;
  if (!filesRaw || typeof filesRaw !== "object") return undefined;
  const files: Record<string, PerimeterAppliedAdFile> = {};
  for (const [key, value] of Object.entries(
    filesRaw as Record<string, unknown>,
  )) {
    const parsed = parseAppliedAdFile(value);
    if (!parsed) return undefined;
    files[key] = parsed;
  }
  if (Object.keys(files).length === 0) return undefined;
  return { id, deckColumns, files };
}

export function parsePerimeterAppliedAdLayout(
  data: unknown,
): PerimeterAppliedAdLayout | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;

  // Parse lanes
  const lanes: PerimeterAdLane[] = [];
  if (Array.isArray(raw.lanes)) {
    for (const entry of raw.lanes) {
      if (!entry || typeof entry !== "object") continue;
      const lane = entry as Record<string, unknown>;
      const id = typeof lane.id === "string" ? lane.id : "";
      const name = typeof lane.name === "string" ? lane.name : "";
      if (id && name) lanes.push({ id, name });
    }
  }

  const revision = typeof raw.revision === "string" ? raw.revision : "";
  const phase: PerimeterAdPhase = [
    "loading",
    "playing",
    "error",
    "idle",
  ].includes(raw.phase as string)
    ? (raw.phase as PerimeterAdPhase)
    : "idle";
  const error = typeof raw.error === "string" ? raw.error : null;
  const updatedAt =
    typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now();

  const columns: PerimeterAppliedAdColumn[] = [];
  if (Array.isArray(raw.columns)) {
    for (const entry of raw.columns) {
      const column = parseAppliedAdColumn(entry);
      if (column) columns.push(column);
    }
  }

  return { lanes, revision, phase, error, updatedAt, columns };
}

// -- Perimeter brightness (Vnnox LED brightness) -----------------------------

const VALID_BRIGHTNESS_PHASES: PerimeterBrightnessPhase[] = [
  "pending",
  "applied",
  "failed",
];

// Parse the controller's requested brightness at
// states/{location}/perimeter/brightness. Only a whole integer percentage in
// the inclusive 0..100 range is valid; anything else (missing, null,
// non-integer, out of range) parses to null and is inert in the UI.
export function parsePerimeterBrightness(data: unknown): number | null {
  if (data === null || data === undefined) return null;
  if (typeof data !== "number") return null;
  if (!Number.isInteger(data)) return null;
  if (data < 0 || data > 100) return null;
  return data;
}

// Strict parse of the daemon-published brightness status at
// perimeter/{location}/brightnessStatus. Malformed phases or values reject the
// whole document (null) so the UI never trusts a partial status.
// `requestedPercent` may be `null`, but ONLY for a `failed` status —
// configuration failures (e.g. Vnnox misconfigured at startup) are published
// before any command was ever requested, so there is no percentage to show. A
// `null` requestedPercent on `pending`/`applied` is malformed and rejects the
// document, since those phases always correspond to an actual command.
export function parsePerimeterBrightnessStatus(
  data: unknown,
): PerimeterBrightnessStatus | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;

  if (
    !VALID_BRIGHTNESS_PHASES.includes(raw.phase as PerimeterBrightnessPhase)
  ) {
    return null;
  }
  const phase = raw.phase as PerimeterBrightnessPhase;

  let requestedPercent: number | null = null;
  if (raw.requestedPercent !== null && raw.requestedPercent !== undefined) {
    requestedPercent = parsePerimeterBrightness(raw.requestedPercent);
    if (requestedPercent === null) return null;
  } else if (phase !== "failed") {
    // Only a `failed` status may omit requestedPercent (configuration
    // failure); a missing value on pending/applied is malformed.
    return null;
  }

  let appliedPercent: number | null = null;
  if (raw.appliedPercent !== null && raw.appliedPercent !== undefined) {
    const parsedApplied = parsePerimeterBrightness(raw.appliedPercent);
    if (parsedApplied === null) return null;
    appliedPercent = parsedApplied;
  }

  const error = typeof raw.error === "string" ? raw.error : null;
  const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : null;
  if (updatedAt === null) return null;

  return {
    requestedPercent,
    appliedPercent,
    phase,
    error,
    updatedAt,
  };
}
