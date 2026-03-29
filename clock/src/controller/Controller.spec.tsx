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
  useRemoteSettings: vi.fn(),
}));

vi.mock("../firebaseAuth", () => ({
  firebaseAuth: {
    login: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-spinners", () => ({
  RingLoader: ({ color, size }: { color: string; size: number }) => (
    <div data-testid="ring-loader">{`RingLoader color=${color} size=${size}`}</div>
  ),
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
import {
  useAuth,
  useLocalState,
  useRemoteSettings,
} from "../contexts/LocalStateContext";
import { firebaseAuth } from "../firebaseAuth";

const mockedUseController = vi.mocked(useController);
const mockedUseView = vi.mocked(useView);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseLocalState = vi.mocked(useLocalState);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);

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
    available: null,
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "",
    setListenPrefix: vi.fn(),
    available: null,
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
    available: null,
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
    setListenPrefix: vi.fn(),
    available: null,
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
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
    setListenPrefix: vi.fn(),
    available: ["vikinni"],
  });
  mockedUseController.mockReturnValue({
    controller: { view: VIEWS.idle, currentAsset: null },
    selectView: vi.fn(),
    renderAsset: vi.fn(),
    selectAssetView: vi.fn(),
  } as unknown as ReturnType<typeof useController>);
  mockedUseView.mockReturnValue({
    view: { vp: defaultViewport, background: "Default" },
  } as unknown as ReturnType<typeof useView>);
  mockedUseListeners.mockReturnValue({
    screens: [],
    available: [],
  } as unknown as ReturnType<typeof useListeners>);
}

