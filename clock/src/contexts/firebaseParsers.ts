import type {
  Match,
  ControllerState,
  ViewState,
  TwoMinPenalty,
  Asset,
  ViewPort,
} from "../types";

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
      typeof raw.matchType === "string"
        ? (raw.matchType as Match["matchType"])
        : defaultMatch.matchType,
    matchStartTime:
      typeof raw.matchStartTime === "string" ? raw.matchStartTime : undefined,
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
      typeof raw.homeRedCards === "number" ? raw.homeRedCards : undefined,
    awayRedCards:
      typeof raw.awayRedCards === "number" ? raw.awayRedCards : undefined,
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
      typeof raw.showInjuryTime === "boolean" ? raw.showInjuryTime : undefined,
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
    selectedAssets: parseAssetArray(raw.selectedAssets),
    cycle: typeof raw.cycle === "boolean" ? raw.cycle : defaultController.cycle,
    imageSeconds:
      typeof raw.imageSeconds === "number"
        ? raw.imageSeconds
        : defaultController.imageSeconds,
    autoPlay:
      typeof raw.autoPlay === "boolean"
        ? raw.autoPlay
        : defaultController.autoPlay,
    playing:
      typeof raw.playing === "boolean"
        ? raw.playing
        : defaultController.playing,
    assetView:
      typeof raw.assetView === "string"
        ? raw.assetView
        : defaultController.assetView,
    view: typeof raw.view === "string" ? raw.view : defaultController.view,
    availableMatches:
      raw.availableMatches && typeof raw.availableMatches === "object"
        ? (raw.availableMatches as ControllerState["availableMatches"])
        : defaultController.availableMatches,
    selectedMatch:
      typeof raw.selectedMatch === "string" ? raw.selectedMatch : null,
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
  };
}
