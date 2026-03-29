import type {
  Match,
  ControllerState,
  ViewState,
  ThemeConfig,
  CustomPreset,
  TwoMinPenalty,
  Asset,
  ViewPort,
  QueueState,
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
    showInjuryTime:
      typeof raw.showInjuryTime === "boolean"
        ? raw.showInjuryTime
        : defaultMatch.showInjuryTime,
    halfOffset:
      typeof raw.halfOffset === "number"
        ? raw.halfOffset
        : defaultMatch.halfOffset,
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
    blackoutStart:
      typeof raw.blackoutStart === "string" ? raw.blackoutStart : undefined,
    blackoutEnd:
      typeof raw.blackoutEnd === "string" ? raw.blackoutEnd : undefined,
    theme: parseTheme(raw.theme),
    themePreset:
      typeof raw.themePreset === "string" ? raw.themePreset : undefined,
    customPresets: parseCustomPresets(raw.customPresets),
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
