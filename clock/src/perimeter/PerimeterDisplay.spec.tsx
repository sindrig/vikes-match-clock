import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import PerimeterDisplay from "./PerimeterDisplay";
import {
  useFirebaseState,
  useListeners,
  usePerimeter,
} from "../contexts/FirebaseStateContext";
import { secondStadiumWebConfiguration } from "./fixtures";

const mockReportError = vi.hoisted(() => vi.fn());
const idleClockHooks = vi.hoisted(() => ({
  createIdleClocks: vi.fn(),
}));

vi.mock("./idleClock", () => ({
  createIdleClocks: idleClockHooks.createIdleClocks,
}));

vi.mock("../contexts/FirebaseStateContext", () => ({
  useFirebaseState: vi.fn(),
  useListeners: vi.fn(),
  usePerimeter: vi.fn(),
  useClubOverrides: vi.fn(() => ({
    clubOverrides: {},
    saveClubOverride: vi.fn(),
    deleteClubOverride: vi.fn(),
  })),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../contexts/DisplayDiagnosticsContext", () => ({
  useDisplayDiagnostics: vi.fn(() => ({
    reportError: mockReportError,
  })),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(() => ({ listenPrefix: "vikuti" })),
}));

const runtimeInstance = vi.hoisted(() => ({
  render: vi.fn(),
  destroy: vi.fn(),
  replaceConfiguration: vi.fn(() => true),
  setPowered: vi.fn(),
  skipCue: vi.fn(),
  prepareBase: vi.fn(),
  activatePreparedBase: vi.fn(),
  setOverlay: vi.fn(),
  setScorerStyle: vi.fn(),
  setIdleClocks: vi.fn(),
  setPlayerBandStyle: vi.fn(),
  setSubstitutionBandStyle: vi.fn(),
  setPlayerBand: vi.fn().mockResolvedValue(undefined),
}));

const rendererInstance = vi.hoisted(() => ({
  render: vi.fn(),
  replaceConfiguration: vi.fn(() => true),
  destroy: vi.fn(),
}));

// Captured from the latest constructor call so tests can emit renderer-
// internal errors the way the real render loop would.
const rendererHooks = vi.hoisted(() => ({
  onError: null as ((message: string) => void) | null,
}));

vi.mock("./runtime", () => ({
  PerimeterRuntime: function PerimeterRuntimeMock() {
    return runtimeInstance;
  },
}));

vi.mock("./webglRenderer", () => ({
  PerimeterWebGLRenderer: function PerimeterWebGLRendererMock(
    _canvas: unknown,
    _configuration: unknown,
    options?: { onError?: (message: string) => void },
  ) {
    rendererHooks.onError = options?.onError ?? null;
    return rendererInstance;
  },
}));

vi.mock("./mediaLoader", () => ({
  PerimeterMediaLoader: function PerimeterMediaLoaderMock() {
    return {
      loadPair: vi.fn(),
      destroy: vi.fn(),
    };
  },
}));

vi.mock("./cache", () => ({
  parseGsReference: vi.fn(() => null),
  PersistentMediaCache: class PersistentMediaCacheMock {},
}));

vi.mock("../firebase", () => ({
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-staging.appspot.com",
  storageHelpers: {
    getDownloadURL: vi.fn().mockResolvedValue("https://example.com/dl"),
    getMetadata: vi.fn().mockResolvedValue({ generation: "1" }),
  },
}));

const mockedUseFirebaseState = vi.mocked(useFirebaseState);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUsePerimeter = vi.mocked(usePerimeter);

const configuration = secondStadiumWebConfiguration;

const playerController = (name: string) => ({
  currentAsset: {
    asset: { type: "PLAYER", name, number: 7, teamName: "Víkingur R" },
    time: null,
  },
});

