import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchActions from "./MatchActions";
import { Match } from "../types";
import { Sports } from "../constants";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useFirebaseState: vi.fn(() => ({
    writeEligible: true,
    writeFreshness: "ready",
  })),
}));

import { useMatch } from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);

const MINUTE_MS = 60 * 1000;

const buildMatchApi = ({
  started = 0,
  timeElapsed = 0,
  halfStops = [45, 90, 105, 120],
  injuryTimeDisplayMode = "full" as Match["injuryTimeDisplayMode"],
  halftimeCountdown = false,
  timeout = 0,
  matchType = Sports.Football,
  matchStartTime,
}: Partial<
  Pick<
    Match,
    | "started"
    | "timeElapsed"
    | "halfStops"
    | "injuryTimeDisplayMode"
    | "halftimeCountdown"
    | "timeout"
    | "matchType"
    | "matchStartTime"
  >
> = {}) => {
  mockedUseMatch.mockReturnValue({
    match: {
      homeScore: 0,
      awayScore: 0,
      started,
      timeElapsed,
      halfStops,
      homeTeam: "Víkingur R",
      awayTeam: "KR",
      homeTeamId: 103,
      awayTeamId: 0,
      injuryTime: 0,
      matchType,
      home2min: [],
      away2min: [],
      timeout,
      homeTimeouts: 0,
      awayTimeouts: 0,
      buzzer: false,
      countdown: false,
      halftimeCountdown,
      injuryTimeDisplayMode,
      matchStartTime,
    } as Match,
    updateMatch: vi.fn(),
    pauseMatch: vi.fn(),
    startMatch: vi.fn(),
    matchTimeout: vi.fn(),
    removeTimeout: vi.fn(),
    countdown: vi.fn(),
    startHalftimeCountdown: vi.fn(),
    stopHalftimeCountdown: vi.fn(),
    updateRedCards: vi.fn(),
    addPenalty: vi.fn(),
    removePenalty: vi.fn(),
    addToPenalty: vi.fn(),
    getServerTime: vi.fn(() => 0),
    updateHalfLength: vi.fn(),
    setHalfStops: vi.fn(),
    buzz: vi.fn(),
    addGoal: vi.fn(),
  } as unknown as ReturnType<typeof useMatch>);
};

describe("MatchActions — Næsti hálfleikur eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers Næsti hálfleikur at the first period boundary (45:00)", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 45 * MINUTE_MS,
      halfStops: [45, 90],
    });

    render(<MatchActions />);

    expect(screen.getByText("Næsti hálfleikur")).toBeInTheDocument();
  });

  it("offers Næsti hálfleikur during injury time", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: (46 * 60 + 30) * 1000,
      halfStops: [45, 90],
    });

    render(<MatchActions />);

    expect(screen.getByText("Næsti hálfleikur")).toBeInTheDocument();
  });

  it("does not offer Næsti hálfleikur after a completed halftime countdown", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 45 * MINUTE_MS,
      halfStops: [90],
    });

    render(<MatchActions />);

    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("does not offer Næsti hálfleikur at the final period", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 90 * MINUTE_MS,
      halfStops: [90],
    });

    render(<MatchActions />);

    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("does not offer Næsti hálfleikur while the match is running", () => {
    buildMatchApi({
      started: 1_000_000,
      timeElapsed: 45 * MINUTE_MS,
      halfStops: [45, 90],
    });

    render(<MatchActions />);

    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("does not offer Næsti hálfleikur below the current period boundary", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 30 * MINUTE_MS,
      halfStops: [45, 90],
    });

    render(<MatchActions />);

    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("honors the injury-time 'stop' display-mode restriction", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 45 * MINUTE_MS,
      halfStops: [45, 90],
      injuryTimeDisplayMode: "stop",
    });

    render(<MatchActions />);

    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("keeps the pre-match countdown available and hides Næsti hálfleikur before kickoff", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 0,
      halfStops: [45, 90, 105, 120],
      matchStartTime: "18:00",
    });

    render(<MatchActions />);

    expect(screen.getByText("Hefja niðurtalningu")).toBeInTheDocument();
    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });

  it("keeps Byrja available after a completed halftime countdown", () => {
    buildMatchApi({
      started: 0,
      timeElapsed: 45 * MINUTE_MS,
      halfStops: [90],
    });

    render(<MatchActions />);

    expect(screen.getByText("Byrja")).toBeInTheDocument();
    expect(screen.queryByText("Næsti hálfleikur")).not.toBeInTheDocument();
  });
});
