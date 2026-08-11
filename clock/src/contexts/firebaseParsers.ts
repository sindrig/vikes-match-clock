import type {
  Match,
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
    showInjuryTime:
      typeof raw.showInjuryTime === "boolean"
        ? raw.showInjuryTime
        : defaultMatch.showInjuryTime,
  };
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
const VALID_OVERLAY_VERSIONS = new Set([1]);

function parseOverlayFile(data: unknown): PerimeterOverlayFile | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  const source = typeof raw.source === "string" ? raw.source : "";
  if (!name || !source) return undefined;
  return { name, source };
}

function parseOverlayColumn(data: unknown): PerimeterOverlayColumn | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = data as Record<string, unknown>;
  const durationMs =
    typeof raw.durationMs === "number" &&
    raw.durationMs > 0 &&
    raw.durationMs <= MAX_OVERLAY_DURATION_MS
      ? raw.durationMs
      : 0;
  if (!durationMs) return undefined;
  const filesRaw = raw.files;
  if (!filesRaw || typeof filesRaw !== "object") return undefined;
  const files: Record<string, PerimeterOverlayFile> = {};
  let hasPairedTargets = false;
  for (const [key, value] of Object.entries(
    filesRaw as Record<string, unknown>,
  )) {
    const parsed = parseOverlayFile(value);
    if (parsed) {
      files[key] = parsed;
      hasPairedTargets = true;
    }
  }
  if (!hasPairedTargets) return undefined;
  return { durationMs, files };
}

export function parsePerimeterOverlay(
  data: unknown,
): PerimeterOverlay | null {
  if (data === null) return null;
  if (!data || typeof data !== "object") return undefined as unknown as null;
  const raw = data as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (!VALID_OVERLAY_VERSIONS.has(version)) return undefined as unknown as null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return undefined as unknown as null;
  const columnsRaw = raw.columns;
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) {
    return undefined as unknown as null;
  }
  if (columnsRaw.length > MAX_OVERLAY_COLUMNS) {
    return undefined as unknown as null;
  }
  const columns: PerimeterOverlayColumn[] = [];
  for (const entry of columnsRaw) {
    const column = parseOverlayColumn(entry);
    if (!column) return undefined as unknown as null;
    columns.push(column);
  }
  return { version, id, columns } as PerimeterOverlay;
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
