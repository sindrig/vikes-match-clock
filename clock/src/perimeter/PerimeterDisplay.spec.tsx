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

vi.mock("../contexts/FirebaseStateContext", () => ({
  useFirebaseState: vi.fn(),
  useListeners: vi.fn(),
  usePerimeter: vi.fn(),
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

const setupContexts = ({
  screens = [{ key: "vikuti", perimeterDisplay: configuration }],
  ready = true,
  adLayout = { version: 1, revision: "rev-1", columns: [] },
}: {
  screens?: unknown[];
  ready?: boolean;
  adLayout?: unknown;
} = {}) => {
  mockedUseFirebaseState.mockReturnValue({
    ready,
  } as unknown as ReturnType<typeof useFirebaseState>);
  mockedUseListeners.mockReturnValue({
    screens,
  } as unknown as ReturnType<typeof useListeners>);
  mockedUsePerimeter.mockReturnValue({
    perimeter: { state: "on" },
    adLayout,
    overlay: null,
  } as unknown as ReturnType<typeof usePerimeter>);
};

describe("PerimeterDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rendererHooks.onError = null;
    runtimeInstance.prepareBase = vi.fn().mockResolvedValue(undefined);
    runtimeInstance.setOverlay = vi.fn().mockResolvedValue(undefined);
    setupContexts();
  });

  it("renders the canvas and reports a healthy state on success", async () => {
    render(<PerimeterDisplay />);

    expect(screen.getByTestId("perimeter-display")).toBeInTheDocument();
    expect(screen.getByTestId("perimeter-canvas")).toBeInTheDocument();

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(null));
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
    expect(
      screen.getByText("Engin gild perimeter stilling tiltæk."),
    ).toBeInTheDocument();
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
});
