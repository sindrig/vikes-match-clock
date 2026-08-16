import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import Clock from "./Clock";
import type { Match } from "../types";
import { Sports } from "../constants";

const mockPauseMatch = vi.fn();
const mockStartNextPeriod = vi.fn();
const mockBuzz = vi.fn();
const mockGetServerTime = vi.fn(() => Date.now());

let mockMatch: Match;

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: () => ({
    match: mockMatch,
    pauseMatch: mockPauseMatch,
    startNextPeriod: mockStartNextPeriod,
    buzz: mockBuzz,
    getServerTime: mockGetServerTime,
  }),
}));

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

describe("Clock countdown expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPauseMatch.mockClear();
    mockStartNextPeriod.mockClear();
    mockBuzz.mockClear();
    mockGetServerTime.mockReturnValue(Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls startNextPeriod when halftime countdown expires", () => {
    const now = Date.now();
    // Halftime countdown: started is in the past by more than HALFTIME_DURATION_MS
    // timeElapsed=0, countdown=true, halftimeCountdown=true
    // started = now - 16 minutes (countdown has expired)
    mockMatch = makeMatch({
      started: now - 16 * 60 * 1000,
      timeElapsed: 0,
      countdown: true,
      halftimeCountdown: true,
    });
    mockGetServerTime.mockReturnValue(now);

    render(<Clock className="test-clock" />);

    // The updateTime callback should detect expiry and call startNextPeriod
    // We need to trigger a re-render to exercise updateTime
    // Since ClockBase calls updateTime on each animation frame via requestAnimationFrame,
    // we advance timers to trigger it
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockStartNextPeriod).toHaveBeenCalled();
    expect(mockPauseMatch).not.toHaveBeenCalled();
  });

  it("calls pauseMatch when pre-match countdown expires", () => {
    const now = Date.now();
    // Pre-match countdown: started is a future time that has now passed
    // countdown=true, halftimeCountdown=false
    mockMatch = makeMatch({
      started: now - 1000,
      timeElapsed: 0,
      countdown: true,
      halftimeCountdown: false,
    });
    mockGetServerTime.mockReturnValue(now);

    render(<Clock className="test-clock" />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockPauseMatch).toHaveBeenCalled();
    expect(mockStartNextPeriod).not.toHaveBeenCalled();
  });

  it("does not call either action when countdown has not expired", () => {
    const now = Date.now();
    // Countdown still running: 5 minutes remaining
    mockMatch = makeMatch({
      started: now + 5 * 60 * 1000,
      timeElapsed: 0,
      countdown: true,
      halftimeCountdown: true,
    });
    mockGetServerTime.mockReturnValue(now);

    render(<Clock className="test-clock" />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockStartNextPeriod).not.toHaveBeenCalled();
    expect(mockPauseMatch).not.toHaveBeenCalled();
  });
});