function setupScreenSelector(
  overrides: {
    available?: string[] | null;
    setListenPrefix?: (prefix: string) => void;
  } = {},
) {
  const mockSetListenPrefix =
    overrides.setListenPrefix ?? vi.fn<(prefix: string) => void>();
  const mockAvailable =
    overrides.available !== undefined
      ? overrides.available
      : ["vikinni", "hasteinsvollur"];
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
    listenPrefix: "",
    setListenPrefix: mockSetListenPrefix,
    auth: { isLoaded: true, isEmpty: false, email: "test@test.com" },
    available: mockAvailable,
    screenViewport: null,
    setScreenViewport: vi.fn(),
  });
  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "",
    setListenPrefix: mockSetListenPrefix,
    available: mockAvailable,
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
    screens: [
      {
        label: "Víkingur Reykjavík",
        screen: { name: "Norðurskjár", style: {}, key: "vikinni" },
        key: "vikinni",
      },
      {
        label: "Víkingur Reykjavík",
        screen: { name: "Suðurskjár", style: {}, key: "vikinni" },
        key: "vikinni",
      },
      {
        label: "Hásteinsvöllur",
        screen: { name: "Skjár 1", style: {}, key: "hasteinsvollur" },
        key: "hasteinsvollur",
      },
    ],
    available: mockAvailable,
  } as unknown as ReturnType<typeof useListeners>);
  return { setListenPrefix: mockSetListenPrefix };
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
      expect(screen.getByPlaceholderText("Lykilorð")).toBeInTheDocument();
      expect(screen.getByText("Innskrá")).toBeInTheDocument();
      expect(screen.getByText("Innskrá með Google")).toBeInTheDocument();
    });

    it("does not render tabs", () => {
      setupState1();
      render(<Controller />);

      expect(screen.queryByText("Biðröð")).not.toBeInTheDocument();
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

    it("email/password login does NOT call setListenPrefix", () => {
      const mockSetListenPrefix = vi.fn();
      setupState1();
      mockedUseLocalState.mockReturnValue({
        ...mockedUseLocalState(),
        email: "test@vikingur.is",
        password: "testpass",
        setListenPrefix: mockSetListenPrefix,
      });
      render(<Controller />);

      const form = screen.getByText("Innskrá");
      fireEvent.click(form);

      expect(firebaseAuth.login).toHaveBeenCalledWith(
        "test@vikingur.is",
        "testpass",
      );
      expect(mockSetListenPrefix).not.toHaveBeenCalled();
    });
  });

  describe("State: authenticated, no listenPrefix (screen selector)", () => {
    it("renders screen selector heading", () => {
      setupScreenSelector();
      render(<Controller />);

      expect(screen.getByText("Veldu skjá til að stjórna")).toBeInTheDocument();
    });

    it("renders button for each available location with correct labels", () => {
      setupScreenSelector();
      render(<Controller />);

      expect(
        screen.getByText("Víkingur Reykjavík Norðurskjár / Suðurskjár"),
      ).toBeInTheDocument();
      expect(screen.getByText("Hásteinsvöllur Skjár 1")).toBeInTheDocument();
    });

    it("clicking location button calls setListenPrefix with location key", () => {
      const { setListenPrefix } = setupScreenSelector();
      render(<Controller />);

      fireEvent.click(screen.getByText("Hásteinsvöllur Skjár 1"));

      expect(setListenPrefix).toHaveBeenCalledWith("hasteinsvollur");
    });

    it("renders logout button that calls firebaseAuth.logout", () => {
      setupScreenSelector();
      render(<Controller />);

      const logoutButton = screen.getByText("Útskrá");
      fireEvent.click(logoutButton);

      expect(firebaseAuth.logout).toHaveBeenCalled();
    });

    it("does NOT render tabs when showing screen selector", () => {
      setupScreenSelector();
      render(<Controller />);

      expect(screen.queryByText("Heim")).not.toBeInTheDocument();
      expect(screen.queryByText("Myndefni")).not.toBeInTheDocument();
      expect(screen.queryByText("Stillingar")).not.toBeInTheDocument();
    });

    it("does NOT render login form when showing screen selector", () => {
      setupScreenSelector();
      render(<Controller />);

      expect(screen.queryByPlaceholderText("E-mail")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Lykilorð")).not.toBeInTheDocument();
      expect(screen.queryByText("Innskrá")).not.toBeInTheDocument();
    });

    it("shows empty message when available array is empty", () => {
      setupScreenSelector({ available: [] });
      render(<Controller />);

      expect(screen.getByText("Engir skjáir tiltækir")).toBeInTheDocument();
    });

    it("shows loading spinner when available is null (still loading)", () => {
      setupScreenSelector({ available: null });
      render(<Controller />);

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();
      expect(
        screen.queryByText("Engir skjáir tiltækir"),
      ).not.toBeInTheDocument();
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
      expect(screen.queryByText("Innskrá")).not.toBeInTheDocument();
    });

    it("does not render tabs", () => {
      setupState2();
      render(<Controller />);

      expect(screen.queryByText("Biðröð")).not.toBeInTheDocument();
      expect(screen.queryByText("Stillingar")).not.toBeInTheDocument();
    });
  });

  describe("State 3: authenticated", () => {
    it("renders tabs (Biðröð, Lið, Myndefni) and settings gear button", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByText("Biðröð")).toBeInTheDocument();
      expect(screen.getByText("Lið")).toBeInTheDocument();
      expect(screen.getByText("Myndefni")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Stillingar" }),
      ).toBeInTheDocument();
    });

    it("shows AssetController on queue tab by default", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByTestId("asset-controller")).toBeInTheDocument();
      expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
    });

    it("opens settings modal when gear button is clicked", () => {
      setupState3();
      render(<Controller />);

      fireEvent.click(screen.getByRole("button", { name: "Stillingar" }));

      expect(screen.getByTestId("match-action-settings")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("switches to Myndefni tab locally", () => {
      setupState3();
      render(<Controller />);

      fireEvent.click(screen.getByText("Myndefni"));

      expect(screen.getByTestId("media-manager")).toBeInTheDocument();
      expect(screen.queryByTestId("asset-controller")).not.toBeInTheDocument();
    });

    it("does not render login form or screen selector", () => {
      setupState3();
      render(<Controller />);

      expect(screen.queryByPlaceholderText("E-mail")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Veldu skjá" }),
      ).not.toBeInTheDocument();
    });

    it("renders AssetController on queue tab", () => {
      setupState3();
      render(<Controller />);

      expect(screen.getByTestId("asset-controller")).toBeInTheDocument();
    });

    it("syncs assetView to teams when Lið tab is clicked", () => {
      const mockSelectAssetView = vi.fn();
      setupState3();
      mockedUseController.mockReturnValue({
        ...mockedUseController(),
        selectAssetView: mockSelectAssetView,
      } as unknown as ReturnType<typeof useController>);
      render(<Controller />);

      fireEvent.click(screen.getByText("Lið"));

      expect(mockSelectAssetView).toHaveBeenCalledWith("teams");
    });
  });
});
