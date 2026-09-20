import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GoalScorerDialog from "./GoalScorerDialog";
import {
  useController,
  usePerimeter,
  useListeners,
} from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import { preloadMedia } from "../utils/matchUtils";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  usePerimeter: vi.fn(),
  useListeners: vi.fn(),
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
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetPlayerAssetObject = vi.mocked(getPlayerAssetObject);
const mockedPreloadMedia = vi.mocked(preloadMedia);

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

const setupContexts = (
  options: {
    renderer?: "web" | "resolume";
    preparationStatus?: unknown;
  } = {},
) => {
  mockedUseController.mockReturnValue({
    renderAsset,
  } as unknown as ReturnType<typeof useController>);
  mockedUsePerimeter.mockReturnValue({
    goalScorerPreparationStatus: options.preparationStatus ?? null,
    setPerimeterOverlay,
  } as unknown as ReturnType<typeof usePerimeter>);
  mockedUseListeners.mockReturnValue({
    screens: [
      {
        key: "vikuti",
        label: "Vikuti",
        ...(options.renderer
          ? {
              perimeterDisplay: {
                version: 1,
                revision: "r",
                renderer: options.renderer,
              },
            }
          : {}),
      },
    ],
  } as unknown as ReturnType<typeof useListeners>);
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
};

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

beforeEach(() => {
  vi.clearAllMocks();
  setupContexts();
});

describe("GoalScorerDialog", () => {
  // -- Resolume venues: prepared-file workflow (unchanged) ------------------

  it("replaces the perimeter overlay with the player's ready pair at a Resolume venue", async () => {
    setupContexts({
      renderer: "resolume",
      preparationStatus: {
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
    });
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
    setupContexts({
      renderer: "resolume",
      preparationStatus: {
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
    });
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
    setupContexts({
      renderer: "resolume",
      preparationStatus: {
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
    });
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("keeps the generic overlay when the player has no preparation result", async () => {
    setupContexts({ renderer: "resolume" });
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("shows per-player readiness labels at a Resolume venue", () => {
    setupContexts({
      renderer: "resolume",
      preparationStatus: {
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
    });
    renderDialog();
    expect(screen.getByText("Tilbúið")).toBeInTheDocument();
    expect(screen.getByText("Skjöldur")).toBeInTheDocument();
  });

  // -- Web venues: semantic commands ----------------------------------------

  it("writes a fresh semantic scorer command at a web venue without prepared media", async () => {
    setupContexts({ renderer: "web" });
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() =>
      expect(setPerimeterOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          kind: "goal-scorer",
          player: { id: "10", name: "Jón", number: "7" },
        }),
      ),
    );
    // A fresh command id per selection.
    const command = setPerimeterOverlay.mock.calls[0]![0] as unknown as {
      id: string;
    };
    expect(command.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(renderAsset).toHaveBeenCalled();
  });

  it("submits the main-screen reveal before the semantic perimeter command", async () => {
    setupContexts({ renderer: "web" });
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalled());
    expect(renderAsset.mock.invocationCallOrder[0]).toBeLessThan(
      setPerimeterOverlay.mock.invocationCallOrder[0],
    );
  });

  it("keeps the generic overlay when a web player has invalid display data", async () => {
    setupContexts({ renderer: "web" });
    const invalidPlayers = [
      { id: null, name: "Nafnlaus", number: 7, show: true, role: "FW" },
      { id: 10, name: "Jón", number: null, show: true, role: "FW" },
    ] as never[];
    renderDialog({ players: invalidPlayers });
    fireEvent.click(screen.getByText("Nafnlaus"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();

    // A missing shirt number also keeps the generic overlay.
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalledTimes(2));
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("does not show generated-media readiness labels at a web venue", () => {
    setupContexts({
      renderer: "web",
      preparationStatus: {
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
    });
    renderDialog();
    expect(screen.queryByText("Tilbúið")).not.toBeInTheDocument();
    expect(screen.queryByText("Skjöldur")).not.toBeInTheDocument();
    expect(screen.queryByText("Ekki tiltækt")).not.toBeInTheDocument();
  });

  it("leaves the generic overlay unchanged when the venue mapping is missing", async () => {
    setupContexts({});
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  it("leaves the generic overlay unchanged for an invalid mapping renderer", async () => {
    setupContexts({ renderer: "resolume" });
    mockedUseListeners.mockReturnValue({
      screens: [
        {
          key: "vikuti",
          label: "Vikuti",
          perimeterDisplay: {
            version: 1,
            revision: "r",
            renderer: "unexpected",
          },
        },
      ],
    } as unknown as ReturnType<typeof useListeners>);
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(setPerimeterOverlay).not.toHaveBeenCalled();
  });

  // -- Shared behavior -------------------------------------------------------

  it("does not wait for the goal background before rendering the player", async () => {
    let resolveBackground: (() => void) | undefined;
    mockedPreloadMedia.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveBackground = resolve;
      }),
    );
    renderDialog({ goalGif2: "https://example.com/goal.mp4" });

    fireEvent.click(screen.getByText("Jón"));

    await waitFor(() => expect(renderAsset).toHaveBeenCalled());
    expect(mockedPreloadMedia).toHaveBeenCalledWith(
      "https://example.com/goal.mp4",
    );
    resolveBackground?.();
  });
});
