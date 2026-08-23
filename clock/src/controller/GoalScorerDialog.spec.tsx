import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GoalScorerDialog from "./GoalScorerDialog";
import { useController, usePerimeter } from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  usePerimeter: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

vi.mock("./asset/team/assetHelpers", () => ({
  getPlayerAssetObject: vi.fn(),
}));

vi.mock("../utils/matchUtils", () => ({
  preloadMedia: vi.fn().mockResolvedValue(undefined),
}));

const mockedUseController = vi.mocked(useController);
const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetPlayerAssetObject = vi.mocked(getPlayerAssetObject);

const renderAsset = vi.fn();
const setPerimeterOverlay = vi.fn();

const PLAYERS = [
  { id: 10, name: "Jón", number: 7, show: true, role: "FW" },
  { id: 7, name: "Anna", number: 8, show: true, role: "MF" },
] as never[];

const readyResult = {
  status: "ready" as const,
  error: null,
  files: {
    "2": {
      name: "10-abc-v1-48.png",
      source: "gs://bucket/vikuti/perimeter-overlays/job/48/10-abc-v1-48.png",
    },
    "4": {
      name: "10-abc-v1-40.png",
      source: "gs://bucket/vikuti/perimeter-overlays/job/40/10-abc-v1-40.png",
    },
  },
};

const fallbackResult = {
  status: "fallback" as const,
  error: null,
  files: {
    "2": {
      name: "10-fb-v1-48.png",
      source: "gs://bucket/vikuti/perimeter-overlays/job/48/10-fb-v1-48.png",
    },
    "4": {
      name: "10-fb-v1-40.png",
      source: "gs://bucket/vikuti/perimeter-overlays/job/40/10-fb-v1-40.png",
    },
  },
};

const preparingResult = { status: "preparing" as const, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseController.mockReturnValue({
    renderAsset,
  } as unknown as ReturnType<typeof useController>);
  mockedUsePerimeter.mockReturnValue({
    goalScorerPreparationStatus: null,
    setPerimeterOverlay,
  } as unknown as ReturnType<typeof usePerimeter>);
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikuti",
  } as unknown as ReturnType<typeof useRemoteSettings>);
  mockedGetPlayerAssetObject.mockResolvedValue({
    type: "player",
    key: "https://storage.example.com/player-fagn.png",
    name: "Jón",
    number: 7,
    overlay: { text: "" },
    teamName: "Víkingur R",
  } as never);
});

const renderDialog = (props: Record<string, unknown> = {}) =>
  render(
    <GoalScorerDialog
      open
      players={PLAYERS as never}
      teamName="Víkingur R"
      goalGif2={null}
      onClose={vi.fn()}
      {...props}
    />,
  );

describe("GoalScorerDialog", () => {
  it("replaces the perimeter overlay with the player's ready pair on selection", async () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        jobId: "job-1",
        phase: "ready",
        readyCount: 1,
        fallbackCount: 0,
        unavailableCount: 0,
        failedCount: 0,
        total: 1,
        updatedAt: 1723392000000,
        error: null,
        players: { "10": readyResult },
      },
      setPerimeterOverlay,
    } as unknown as ReturnType<typeof usePerimeter>);
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() =>
      expect(setPerimeterOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          columns: [
            expect.objectContaining({
              durationMs: 10000,
              files: readyResult.files,
            }),
          ],
        }),
      ),
    );
    expect(renderAsset).toHaveBeenCalled();
  });

  it("uses the crest fallback pair when the player's media is fallback", async () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        jobId: "job-1",
        phase: "ready",
        readyCount: 0,
        fallbackCount: 1,
        unavailableCount: 0,
        failedCount: 0,
        total: 1,
        updatedAt: 1723392000000,
        error: null,
        players: { "10": fallbackResult },
      },
      setPerimeterOverlay,
    } as unknown as ReturnType<typeof usePerimeter>);
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() =>
      expect(setPerimeterOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [expect.objectContaining({ files: fallbackResult.files })],
        }),
      ),
    );
  });

  it("keeps the generic overlay when the player's media is preparing", async () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        jobId: "job-1",
        phase: "preparing",
        readyCount: 0,
        fallbackCount: 0,
        unavailableCount: 0,
        failedCount: 0,
        total: 1,
        updatedAt: 1723392000000,
        error: null,
        players: { "10": preparingResult },
      },
      setPerimeterOverlay,
    } as unknown as ReturnType<typeof usePerimeter>);
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("keeps the generic overlay when the player has no preparation result", async () => {
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("shows per-player readiness labels in the dialog", () => {
    mockedUsePerimeter.mockReturnValue({
      goalScorerPreparationStatus: {
        jobId: "job-1",
        phase: "ready",
        readyCount: 1,
        fallbackCount: 1,
        unavailableCount: 0,
        failedCount: 0,
        total: 2,
        updatedAt: 1723392000000,
        error: null,
        players: { "10": readyResult, "7": fallbackResult },
      },
      setPerimeterOverlay,
    } as unknown as ReturnType<typeof usePerimeter>);
    renderDialog();
    expect(screen.getByText("Tilbúið")).toBeInTheDocument();
    expect(screen.getByText("Skjöldur")).toBeInTheDocument();
  });
});
