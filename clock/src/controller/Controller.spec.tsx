import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Controller from "./Controller";
import { VIEWS } from "../constants";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useView: vi.fn(),
  useListeners: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useAuth: vi.fn(),
  useLocalState: vi.fn(),
}));

vi.mock("../firebaseAuth", () => ({
  firebaseAuth: {
    login: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./MatchActions", () => ({
  default: () => <div data-testid="match-actions">MatchActions</div>,
}));
vi.mock("./MatchActionSettings", () => ({
  default: () => (
    <div data-testid="match-action-settings">MatchActionSettings</div>
  ),
}));
vi.mock("./media/MediaManager", () => ({
  default: () => <div data-testid="media-manager">MediaManager</div>,
}));
vi.mock("./LoginPage", () => ({
  default: () => <div data-testid="login-page">LoginPage</div>,
}));
vi.mock("./RefreshHandler", () => ({
  default: () => <div data-testid="refresh-handler">RefreshHandler</div>,
}));
vi.mock("./asset/AssetController", () => ({
  default: () => <div data-testid="asset-controller">AssetController</div>,
}));

import {
  useController,
  useView,
  useListeners,
} from "../contexts/FirebaseStateContext";
import { useAuth, useLocalState } from "../contexts/LocalStateContext";

const mockedUseController = vi.mocked(useController);
const mockedUseView = vi.mocked(useView);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseLocalState = vi.mocked(useLocalState);

const defaultViewport = {
  style: { height: 100, width: 200 },
  name: "test",
  key: "test",
};

function setupState1() {
  mockedUseAuth.mockReturnValue({ isLoaded: true, isEmpty: true });
  mockedUseLocalState.mockReturnValue({
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    listenPrefix: "",
    setListenPrefix: vi.fn(),
    auth: { isLoaded: true, isEmpty: true },
    available: [],
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseController.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    selectView: vi.fn(),
    renderAsset: vi.fn(),
  } as unknown as ReturnType<typeof useController>);
  mockedUseView.mockReturnValue({
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useView>);
  mockedUseListeners.mockReturnValue({
    screens: [{ label: "Víkin", screen: { name: "Main" }, key: "vikinni" }],
    available: [],
  } as unknown as ReturnType<typeof useListeners>);
}

function setupState2() {
  mockedUseAuth.mockReturnValue({ isLoaded: true, isEmpty: true });
  mockedUseLocalState.mockReturnValue({
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    listenPrefix: "vikinni",
    setListenPrefix: vi.fn(),
    auth: { isLoaded: true, isEmpty: true },
    available: [],
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseController.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    selectView: vi.fn(),
    renderAsset: vi.fn(),
  } as unknown as ReturnType<typeof useController>);
  mockedUseView.mockReturnValue({
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useView>);
  mockedUseListeners.mockReturnValue({
    screens: [],
    available: [],
  } as unknown as ReturnType<typeof useListeners>);
}

function setupState3() {
  mockedUseAuth.mockReturnValue({
    isLoaded: true,
    isEmpty: false,
    email: "test@test.com",
  });
  mockedUseLocalState.mockReturnValue({
    email: "test@test.com",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    listenPrefix: "vikinni",
    setListenPrefix: vi.fn(),
    auth: { isLoaded: true, isEmpty: false, email: "test@test.com" },
    available: ["vikinni"],
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseController.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    selectView: vi.fn(),
    renderAsset: vi.fn(),
  } as unknown as ReturnType<typeof useController>);
  mockedUseView.mockReturnValue({
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useView>);
  mockedUseListeners.mockReturnValue({
    screens: [],
    available: [],
  } as unknown as ReturnType<typeof useListeners>);
}

describe("Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("State 1: unauthenticated, no listenPrefix", () => {
    it("renders screen selector and login form", () => {
      setupState1();
      render(<Controller />);

      expect(
        screen.getByRole("option", { name: "Veldu skjá" }),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("E-mail")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      expect(screen.getByText("Login")).toBeInTheDocument();
      expect(screen.getByText("Login (google)")).toBeInTheDocument();
    });

    it("does not render tabs", () => {
      setupState1();
      render(<Controller />);

      expect(screen.queryByText("Heim")).not.toBeInTheDocument();
      expect(screen.queryByText("Myndefni")).not.toBeInTheDocument();
      expect(screen.queryByText("Stillingar")).not.toBeInTheDocument();
    });

    it("renders available screens in the dropdown", () => {
      setupState1();
      render(<Controller />);

      expect(screen.getByText("Víkin Main")).toBeInTheDocument();
    });

    it("sets listenPrefix when a screen is selected and button clicked", () => {
      const mockSetListenPrefix = vi.fn();
      setupState1();
      mockedUseLocalState.mockReturnValue({
        ...mockedUseLocalState(),
        setListenPrefix: mockSetListenPrefix,
      });
      render(<Controller />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "0" } });

      const button = screen.getByText("Birta skjá");
      fireEvent.click(button);

      expect(mockSetListenPrefix).toHaveBeenCalledWith("vikinni");
    });

    it("disables Birta skjá button when no screen is selected", () => {
      setupState1();
      render(<Controller />);

      const button = screen.getByText("Birta skjá");
      expect(button).toBeDisabled();
    });
  });

  describe("State 2: unauthenticated with listenPrefix", () => {
    it("renders null", () => {
      setupState2();
      const { container } = render(<Controller />);

      expect(container.innerHTML).toBe("");
    });

    it("does not render login form", () => {
      setupState2();
      render(<Controller />);

      expect(screen.queryByPlaceholderText("E-mail")).not.toBeInTheDocument();
      expect(screen.queryByText("Login")).not.toBeInTheDocument();
    });

    it("does not render tabs", () => {
      setupState2();
      render(<Controller />);

      expect(screen.queryByText("Heim")).not.toBeInTheDocument();
      expect(screen.queryByText("Stillingar")).not.toBeInTheDocument();
    });
  });

  describe("State 3: authenticated", () => {
    it("renders tabs (Heim, Myndefni, Stillingar)", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByText("Heim")).toBeInTheDocument();
      expect(screen.getByText("Myndefni")).toBeInTheDocument();
      expect(screen.getByText("Stillingar")).toBeInTheDocument();
    });

    it("shows MatchActions on home tab by default", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByTestId("match-actions")).toBeInTheDocument();
      expect(
        screen.queryByTestId("match-action-settings"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
    });

    it("switches to Stillingar tab locally", () => {
      setupState3();
      render(<Controller />);

      fireEvent.click(screen.getByText("Stillingar"));

      expect(screen.getByTestId("match-action-settings")).toBeInTheDocument();
      expect(screen.queryByTestId("match-actions")).not.toBeInTheDocument();
    });

    it("switches to Myndefni tab locally", () => {
      setupState3();
      render(<Controller />);

      fireEvent.click(screen.getByText("Myndefni"));

      expect(screen.getByTestId("media-manager")).toBeInTheDocument();
      expect(screen.queryByTestId("match-actions")).not.toBeInTheDocument();
    });

    it("does not render login form or screen selector", () => {
      setupState3();
      render(<Controller />);

      expect(screen.queryByPlaceholderText("E-mail")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Veldu skjá" }),
      ).not.toBeInTheDocument();
    });

    it("renders AssetController", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByTestId("asset-controller")).toBeInTheDocument();
    });
  });
});
