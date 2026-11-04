import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import GoalScorerDialog from "./GoalScorerDialog";
import {
  useController,
  usePerimeter,
  useListeners,
} from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { getPlayerAssetObject } from "./asset/team/assetHelpers";
import { preloadMedia } from "../utils/matchUtils";
import { parseLocations } from "../contexts/firebaseParsers";
import { minimalPerimeterDisplay } from "../lib/venue.fixtures";

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

const PLAYER_ASSET = {
  type: "player",
  key: "https://storage.example.com/player-fagn.png",
  name: "Jón",
  number: 7,
  overlay: { text: "" },
  teamName: "Víkingur R",
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const setupContexts = (mapping: unknown = minimalPerimeterDisplay) => {
  mockedUseController.mockReturnValue({
    renderAsset,
  } as unknown as ReturnType<typeof useController>);
  mockedUsePerimeter.mockReturnValue({
    setPerimeterOverlay,
  } as unknown as ReturnType<typeof usePerimeter>);
  mockedUseListeners.mockReturnValue(
    parseLocations({
      vikuti: { label: "Vikuti", perimeterDisplay: mapping },
    })!,
  );
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikuti",
  } as unknown as ReturnType<typeof useRemoteSettings>);
  mockedGetPlayerAssetObject.mockResolvedValue(PLAYER_ASSET);
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
  renderAsset.mockResolvedValue(undefined);
  setPerimeterOverlay.mockResolvedValue(undefined);
  setupContexts();
});

describe("GoalScorerDialog", () => {
  // -- Web venues: semantic commands ----------------------------------------

  it("writes a fresh semantic scorer command at a web venue without prepared media", async () => {
    setupContexts();
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
    setupContexts();
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalled());
    expect(renderAsset.mock.invocationCallOrder[0]).toBeLessThan(
      setPerimeterOverlay.mock.invocationCallOrder[0],
    );
  });

  it("keeps the generic overlay when a web player has invalid display data", async () => {
    setupContexts();
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

  it("offers scorer selection without generated-media readiness labels", () => {
    renderDialog();
    expect(screen.queryByText("Tilbúið")).not.toBeInTheDocument();
    expect(screen.queryByText("Skjöldur")).not.toBeInTheDocument();
    expect(screen.queryByText("Ekki tiltækt")).not.toBeInTheDocument();
  });

  it.each([
    ["missing mapping", null],
    ["invalid geometry", { ...minimalPerimeterDisplay, regions: [] }],
    ["retired renderer", { ...minimalPerimeterDisplay, renderer: "resolume" }],
    [
      "unknown renderer",
      { ...minimalPerimeterDisplay, renderer: "unexpected" },
    ],
  ])(
    "keeps the main-screen reveal available with %s",
    async (_label, mapping) => {
      setupContexts(mapping);
      renderDialog();
      fireEvent.click(screen.getByText("Jón"));
      await waitFor(() => expect(renderAsset).toHaveBeenCalled());
      expect(setPerimeterOverlay).not.toHaveBeenCalled();
    },
  );

  it("replaces the scorer with a fresh command on each selection", async () => {
    renderDialog();
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Anna"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalledTimes(2));
    const first = setPerimeterOverlay.mock.calls[0]![0] as { id: string };
    const second = setPerimeterOverlay.mock.calls[1]![0] as { id: string };
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({
      version: 2,
      player: { id: "7", name: "Anna" },
    });
  });

  // -- Shared behavior -------------------------------------------------------

  it.each([
    ["media", false],
    ["media", true],
    ["main-screen", false],
    ["main-screen", true],
    ["perimeter", false],
    ["perimeter", true],
  ] as const)(
    "ignores a dismissed selection's late %s completion (failure: %s)",
    async (stage, failure) => {
      const pending = deferred();
      const onClose = vi.fn();
      if (stage === "media") {
        mockedGetPlayerAssetObject.mockReturnValueOnce(
          pending.promise.then(() => PLAYER_ASSET),
        );
      } else if (stage === "main-screen") {
        renderAsset.mockReturnValueOnce(pending.promise);
      } else {
        setPerimeterOverlay.mockReturnValueOnce(pending.promise);
      }
      const dialog = (open: boolean) => (
        <GoalScorerDialog
          open={open}
          players={PLAYERS}
          teamName="Víkingur R"
          onClose={onClose}
        />
      );
      const mounted = render(dialog(true));
      fireEvent.click(screen.getByText("Jón"));
      const delayed =
        stage === "media"
          ? mockedGetPlayerAssetObject
          : stage === "main-screen"
            ? renderAsset
            : setPerimeterOverlay;
      await waitFor(() => expect(delayed).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      mounted.rerender(dialog(false));
      mounted.rerender(dialog(true));
      onClose.mockClear();
      await act(async () => {
        if (failure) pending.reject(new Error("Old selection failed"));
        else pending.resolve();
        await pending.promise.catch(() => undefined);
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(renderAsset).toHaveBeenCalledTimes(stage === "media" ? 0 : 1);
      expect(setPerimeterOverlay).toHaveBeenCalledTimes(
        stage === "perimeter" ? 1 : 0,
      );
      fireEvent.click(screen.getByText("Anna"));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(setPerimeterOverlay).toHaveBeenLastCalledWith(
        expect.objectContaining({
          player: { id: "7", name: "Anna", number: "8" },
        }),
      );
    },
  );

  it("does not close a newer selection when an earlier acknowledgement arrives", async () => {
    const first = deferred();
    const second = deferred();
    const onClose = vi.fn();
    setPerimeterOverlay
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderDialog({ onClose });
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Anna"));
    await waitFor(() => expect(setPerimeterOverlay).toHaveBeenCalledTimes(2));

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["main-screen", "perimeter"])(
    "keeps a rejected %s selection open with an error and permits an explicit retry",
    async (stage) => {
      const onClose = vi.fn();
      const writer =
        stage === "main-screen" ? renderAsset : setPerimeterOverlay;
      writer.mockRejectedValueOnce(new Error("Save blocked"));
      renderDialog({ onClose });
      fireEvent.click(screen.getByText("Jón"));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Save blocked",
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeVisible();

      fireEvent.click(screen.getByText("Jón"));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

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
