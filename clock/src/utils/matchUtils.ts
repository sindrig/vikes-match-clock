import { Match } from "../types";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";

export function roundMillisToSeconds(millis: number): number {
  return Math.floor(millis / 1000) * 1000;
}

export function formatTimeUnit(seconds: number): {
  value: number;
  unit: string;
} {
  if (seconds >= 60) {
    return { value: seconds / 60, unit: "m" };
  }
  return { value: seconds, unit: "s" };
}

export function clampRedCards(value: string | number): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(11, num));
}

export function shouldShowGoalCelebration(
  matchType: Sports,
  teamName: string,
  listenPrefix: string,
): boolean {
  return (
    matchType === Sports.Football &&
    teamName === "Víkingur R" &&
    listenPrefix.startsWith("vik")
  );
}

export function isMatchResetDisabled(match: Match): boolean {
  const hasDefaultHalfStops =
    DEFAULT_HALFSTOPS[match.matchType]?.[0] === match.halfStops[0];

  return (
    !match.started &&
    !match.timeElapsed &&
    hasDefaultHalfStops &&
    !match.timeout
  );
}

export function teamToStateKey(team: "home" | "away"): "home2min" | "away2min" {
  return `${team}2min`;
}

export function translateTeam(team: "home" | "away"): string {
  const translations: Record<string, string> = {
    home: "Heima",
    away: "Úti",
  };
  return translations[team] || team;
}