const setupContexts = ({
  screens = [{ key: "vikuti", perimeterDisplay: configuration }],
  ready = true,
  adLayout = { version: 1, revision: "rev-1", columns: [] },
  overlay = null,
  homeTeam = "Víkingur R",
  perimeter = { state: "on" },
  controller,
  view = {},
}: {
  screens?: unknown[];
  ready?: boolean;
  adLayout?: unknown;
  overlay?: unknown;
  homeTeam?: string;
  perimeter?: unknown;
  controller?: unknown;
  view?: unknown;
} = {}) => {
  mockedUseFirebaseState.mockReturnValue({
    ready,
    match: { homeTeam },
    controller,
    view,
  } as unknown as ReturnType<typeof useFirebaseState>);
  mockedUseListeners.mockReturnValue({
    screens,
  } as unknown as ReturnType<typeof useListeners>);
  mockedUsePerimeter.mockReturnValue({
    perimeter,
    adLayout,
    overlay,
  } as unknown as ReturnType<typeof usePerimeter>);
};

describe("PerimeterDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rendererHooks.onError = null;
    runtimeInstance.prepareBase = vi.fn().mockResolvedValue(undefined);
    runtimeInstance.setOverlay = vi.fn().mockResolvedValue(undefined);
    runtimeInstance.setPlayerBand = vi.fn().mockResolvedValue(undefined);
    setupContexts();
  });

  it("renders the canvas and reports a healthy state on success", async () => {
    render(<PerimeterDisplay />);

    expect(screen.getByTestId("perimeter-display")).toBeInTheDocument();
    expect(screen.getByTestId("perimeter-canvas")).toBeInTheDocument();

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(null));
  });

  it("paints the display black from the first render so boot never flashes white", () => {
    render(<PerimeterDisplay />);

    expect(screen.getByTestId("perimeter-display")).toHaveStyle({
      minHeight: "100vh",
      background: "#000",
    });
    expect(screen.getByTestId("perimeter-canvas")).toHaveStyle({
      display: "block",
      background: "#000",
    });
  });

  it("reports a media preparation failure to the controller", async () => {
    runtimeInstance.prepareBase = vi
      .fn()
      .mockRejectedValue(new Error("Storage generation unavailable"));

    render(<PerimeterDisplay />);

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith(
        "Storage generation unavailable",
      ),
    );
    expect(
      screen.getByText("Storage generation unavailable"),
    ).toBeInTheDocument();
  });

  it("reports a missing web mapping while no configuration exists", async () => {
    setupContexts({ screens: [] });

    render(<PerimeterDisplay />);

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith(
        "Engin gild perimeter stilling tiltæk.",
      ),
    );
    const noConfigurationScreen = screen
      .getByText("Engin gild perimeter stilling tiltæk.")
      .closest(".perimeter-display");
    expect(noConfigurationScreen).toHaveStyle({
      minHeight: "100vh",
      background: "#000",
      color: "#fff",
    });
  });

  it("does not report before the venue state is ready", async () => {
    setupContexts({ screens: [], ready: false });

    render(<PerimeterDisplay />);

    // The pre-ready window publishes nothing: the mapping subscription may
    // simply not have delivered yet, and a phantom error must not reach the
    // controller. Healthy null clears are allowed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const messages = mockReportError.mock.calls.map(
      ([message]: [string]) => message,
    );
    expect(messages.every((message) => message === null)).toBe(true);
  });

  it("clears the report when the display disconnects", async () => {
    const { unmount } = render(<PerimeterDisplay />);

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(null));

    unmount();
    expect(mockReportError).toHaveBeenLastCalledWith(null);
  });

  it("clears the error report once the media prepares successfully", async () => {
    runtimeInstance.prepareBase = vi
      .fn()
      .mockRejectedValue(new Error("Column missing"));

    const { rerender } = render(<PerimeterDisplay />);

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith("Column missing"),
    );

    // The next desired revision prepares successfully and the display
    // reports healthy again.
    runtimeInstance.prepareBase = vi.fn().mockResolvedValue(undefined);
    setupContexts({
      adLayout: { version: 1, revision: "rev-3", columns: [] },
    });
    rerender(<PerimeterDisplay />);

    await waitFor(() => {
      const calls = mockReportError.mock.calls;
      expect(calls[calls.length - 1]).toEqual([null]);
    });
  });

  it("surfaces renderer texture errors below the canvas and to the controller", async () => {
    render(<PerimeterDisplay />);

    await waitFor(() => expect(rendererHooks.onError).not.toBeNull());
    const message =
      "Perimeter media too large for this GPU: 15200x800 exceeds max texture size 8192 (base:screen-3264). Re-export the asset at a smaller size.";
    act(() => rendererHooks.onError!(message));

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(message));
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("shows preparation and texture errors together instead of overwriting", async () => {
    runtimeInstance.prepareBase = vi
      .fn()
      .mockRejectedValue(new Error("Column missing"));

    render(<PerimeterDisplay />);

    await waitFor(() => expect(rendererHooks.onError).not.toBeNull());
    act(() => rendererHooks.onError!("texture problem"));

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith(
        "Column missing texture problem",
      ),
    );
    expect(
      screen.getByText("Column missing texture problem"),
    ).toBeInTheDocument();
  });

  it("recovers and reports healthy after a failed scorer overlay preparation", async () => {
    const scorerCommand = {
      version: 2,
      kind: "goal-scorer",
      id: "scorer-1",
      player: { id: "2492", name: "Jón Jónsson", number: "7" },
    };
    runtimeInstance.setOverlay = vi
      .fn()
      .mockRejectedValueOnce(new Error("Scorer source could not be loaded"))
      .mockResolvedValue(undefined);

    const { rerender } = render(<PerimeterDisplay />);

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith(
        "Scorer source could not be loaded",
      ),
    );

    // The next semantic command prepares successfully and the display
    // reports healthy again.
    setupContexts({ overlay: { ...scorerCommand, id: "scorer-2" } });
    rerender(<PerimeterDisplay />);

    await waitFor(() => {
      const calls = mockReportError.mock.calls;
      expect(calls[calls.length - 1]).toEqual([null]);
    });
  });

  it("applies the selected scorer celebration style to the runtime", async () => {
    const { rerender } = render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setScorerStyle).toHaveBeenCalledWith("ribbon"),
    );

    setupContexts({
      perimeter: { state: "on", scorerCelebration: "tunnel" },
    });
    rerender(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setScorerStyle).toHaveBeenCalledWith("tunnel"),
    );

    // An invalid value falls back to the default presentation.
    setupContexts({
      perimeter: { state: "on", scorerCelebration: "nonsense" },
    });
    rerender(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setScorerStyle).toHaveBeenCalledWith("ribbon"),
    );
  });

  describe("idle clock", () => {
    const idlePresentation = {
      canvas: document.createElement("canvas"),
      draw: vi.fn(),
    };

    beforeEach(() => {
      idleClockHooks.createIdleClocks.mockReset();
    });

    it("loads idle clock presentations while the perimeter is off", async () => {
      idleClockHooks.createIdleClocks.mockResolvedValue({
        strip: idlePresentation,
      });
      setupContexts({ perimeter: { state: "off", idleClock: true } });

      render(<PerimeterDisplay />);

      await waitFor(() =>
        expect(runtimeInstance.setIdleClocks).toHaveBeenCalledWith({
          strip: idlePresentation,
        }),
      );
      expect(idleClockHooks.createIdleClocks).toHaveBeenCalledWith(
        Object.values(configuration.logicalScreens),
      );
      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(null),
      );
    });

    it("reports a failed idle clock load to the controller", async () => {
      idleClockHooks.createIdleClocks.mockRejectedValue(
        new Error("decode failed"),
      );
      setupContexts({ perimeter: { state: "off", idleClock: true } });

      render(<PerimeterDisplay />);

      await waitFor(() =>
        expect(runtimeInstance.setIdleClocks).toHaveBeenLastCalledWith(null),
      );
      await waitFor(() =>
        expect(mockReportError).toHaveBeenCalledWith(
          "Idle clock could not load.",
        ),
      );
      expect(
        screen.getByText("Idle clock could not load."),
      ).toBeInTheDocument();
    });

    it("clears the idle clock error when the toggle switches off", async () => {
      idleClockHooks.createIdleClocks.mockRejectedValue(
        new Error("decode failed"),
      );
      setupContexts({ perimeter: { state: "off", idleClock: true } });
      const { rerender } = render(<PerimeterDisplay />);

      await waitFor(() =>
        expect(mockReportError).toHaveBeenCalledWith(
          "Idle clock could not load.",
        ),
      );

      setupContexts({ perimeter: { state: "off" } });
      rerender(<PerimeterDisplay />);

      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(null),
      );
    });

    it("drops idle clock presentations that resolve after unmount", async () => {
      let resolveCreate: (value: unknown) => void = () => undefined;
      idleClockHooks.createIdleClocks.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );
      setupContexts({ perimeter: { state: "off", idleClock: true } });
      const { unmount } = render(<PerimeterDisplay />);

      unmount();
      // The late resolution must not touch the unmounted screen's state: the
      // runtime was already told to clear its idle clocks on unmount.
      resolveCreate({ strip: idlePresentation });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(runtimeInstance.setIdleClocks).toHaveBeenLastCalledWith(null);
    });
  });

  describe("night blackout", () => {
    const idlePresentation = {
      canvas: document.createElement("canvas"),
      draw: vi.fn(),
    };
    const allDayWindow = {
      view: { blackoutStart: "00:00", blackoutEnd: "24:00" },
      controller: { view: "idle", currentAsset: null },
    };

    it("forces the strips black during the blackout window", async () => {
      setupContexts({
        ...allDayWindow,
        perimeter: { state: "on", idleClock: true },
      });
      render(<PerimeterDisplay />);

      // Ads are suppressed even though the desired perimeter state is "on",
      // and the idle clock is never loaded.
      await waitFor(() =>
        expect(runtimeInstance.setPowered).toHaveBeenLastCalledWith(
          false,
          expect.any(Number),
        ),
      );
      expect(idleClockHooks.createIdleClocks).not.toHaveBeenCalled();
      expect(runtimeInstance.setIdleClocks).toHaveBeenLastCalledWith(null);
    });

    it("reloads the idle clock and restores ads when the window passes", async () => {
      idleClockHooks.createIdleClocks.mockResolvedValue({
        strip: idlePresentation,
      });
      setupContexts({
        ...allDayWindow,
        perimeter: { state: "off", idleClock: true },
      });
      const { rerender } = render(<PerimeterDisplay />);

      await waitFor(() =>
        expect(runtimeInstance.setPowered).toHaveBeenLastCalledWith(
          false,
          expect.any(Number),
        ),
      );
      expect(idleClockHooks.createIdleClocks).not.toHaveBeenCalled();

      // Without a blackout config the normal idle-clock and power behavior
      // returns (state "off" shows the clock; a later "on" would power ads).
      setupContexts({
        controller: { view: "idle", currentAsset: null },
        perimeter: { state: "off", idleClock: true },
      });
      rerender(<PerimeterDisplay />);
      await waitFor(() =>
        expect(idleClockHooks.createIdleClocks).toHaveBeenCalled(),
      );
      await waitFor(() =>
        expect(runtimeInstance.setIdleClocks).toHaveBeenLastCalledWith({
          strip: idlePresentation,
        }),
      );
      setupContexts({
        controller: { view: "idle", currentAsset: null },
        perimeter: { state: "on", idleClock: true },
      });
      rerender(<PerimeterDisplay />);
      await waitFor(() =>
        expect(runtimeInstance.setPowered).toHaveBeenLastCalledWith(
          true,
          expect.any(Number),
        ),
      );
    });

    it("does not blackout during a match view", async () => {
      idleClockHooks.createIdleClocks.mockResolvedValue({
        strip: idlePresentation,
      });
      setupContexts({
        view: { blackoutStart: "00:00", blackoutEnd: "24:00" },
        controller: { view: "match", currentAsset: null },
        perimeter: { state: "on" },
      });
      render(<PerimeterDisplay />);

      await waitFor(() =>
        expect(runtimeInstance.setPowered).toHaveBeenLastCalledWith(
          true,
          expect.any(Number),
        ),
      );
      expect(idleClockHooks.createIdleClocks).not.toHaveBeenCalled();
    });
  });

  it("applies both band styles to the runtime", async () => {
    const { rerender } = render(<PerimeterDisplay />);
    await waitFor(() => {
      expect(runtimeInstance.setPlayerBandStyle).toHaveBeenCalledWith("plain");
      expect(runtimeInstance.setSubstitutionBandStyle).toHaveBeenCalledWith(
        "static",
      );
    });

    setupContexts({
      perimeter: {
        state: "on",
        playerDisplayStyle: "glow",
        substitutionStyle: "relay",
      },
    });
    rerender(<PerimeterDisplay />);
    await waitFor(() => {
      expect(runtimeInstance.setPlayerBandStyle).toHaveBeenCalledWith("glow");
      expect(runtimeInstance.setSubstitutionBandStyle).toHaveBeenCalledWith(
        "relay",
      );
    });
    // Strict parsing of invalid values is covered by firebaseParsers.spec;
    // an absent value falls back to the default presentation here.
    setupContexts({ perimeter: { state: "on" } });
    rerender(<PerimeterDisplay />);
    await waitFor(() => {
      expect(runtimeInstance.setPlayerBandStyle).toHaveBeenLastCalledWith(
        "plain",
      );
      expect(runtimeInstance.setSubstitutionBandStyle).toHaveBeenLastCalledWith(
        "static",
      );
    });
  });

  it("derives the player band from a lineup card's current asset", async () => {
    setupContexts({
      controller: {
        currentAsset: {
          asset: {
            type: "PLAYER",
            key: "https://example.com/photo.png",
            name: "Jón",
            fullName: "Jón Jónsson",
            number: 7,
            teamName: "Víkingur R",
          },
          time: null,
        },
      },
    });
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        {
          kind: "player",
          identity: {
            name: "Jón Jónsson",
            number: "7",
            teamName: "Víkingur R",
            imageRef: "https://example.com/photo.png",
          },
        },
        expect.any(Number),
      ),
    );
  });

  it.each(["replacement", "clear"])(
    "clears a band error after successful %s",
    async (recovery) => {
      runtimeInstance.setPlayerBand.mockRejectedValueOnce(
        new Error("Band source unavailable"),
      );
      setupContexts({ adLayout: null, controller: playerController("First") });
      const { rerender } = render(<PerimeterDisplay />);
      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(
          "Band source unavailable",
        ),
      );

      setupContexts({
        adLayout: null,
        controller:
          recovery === "clear"
            ? { currentAsset: null }
            : playerController("Next"),
      });
      rerender(<PerimeterDisplay />);
      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(null),
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(runtimeInstance.prepareBase).not.toHaveBeenCalled();
      expect(runtimeInstance.setOverlay).toHaveBeenCalledTimes(1);
      expect(runtimeInstance.replaceConfiguration).not.toHaveBeenCalled();
    },
  );

  it.each(["prepareBase", "setOverlay"] as const)(
    "preserves independent %s and texture errors when the band recovers",
    async (method) => {
      const adLayout = { version: 1, revision: "rev-1", columns: [] };
      runtimeInstance[method].mockRejectedValue(
        new Error("Independent preparation failure"),
      );
      runtimeInstance.setPlayerBand.mockRejectedValueOnce(
        new Error("Band source unavailable"),
      );
      setupContexts({ adLayout, controller: playerController("First") });
      const { rerender } = render(<PerimeterDisplay />);
      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(
          "Independent preparation failure Band source unavailable",
        ),
      );
      act(() => rendererHooks.onError!("Texture failure"));

      setupContexts({ adLayout, controller: playerController("Next") });
      rerender(<PerimeterDisplay />);
      await waitFor(() =>
        expect(mockReportError).toHaveBeenLastCalledWith(
          "Independent preparation failure Texture failure",
        ),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Independent preparation failure Texture failure",
      );
      expect(runtimeInstance[method]).toHaveBeenCalledTimes(1);
    },
  );

  it("does not clear a newer band error when a superseded preparation resolves", async () => {
    let finishFirst: () => void = () => undefined;
    runtimeInstance.setPlayerBand
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Latest band failed"));
    setupContexts({ adLayout: null, controller: playerController("First") });
    const { rerender } = render(<PerimeterDisplay />);
    setupContexts({ adLayout: null, controller: playerController("Next") });
    rerender(<PerimeterDisplay />);
    await waitFor(() =>
      expect(mockReportError).toHaveBeenLastCalledWith("Latest band failed"),
    );

    await act(async () => {
      finishFirst();
      await Promise.resolve();
    });
    expect(mockReportError).toHaveBeenLastCalledWith("Latest band failed");
    expect(screen.getByRole("status")).toHaveTextContent("Latest band failed");
  });

  it("drops the band when the current asset is not a player", async () => {
    setupContexts({
      controller: {
        currentAsset: {
          asset: { type: "IMAGE", key: "https://example.com/ad.png" },
          time: null,
        },
      },
    });
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        null,
        expect.any(Number),
      ),
    );
  });

  it("derives a substitution band from a valid SUB asset", async () => {
    setupContexts({
      controller: {
        currentAsset: {
          asset: {
            type: "SUB",
            key: "sub-key",
            subIn: {
              type: "PLAYER",
              key: "https://example.com/on.png",
              name: "Jón",
              number: 7,
              teamName: "Víkingur R",
            },
            subOut: {
              type: "PLAYER",
              key: "https://example.com/off.png",
              name: "Siggi",
              number: 12,
              teamName: "Víkingur R",
            },
          },
          time: null,
        },
      },
    });
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        {
          kind: "substitution",
          off: {
            name: "Siggi",
            number: "12",
            teamName: "Víkingur R",
            imageRef: "https://example.com/off.png",
          },
          on: {
            name: "Jón",
            number: "7",
            teamName: "Víkingur R",
            imageRef: "https://example.com/on.png",
          },
        },
        expect.any(Number),
      ),
    );
  });

  it("renders no band for an invalid SUB asset", async () => {
    setupContexts({
      controller: {
        currentAsset: {
          asset: {
            type: "SUB",
            key: "sub-key",
            subIn: {
              type: "PLAYER",
              key: "https://example.com/on.png",
              name: "Jón",
              number: 7,
              teamName: "Víkingur R",
            },
            subOut: {
              type: "PLAYER",
              key: "https://example.com/off.png",
              name: "Siggi",
              // A missing number fails the both-players-valid rule.
            },
          },
          time: null,
        },
      },
    });
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        null,
        expect.any(Number),
      ),
    );
  });

  it("re-derives the band when a display reconnects mid-item", async () => {
    const controllerState = {
      currentAsset: {
        asset: {
          type: "PLAYER",
          key: "https://example.com/photo.png",
          name: "Jón",
          number: 7,
          teamName: "Víkingur R",
        },
        time: null,
      },
    };
    setupContexts({ controller: controllerState });
    const { unmount } = render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "player" }),
        expect.any(Number),
      ),
    );
    unmount();

    setupContexts({ controller: controllerState });
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledTimes(2),
    );
    expect(runtimeInstance.setPlayerBand).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "player" }),
      expect.any(Number),
    );
  });

  it("performs no perimeter writes while deriving or rendering the band", async () => {
    const setPerimeterState = vi.fn();
    const skipPerimeterCue = vi.fn();
    const restartPerimeterDisplays = vi.fn();
    const setPerimeterPlayerDisplayStyle = vi.fn();
    const setPerimeterSubstitutionStyle = vi.fn();
    setupContexts({
      controller: {
        currentAsset: {
          asset: {
            type: "PLAYER",
            key: "https://example.com/photo.png",
            name: "Jón",
            number: 7,
            teamName: "Víkingur R",
          },
          time: null,
        },
      },
    });
    mockedUsePerimeter.mockReturnValue({
      perimeter: { state: "on" },
      adLayout: { version: 1, revision: "rev-1", columns: [] },
      overlay: null,
      setPerimeterState,
      skipPerimeterCue,
      restartPerimeterDisplays,
      setPerimeterPlayerDisplayStyle,
      setPerimeterSubstitutionStyle,
    } as unknown as ReturnType<typeof usePerimeter>);
    render(<PerimeterDisplay />);
    await waitFor(() =>
      expect(runtimeInstance.setPlayerBand).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "player" }),
        expect.any(Number),
      ),
    );
    // The read-only guarantee: deriving and rendering the band never
    // mutates the perimeter desired state.
    expect(setPerimeterState).not.toHaveBeenCalled();
    expect(skipPerimeterCue).not.toHaveBeenCalled();
    expect(restartPerimeterDisplays).not.toHaveBeenCalled();
    expect(setPerimeterPlayerDisplayStyle).not.toHaveBeenCalled();
    expect(setPerimeterSubstitutionStyle).not.toHaveBeenCalled();
  });
});
