import { describe, it, expect } from "vitest";
import { computeNextPeriodStart } from "../FirebaseStateContext";
import type { Match } from "../../types";
import { Sports } from "../../constants";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    homeScore: 0,
    awayScore: 0,
    started: 0,
    timeElapsed: 0,
    halfStops: [45, 90, 105, 120],
    homeTeam: "Víkingur R",
    awayTeam: "",
    homeTeamId: 103,
    awayTeamId: 0,
    injuryTime: 0,
    matchType: Sports.Football,
    home2min: [],
    away2min: [],
    timeout: 0,
    homeTimeouts: 0,
    awayTimeouts: 0,
    buzzer: false,
    countdown: false,
    halftimeCountdown: false,
    injuryTimeDisplayMode: "full",
    ...overrides,
  };
}

describe("computeNextPeriodStart", () => {
  const serverTime = 1700000000000;

  it("clears halftimeCountdown and countdown", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      countdown: true,
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.halftimeCountdown).toBe(false);
    expect(result.countdown).toBe(false);
  });

  it("sets started to the provided server time", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.started).toBe(serverTime);
  });

  it("advances timeElapsed to the first halfStop boundary", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      halfStops: [45, 90, 105, 120],
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    // 45 minutes * 60 * 1000 = 2700000
    expect(result.timeElapsed).toBe(45 * 60 * 1000);
  });

  it("shifts halfStops when more than one remains", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      halfStops: [45, 90, 105, 120],
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.halfStops).toEqual([90, 105, 120]);
  });

  it("does not shift halfStops when only one remains", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      halfStops: [90],
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.halfStops).toEqual([90]);
    expect(result.timeElapsed).toBe(90 * 60 * 1000);
  });

  it("handles empty halfStops gracefully", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      halfStops: [],
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.timeElapsed).toBe(0);
    expect(result.halfStops).toEqual([]);
  });

  it("does not mutate the previous state", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      countdown: true,
      halfStops: [45, 90],
      started: serverTime - 5000,
    });
    const originalHalfStops = prev.halfStops;

    const result = computeNextPeriodStart(prev, serverTime);

    expect(prev.halftimeCountdown).toBe(true);
    expect(prev.countdown).toBe(true);
    expect(prev.halfStops).toBe(originalHalfStops);
    expect(result).not.toBe(prev);
  });

  it("preserves other match fields", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      homeScore: 2,
      awayScore: 1,
      injuryTime: 3,
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.homeScore).toBe(2);
    expect(result.awayScore).toBe(1);
    expect(result.injuryTime).toBe(3);
    expect(result.matchType).toBe(Sports.Football);
  });

  it("works with handball halfStops", () => {
    const prev = makeMatch({
      halftimeCountdown: true,
      halfStops: [30, 60, 65, 70],
      matchType: Sports.Handball,
      started: serverTime - 5000,
    });

    const result = computeNextPeriodStart(prev, serverTime);

    expect(result.timeElapsed).toBe(30 * 60 * 1000);
    expect(result.halfStops).toEqual([60, 65, 70]);
  });
});
