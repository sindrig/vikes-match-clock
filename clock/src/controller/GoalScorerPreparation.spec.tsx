import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GoalScorerPreparation from "./GoalScorerPreparation";
import { usePerimeter, useController } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";

vi.mock("../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
  useController: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseController = vi.mocked(useController);
const mockedUseLocalState = vi.mocked(useLocalState);

const baseStatus = {
  jobId: "job-1",
  phase: "ready" as const,
  readyCount: 1,
  fallbackCount: 1,
  unavailableCount: 0,
  failedCount: 0,
  total: 2,
  updatedAt: 1723392000000,
  error: null,
  players: {
    "10": {
      status: "ready" as const,
      error: null,
      files: {
        "2": { name: "a-48.png", source: "gs://bucket/..." },
        "4": { name: "a-40.png", source: "gs://bucket/..." },
      },
    },
    "7": {
      status: "fallback" as const,
      error: null,
      files: {
        "2": { name: "b-48.png", source: "gs://bucket/..." },
        "4": { name: "b-40.png", source: "gs://bucket/..." },
      },
    },
  },
};

const requestGoalScorerPreparation = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePerimeter.mockReturnValue({
    goalScorerPreparationStatus: baseStatus,
    requestGoalScorerPreparation,
  } as unknown as ReturnType<typeof usePerimeter>);
  mockedUseController.mockReturnValue({
    controller: {
      roster: {
        home: [
          { id: 10, name: "Jón", number: 7, show: true, role: "FW" },
          { id: 7, name: "Anna", number: 8, show: true, role: "MF" },
        ],
        away: [],
      },
    },
  } as unknown as ReturnType<typeof useController>);
  mockedUseLocalState.mockReturnValue({
    listenPrefix: "vikuti",
  } as unknown as ReturnType<typeof useLocalState>);
});

describe("GoalScorerPreparation", () => {
  it("renders each home player with its prepared-media outcome", () => {
    render(<GoalScorerPreparation />);
    expect(screen.getByText("Jón")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Tilbúið — fagnmynd")).toBeInTheDocument();
    expect(screen.getByText("Tilbúið — skjöldur")).toBeInTheDocument();
  });

  it("shows the overall counts", () => {
    render(<GoalScorerPreparation />);
    expect(screen.getByText(/Tilbúið: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Skjöldur: 1/)).toBeInTheDocument();
  });

  it("requests preparation again when retry is clicked", async () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        ...baseStatus,
        phase: "failed",
        error: "boom",
      },
      requestGoalScorerPreparation,
    } as unknown as ReturnType<typeof usePerimeter>);
    render(<GoalScorerPreparation />);
    const retry = screen.getByRole("button", { name: "Endurtaka undirbúning" });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(requestGoalScorerPreparation).toHaveBeenCalledTimes(1),
    );
  });

  it("disables retry while preparation is in flight", () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: { ...baseStatus, phase: "preparing" },
      requestGoalScorerPreparation,
    } as unknown as ReturnType<typeof usePerimeter>);
    render(<GoalScorerPreparation />);
    expect(screen.getByRole("button", { name: "Undirbýr..." })).toBeDisabled();
  });

  it("shows a waiting state for a player with no result yet", () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: { ...baseStatus, players: {} },
      requestGoalScorerPreparation,
    } as unknown as ReturnType<typeof usePerimeter>);
    render(<GoalScorerPreparation />);
    expect(screen.getByText("Jón")).toBeInTheDocument();
    expect(screen.getAllByText("Bíður").length).toBeGreaterThan(0);
  });

  it("marks a player without an identifier as unavailable", () => {
    mockedUseController.mockReturnValue({
      controller: {
        roster: {
          home: [{ name: "Nemandi", number: 99, show: true, role: "MF" }],
          away: [],
        },
      },
    } as unknown as ReturnType<typeof useController>);
    render(<GoalScorerPreparation />);
    expect(screen.getByText("Nemandi")).toBeInTheDocument();
    expect(screen.getAllByText("Ekki tiltækt").length).toBeGreaterThan(0);
  });

  it("shows the job error for a failed job", () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        ...baseStatus,
        phase: "failed",
        error: "No valid overlay target geometry published",
      },
      requestGoalScorerPreparation,
    } as unknown as ReturnType<typeof usePerimeter>);
    render(<GoalScorerPreparation />);
    expect(
      screen.getByText(/No valid overlay target geometry published/),
    ).toBeInTheDocument();
  });

  it("shows a hint when the home roster is empty", () => {
    mockedUseController.mockReturnValue({
      controller: { roster: { home: [], away: [] } },
    } as unknown as ReturnType<typeof useController>);
    render(<GoalScorerPreparation />);
    expect(
      screen.getByText(/Engir heimaleikmenn í leikmannahóp/),
    ).toBeInTheDocument();
  });
});
