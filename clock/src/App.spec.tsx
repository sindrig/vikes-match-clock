import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { firebaseAuth } from "./firebaseAuth";
import { VIEWS } from "./constants";

vi.mock("./contexts/FirebaseStateContext", () => ({
  useFirebaseState: vi.fn(),
  useMatch: vi.fn(),
  useController: vi.fn(),
  useView: vi.fn(),
}));

vi.mock("./contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
  useAuth: vi.fn(),
  useRemoteSettings: vi.fn(),
}));

vi.mock("./controller/Controller", () => ({
  default: () => <div data-testid="controller">Controller</div>,
}));
vi.mock("./controller/MatchActions", () => ({
  default: () => <div data-testid="match-actions">MatchActions</div>,
}));
vi.mock("./controller/RefreshHandler", () => ({
  default: () => <div data-testid="refresh-handler">RefreshHandler</div>,
}));
vi.mock("./controller/asset/Asset", () => ({
  default: () => <div data-testid="asset-component">Asset</div>,
}));
vi.mock("./screens/ScoreBoard", () => ({
  default: () => <div data-testid="scoreboard">ScoreBoard</div>,
}));
vi.mock("./screens/Idle", () => ({
  default: () => <div data-testid="idle">Idle</div>,
}));
vi.mock("./StateListener", () => ({
  default: () => <div data-testid="state-listener">StateListener</div>,
}));
vi.mock("./match-controller/MatchController", () => ({
  default: () => <div data-testid="match-controller">MatchController</div>,
}));
vi.mock("./hooks/useGlobalShortcuts", () => ({
  default: vi.fn(),
}));
vi.mock("react-spinners", () => ({
  RingLoader: ({ color, size }: { color: string; size: number }) => (
    <div data-testid="ring-loader" data-color={color} data-size={size} />
  ),
}));
vi.mock("./firebaseAuth", () => ({
  firebaseAuth: {
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  useFirebaseState,
  useController,
  useMatch,
} from "./contexts/FirebaseStateContext";
import { useLocalState, useRemoteSettings } from "./contexts/LocalStateContext";

const mockedUseFirebaseState = vi.mocked(useFirebaseState);
const mockedUseLocalState = vi.mocked(useLocalState);
const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);

const defaultViewport = {
  style: { height: 100, width: 200 },
  name: "test",
  key: "test",
};

function setupState1() {
  mockedUseLocalState.mockReturnValue({
    auth: { isLoaded: true, isEmpty: true },
    listenPrefix: "",
    setListenPrefix: vi.fn(),
    screenViewport: null,
    setScreenViewport: vi.fn(),
    available: [],
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
    ready: true,
  } as unknown as ReturnType<typeof useFirebaseState>);
}

function setupState2(
  view = VIEWS.idle,
  overrides?: {
    setListenPrefix?: ReturnType<typeof vi.fn>;
    setScreenViewport?: ReturnType<typeof vi.fn>;
  },
) {
  const setListenPrefix = overrides?.setListenPrefix ?? vi.fn();
  const setScreenViewport = overrides?.setScreenViewport ?? vi.fn();
  mockedUseLocalState.mockReturnValue({
    auth: { isLoaded: true, isEmpty: true },
    listenPrefix: "vikinni",
    setListenPrefix,
    screenViewport: null,
    setScreenViewport,
    available: [],
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
    ready: true,
  } as unknown as ReturnType<typeof useFirebaseState>);
  return { setListenPrefix, setScreenViewport };
}

function setupState3(
  view = VIEWS.idle,
  overrides?: {
    setListenPrefix?: ReturnType<typeof vi.fn>;
    setScreenViewport?: ReturnType<typeof vi.fn>;
  },
) {
  const setListenPrefix = overrides?.setListenPrefix ?? vi.fn();
  const setScreenViewport = overrides?.setScreenViewport ?? vi.fn();
  mockedUseLocalState.mockReturnValue({
    auth: { isLoaded: true, isEmpty: false, email: "test@test.com" },
    listenPrefix: "vikinni",
    setListenPrefix,
    screenViewport: null,
    setScreenViewport,
    available: ["vikinni"],
    email: "test@test.com",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
    ready: true,
  } as unknown as ReturnType<typeof useFirebaseState>);
  mockedUseController.mockReturnValue({
    controller: { view, currentAsset: null, roster: { home: [], away: [] } },
    selectView: vi.fn(),
    renderAsset: vi.fn(),
  } as unknown as ReturnType<typeof useController>);
  mockedUseMatch.mockReturnValue({
    match: { matchType: "football", homeScore: 0, awayScore: 0 },
    addGoal: vi.fn(),
    updateMatch: vi.fn(),
  } as unknown as ReturnType<typeof useMatch>);
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);
  return { setListenPrefix, setScreenViewport };
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any root fontSize set by the useEffect
    document.documentElement.style.fontSize = "";
  });

  describe("State 1: unauthenticated, no listenPrefix", () => {
    it("renders Controller and StateListener only", () => {
      setupState1();
      render(<App />);

      expect(screen.getByTestId("controller")).toBeInTheDocument();
      expect(screen.getByTestId("state-listener")).toBeInTheDocument();
    });

    it("does not render display screens", () => {
      setupState1();
      render(<App />);

      expect(screen.queryByTestId("scoreboard")).not.toBeInTheDocument();
      expect(screen.queryByTestId("idle")).not.toBeInTheDocument();
    });

    it("does not render disconnect button", () => {
      setupState1();
      render(<App />);

      expect(screen.queryByText("Aftengja skjá")).not.toBeInTheDocument();
    });
  });

  describe("State 2: unauthenticated with listenPrefix (display mode)", () => {
    it("renders Idle screen for idle view", () => {
      setupState2(VIEWS.idle);
      render(<App />);

      expect(screen.getByTestId("idle")).toBeInTheDocument();
    });

    it("renders ScoreBoard for match view", () => {
      setupState2(VIEWS.match);
      render(<App />);

      expect(screen.getByTestId("scoreboard")).toBeInTheDocument();
    });

    it("renders disconnect button", () => {
      setupState2();
      render(<App />);

      expect(screen.getByText("Aftengja skjá")).toBeInTheDocument();
    });

    it("clears listenPrefix when disconnect button is clicked", () => {
      const mockSetListenPrefix = vi.fn();
      setupState2(VIEWS.idle, { setListenPrefix: mockSetListenPrefix });
      render(<App />);

      fireEvent.click(screen.getByText("Aftengja skjá"));

      expect(mockSetListenPrefix).toHaveBeenCalledWith("");
    });

    it("does not render Controller", () => {
      setupState2();
      render(<App />);

      expect(screen.queryByTestId("controller")).not.toBeInTheDocument();
    });

    it("does not render MatchController", () => {
      setupState2(VIEWS.control);
      render(<App />);

      expect(screen.queryByTestId("match-controller")).not.toBeInTheDocument();
    });
  });

  describe("State 3: authenticated", () => {
    it("renders Controller for idle view", () => {
      setupState3(VIEWS.idle);
      render(<App />);

      expect(screen.getByTestId("controller")).toBeInTheDocument();
      expect(screen.getByTestId("idle")).toBeInTheDocument();
    });

    it("renders Controller for match view", () => {
      setupState3(VIEWS.match);
      render(<App />);

      expect(screen.getByTestId("controller")).toBeInTheDocument();
      expect(screen.getByTestId("scoreboard")).toBeInTheDocument();
    });

    it("renders MatchController for control view", () => {
      setupState3(VIEWS.control);
      render(<App />);

      expect(screen.getByTestId("match-controller")).toBeInTheDocument();
      expect(screen.getByTestId("scoreboard")).toBeInTheDocument();
    });

    it("renders disconnect button", () => {
      setupState3();
      render(<App />);

      expect(screen.getByText("Aftengja skjá")).toBeInTheDocument();
    });

    it("calls logout and disconnects when disconnect button is clicked", () => {
      const mockSetListenPrefix = vi.fn();
      const mockSetScreenViewport = vi.fn();
      setupState3(VIEWS.idle, {
        setListenPrefix: mockSetListenPrefix,
        setScreenViewport: mockSetScreenViewport,
      });
      render(<App />);

      fireEvent.click(screen.getByText("Aftengja skjá"));

      expect(mockSetScreenViewport).toHaveBeenCalledWith(null);
      expect(mockSetListenPrefix).toHaveBeenCalledWith("");
      expect(firebaseAuth.logout).toHaveBeenCalled();
    });

    it("does not render Controller for control view", () => {
      setupState3(VIEWS.control);
      render(<App />);

      expect(screen.queryByTestId("controller")).not.toBeInTheDocument();
    });
  });

  describe("fontSize propagation", () => {
    it("sets root font-size from vp.fontSize", () => {
      mockedUseLocalState.mockReturnValue({
        auth: { isLoaded: true, isEmpty: true },
        listenPrefix: "vikinni",
        setListenPrefix: vi.fn(),
        screenViewport: null,
        setScreenViewport: vi.fn(),
        available: [],
        email: "",
        setEmail: vi.fn(),
        password: "",
        setPassword: vi.fn(),
      });
      mockedUseFirebaseState.mockReturnValue({
        controller: { view: VIEWS.idle, currentAsset: null },
        view: {
          vp: { ...defaultViewport, fontSize: "200%" },
          background: "Default",
        },
        ready: true,
      } as unknown as ReturnType<typeof useFirebaseState>);

      render(<App />);

      expect(document.documentElement.style.fontSize).toBe("200%");
    });

    it("does not set root font-size when vp.fontSize is undefined", () => {
      setupState2();
      render(<App />);

      expect(document.documentElement.style.fontSize).toBe("");
    });

    it("resets root font-size on unmount", () => {
      mockedUseLocalState.mockReturnValue({
        auth: { isLoaded: true, isEmpty: true },
        listenPrefix: "vikinni",
        setListenPrefix: vi.fn(),
        screenViewport: null,
        setScreenViewport: vi.fn(),
        available: [],
        email: "",
        setEmail: vi.fn(),
        password: "",
        setPassword: vi.fn(),
      });
      mockedUseFirebaseState.mockReturnValue({
        controller: { view: VIEWS.idle, currentAsset: null },
        view: {
          vp: { ...defaultViewport, fontSize: "200%" },
          background: "Default",
        },
        ready: true,
      } as unknown as ReturnType<typeof useFirebaseState>);

      const { unmount } = render(<App />);
      expect(document.documentElement.style.fontSize).toBe("200%");

      unmount();
      expect(document.documentElement.style.fontSize).toBe("");
    });
  });

  describe("Loading spinner", () => {
    it("shows spinner when listenPrefix is set but firebase is not ready", () => {
      mockedUseLocalState.mockReturnValue({
        auth: { isLoaded: true, isEmpty: true },
        listenPrefix: "vikinni",
        setListenPrefix: vi.fn(),
        screenViewport: null,
        setScreenViewport: vi.fn(),
        available: [],
        email: "",
        setEmail: vi.fn(),
        password: "",
        setPassword: vi.fn(),
      });
      mockedUseFirebaseState.mockReturnValue({
        controller: { view: VIEWS.idle, currentAsset: null },
        view: { vp: defaultViewport, background: "Default" },
        ready: false,
      } as unknown as ReturnType<typeof useFirebaseState>);

      render(<App />);

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();
      expect(screen.queryByTestId("idle")).not.toBeInTheDocument();
    });

    it("shows spinner when auth is not yet loaded", () => {
      mockedUseLocalState.mockReturnValue({
        auth: { isLoaded: false, isEmpty: true },
        listenPrefix: "vikinni",
        setListenPrefix: vi.fn(),
        screenViewport: null,
        setScreenViewport: vi.fn(),
        available: [],
        email: "",
        setEmail: vi.fn(),
        password: "",
        setPassword: vi.fn(),
      });
      mockedUseFirebaseState.mockReturnValue({
        controller: { view: VIEWS.idle, currentAsset: null },
        view: { vp: defaultViewport, background: "Default" },
        ready: true,
      } as unknown as ReturnType<typeof useFirebaseState>);

      render(<App />);

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();
    });

    it("does not show spinner when no listenPrefix and not authenticated", () => {
      setupState1();
      render(<App />);

      expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
    });

    it("does not show spinner when ready and auth loaded", () => {
      setupState2();
      render(<App />);

      expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
      expect(screen.getByTestId("idle")).toBeInTheDocument();
    });
  });
});
