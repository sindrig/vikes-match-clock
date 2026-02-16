import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
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

import { useFirebaseState } from "./contexts/FirebaseStateContext";
import { useLocalState } from "./contexts/LocalStateContext";

const mockedUseFirebaseState = vi.mocked(useFirebaseState);
const mockedUseLocalState = vi.mocked(useLocalState);

const defaultViewport = {
  style: { height: 100, width: 200 },
  name: "test",
  key: "test",
};

function setupState1() {
  mockedUseLocalState.mockReturnValue({
    sync: false,
    auth: { isLoaded: true, isEmpty: true },
    listenPrefix: "",
    setListenPrefix: vi.fn(),
    setSync: vi.fn(),
    available: [],
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useFirebaseState>);
}

function setupState2(
  view = VIEWS.idle,
  overrides?: { setListenPrefix?: ReturnType<typeof vi.fn> },
) {
  const setListenPrefix = overrides?.setListenPrefix ?? vi.fn();
  mockedUseLocalState.mockReturnValue({
    sync: false,
    auth: { isLoaded: true, isEmpty: true },
    listenPrefix: "vikinni",
    setListenPrefix,
    setSync: vi.fn(),
    available: [],
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useFirebaseState>);
  return { setListenPrefix };
}

function setupState3(view = VIEWS.idle) {
  mockedUseLocalState.mockReturnValue({
    sync: false,
    auth: { isLoaded: true, isEmpty: false, email: "test@test.com" },
    listenPrefix: "vikinni",
    setListenPrefix: vi.fn(),
    setSync: vi.fn(),
    available: ["vikinni"],
    email: "test@test.com",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
  });
  mockedUseFirebaseState.mockReturnValue({
    controller: { view, currentAsset: null },
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useFirebaseState>);
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it("does not render disconnect button", () => {
      setupState3();
      render(<App />);

      expect(screen.queryByText("Aftengja skjá")).not.toBeInTheDocument();
    });

    it("does not render Controller for control view", () => {
      setupState3(VIEWS.control);
      render(<App />);

      expect(screen.queryByTestId("controller")).not.toBeInTheDocument();
    });
  });
});
