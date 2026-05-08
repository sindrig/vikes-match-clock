import { Match } from "../types";
import { DEFAULT_HALFSTOPS } from "../constants";

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
  side: "home" | "away",
  goalGif1: string | null | undefined,
): boolean {
  return side === "home" && !!goalGif1;
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
  if (team === "home") {
    return "home2min";
  }
  return "away2min";
}

export function translateTeam(team: "home" | "away"): string {
  const translations: Record<string, string> = {
    home: "Heima",
    away: "Úti",
  };
  return translations[team] || team;
}

export function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(mp4|webm|mov|avi)/.test(lower);
}

export function resolveGoalBackground(view: {
  goalGif1?: string | null;
  goalGif2?: string | null;
  goalGifSameImage?: boolean;
}): string | undefined {
  if (view.goalGifSameImage || !view.goalGif2) {
    return view.goalGif1 ?? undefined;
  }
  return view.goalGif2;
}

export function preloadMedia(url: string): Promise<void> {
  if (isVideoUrl(url)) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.oncanplaythrough = () => resolve();
      video.onerror = () => resolve();
      video.src = url;
    });
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Normalizes a time string to 24h HH:mm format.
 * Handles AM/PM formats (e.g. "7:15 PM" → "19:15") and
 * already-valid 24h formats (e.g. "19:15" → "19:15").
 */
export function normalizeTimeTo24h(time: string): string {
  const trimmed = time.trim();

  // Already in HH:mm 24h format
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Match AM/PM patterns like "7:15 PM", "12:00 AM", "11:30 am"
  const amPmMatch = trimmed.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)$/i,
  );
  if (amPmMatch) {
    const [, hoursStr, minutes, periodRaw] = amPmMatch;
    let hours = parseInt(hoursStr!, 10);
    const period = periodRaw!.toUpperCase().replace(/\./g, "");

    if (period === "PM" && hours !== 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, "0")}:${minutes!}`;
  }

  // Couldn't parse — return as-is
  return trimmed;
}
