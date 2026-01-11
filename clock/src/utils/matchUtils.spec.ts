import { describe, it, expect } from "vitest";
import {
  roundMillisToSeconds,
  formatTimeUnit,
  clampRedCards,
  shouldShowGoalCelebration,
  isMatchResetDisabled,
  teamToStateKey,
  translateTeam,
} from "./matchUtils";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import { Match } from "../types";

describe("matchUtils", () => {
  describe("roundMillisToSeconds", () => {
    it("rounds down to nearest second", () => {
      expect(roundMillisToSeconds(1500)).toBe(1000);
      expect(roundMillisToSeconds(1999)).toBe(1000);
      expect(roundMillisToSeconds(2000)).toBe(2000);
    });

    it("handles zero", () => {
      expect(roundMillisToSeconds(0)).toBe(0);
    });

    it("handles exact seconds", () => {
      expect(roundMillisToSeconds(5000)).toBe(5000);
    });

    it("handles large values", () => {
      expect(roundMillisToSeconds(90500)).toBe(90000);
    });
  });

  describe("formatTimeUnit", () => {
    it("returns seconds for values under 60", () => {
      expect(formatTimeUnit(30)).toEqual({ value: 30, unit: "s" });
      expect(formatTimeUnit(1)).toEqual({ value: 1, unit: "s" });
      expect(formatTimeUnit(59)).toEqual({ value: 59, unit: "s" });
    });

    it("returns minutes for values 60 and above", () => {
      expect(formatTimeUnit(60)).toEqual({ value: 1, unit: "m" });
      expect(formatTimeUnit(120)).toEqual({ value: 2, unit: "m" });
      expect(formatTimeUnit(300)).toEqual({ value: 5, unit: "m" });
    });
  });

  describe("clampRedCards", () => {
    it("clamps to 0-11 range", () => {
      expect(clampRedCards(5)).toBe(5);
      expect(clampRedCards(0)).toBe(0);
      expect(clampRedCards(11)).toBe(11);
    });

    it("clamps negative values to 0", () => {
      expect(clampRedCards(-1)).toBe(0);
      expect(clampRedCards(-100)).toBe(0);
    });

    it("clamps values above 11 to 11", () => {
      expect(clampRedCards(12)).toBe(11);
      expect(clampRedCards(100)).toBe(11);
    });

    it("handles string numbers", () => {
      expect(clampRedCards("5")).toBe(5);
      expect(clampRedCards("15")).toBe(11);
    });

    it("returns 0 for NaN", () => {
      expect(clampRedCards("abc")).toBe(0);
      expect(clampRedCards(NaN)).toBe(0);
    });
  });

  describe("shouldShowGoalCelebration", () => {
    it("returns true for Víkingur R football match at viken", () => {
      expect(
        shouldShowGoalCelebration(Sports.Football, "Víkingur R", "viken"),
      ).toBe(true);
    });

    it("returns true for listenPrefix starting with vik", () => {
      expect(
        shouldShowGoalCelebration(Sports.Football, "Víkingur R", "vik-test"),
      ).toBe(true);
    });

    it("returns false for handball", () => {
      expect(
        shouldShowGoalCelebration(Sports.Handball, "Víkingur R", "viken"),
      ).toBe(false);
    });

    it("returns false for other teams", () => {
      expect(
        shouldShowGoalCelebration(Sports.Football, "Breiðablik", "viken"),
      ).toBe(false);
    });

    it("returns false for non-vik prefix", () => {
      expect(
        shouldShowGoalCelebration(Sports.Football, "Víkingur R", "other"),
      ).toBe(false);
    });
  });

  describe("isMatchResetDisabled", () => {
    const createMatch = (overrides: Partial<Match> = {}): Match => ({
      homeScore: 0,
      awayScore: 0,
      started: 0,
      timeElapsed: 0,
      halfStops: DEFAULT_HALFSTOPS[Sports.Football],
      homeTeam: "Home",
      awayTeam: "Away",
      homeTeamId: 1,
      awayTeamId: 2,
      injuryTime: 0,
      matchType: Sports.Football,
      home2min: [],
      away2min: [],
      timeout: 0,
      homeTimeouts: 0,
      awayTimeouts: 0,
      buzzer: false,
      countdown: false,
      ...overrides,
    });

    it("returns true when match is in default state", () => {
      const match = createMatch();
      expect(isMatchResetDisabled(match)).toBe(true);
    });

    it("returns false when match has started", () => {
      const match = createMatch({ started: Date.now() });
      expect(isMatchResetDisabled(match)).toBe(false);
    });

    it("returns false when time has elapsed", () => {
      const match = createMatch({ timeElapsed: 5000 });
      expect(isMatchResetDisabled(match)).toBe(false);
    });

    it("returns false when halfStops differ from default", () => {
      const match = createMatch({ halfStops: [40, 80, 90, 100] });
      expect(isMatchResetDisabled(match)).toBe(false);
    });

    it("returns false when timeout is active", () => {
      const match = createMatch({ timeout: Date.now() });
      expect(isMatchResetDisabled(match)).toBe(false);
    });

    it("handles handball matches", () => {
      const match = createMatch({
        matchType: Sports.Handball,
        halfStops: DEFAULT_HALFSTOPS[Sports.Handball],
      });
      expect(isMatchResetDisabled(match)).toBe(true);
    });
  });

  describe("teamToStateKey", () => {
    it("returns home2min for home", () => {
      expect(teamToStateKey("home")).toBe("home2min");
    });

    it("returns away2min for away", () => {
      expect(teamToStateKey("away")).toBe("away2min");
    });
  });

  describe("translateTeam", () => {
    it("translates home to Heima", () => {
      expect(translateTeam("home")).toBe("Heima");
    });

    it("translates away to Úti", () => {
      expect(translateTeam("away")).toBe("Úti");
    });
  });
});
