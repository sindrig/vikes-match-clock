import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import MatchActions from "./MatchActions";
import type { Match } from "../types";
import { Sports } from "../constants";

const mockStartNextPeriod = vi.fn();
const mockStartHalftimeCountdown = vi.fn();
const mockPauseMatch = vi.fn();
const mockStartMatch = vi.fn();
const mockUpdateMatch = vi.fn();
const mockMatchTimeout = vi.fn();
const mockRemoveTimeout = vi.fn();
const mockCountdown = vi.fn();

let mockMatch: Match;

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: () => ({
    match: mockMatch,
    updateMatch: mockUpdateMatch,
    pauseMatch: mockPauseMatch,
    startMatch: mockStartMatch,
    matchTimeout: mockMatchTimeout,
    removeTimeout: mockRemoveTimeout,
    countdown: mockCountdown,
    startHalftimeCountdown: mockStartHalftimeCountdown,
    startNextPeriod: mockStartNextPeriod,
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

describe("MatchActions halftime button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Byrja næsta hálfleik' button when halftimeCountdown is true", () => {
    mockMatch = makeMatch({
      halftimeCountdown: true,
      started: Date.now(),
      countdown: true,
    });

    render(<MatchActions />);

    expect(
      screen.getByRole("button", { name: /byrja næsta hálfleik/i }),
    ).toBeInTheDocument();
  });

  it("calls startNextPeriod when halftime button is clicked", async () => {
    const user = userEvent.setup();
    mockMatch = makeMatch({
      halftimeCountdown: true,
      started: Date.now(),
      countdown: true,
    });

    render(<MatchActions />);

    const button = screen.getByRole("button", {
      name: /byrja næsta hálfleik/i,
    });
    await user.click(button);

    expect(mockStartNextPeriod).toHaveBeenCalledTimes(1);
  });

  it("does not show halftime button when period is running (started is truthy, halftimeCountdown false)", () => {
    mockMatch = makeMatch({
      started: Date.now(),
      halftimeCountdown: false,
      countdown: false,
      injuryTimeDisplayMode: "full",
    });

    render(<MatchActions />);

    expect(
      screen.queryByRole("button", { name: /byrja næsta hálfleik/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stöðva niðurtalningu/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Næsti hálfleikur' button when match is paused and injuryTimeDisplayMode is not stop", () => {
    mockMatch = makeMatch({
      started: 0,
      timeElapsed: 45 * 60 * 1000,
      halftimeCountdown: false,
      countdown: false,
      injuryTimeDisplayMode: "full",
    });

    render(<MatchActions />);

    expect(
      screen.getByRole("button", { name: /næsti hálfleikur/i }),
    ).toBeInTheDocument();
  });

  it("does not show 'Næsti hálfleikur' when period is running", () => {
    mockMatch = makeMatch({
      started: Date.now(),
      timeElapsed: 45 * 60 * 1000,
      halftimeCountdown: false,
      countdown: false,
      injuryTimeDisplayMode: "full",
    });

    render(<MatchActions />);

    expect(
      screen.queryByRole("button", { name: /næsti hálfleikur/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Byrja' button when match is not started and no timeElapsed", () => {
    mockMatch = makeMatch({
      started: 0,
      timeElapsed: 0,
      halftimeCountdown: false,
      countdown: false,
    });

    render(<MatchActions />);

    expect(screen.getByRole("button", { name: /byrja/i })).toBeInTheDocument();
  });
});
