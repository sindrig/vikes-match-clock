import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PerimeterDisplayReports from "./PerimeterDisplayReports";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import useScreenReports, { ScreenReportEntry } from "../hooks/useScreenReports";

vi.mock("../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../hooks/useScreenReports", () => ({
  default: vi.fn(),
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseLocalState = vi.mocked(useLocalState);
const mockedUseScreenReports = vi.mocked(useScreenReports);

const fixedNow = 1_700_000_000_000;

const entry = (
  overrides: Partial<ScreenReportEntry> & { connectionId: string },
): ScreenReportEntry => ({
  displayKind: "perimeter",
  label: "",
  resolution: "",
  error: "",
  errorAt: 0,
  connectedAt: fixedNow,
  lastHeartbeat: fixedNow,
  ...overrides,
});

describe("PerimeterDisplayReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUsePerimeter.mockReturnValue({
      getServerTime: () => fixedNow,
    } as unknown as ReturnType<typeof usePerimeter>);
    mockedUseLocalState.mockReturnValue({
      listenPrefix: "vikuti",
    } as unknown as ReturnType<typeof useLocalState>);
  });

  it("warns when no perimeter screen is connected", () => {
    mockedUseScreenReports.mockReturnValue([]);
    render(<PerimeterDisplayReports />);

    expect(
      screen.getByText(/Enginn jaðarskjár er tengdur/),
    ).toBeInTheDocument();
    expect(screen.getByText("0 tengdir")).toBeInTheDocument();
  });

  it("lists connected screens with a healthy badge", () => {
    mockedUseScreenReports.mockReturnValue([
      entry({
        connectionId: "conn-1",
        label: "Skjár AAAA",
        resolution: "3840x1080",
      }),
    ]);
    render(<PerimeterDisplayReports />);

    expect(screen.getByText("Skjár AAAA")).toBeInTheDocument();
    expect(screen.getByText("3840x1080")).toBeInTheDocument();
    expect(screen.getByText("1 tengdur")).toBeInTheDocument();
    expect(screen.getByText("Í lagi")).toBeInTheDocument();
    expect(screen.queryByText(/Ósvöruð/)).not.toBeInTheDocument();
  });

  it("shows the last reported error and its time", () => {
    mockedUseScreenReports.mockReturnValue([
      entry({
        connectionId: "conn-1",
        label: "Skjár AAAA",
        error: "Storage generation unavailable",
        errorAt: fixedNow - 30_000,
      }),
    ]);
    render(<PerimeterDisplayReports />);

    expect(
      screen.getByText(/Storage generation unavailable/),
    ).toBeInTheDocument();
    expect(screen.getByText("Villa")).toBeInTheDocument();
    // The healthy badge is not rendered for an errored screen.
    expect(screen.queryByText("Í lagi")).not.toBeInTheDocument();
  });

  it("filters non-perimeter screens out of the list", () => {
    mockedUseScreenReports.mockReturnValue([
      entry({
        connectionId: "conn-board",
        displayKind: "scoreboard",
        label: "Skjáborð",
      }),
      entry({ connectionId: "conn-perim", label: "Skjár AAAA" }),
    ]);
    render(<PerimeterDisplayReports />);

    expect(screen.getByText("Skjár AAAA")).toBeInTheDocument();
    expect(screen.queryByText("Skjáborð")).not.toBeInTheDocument();
    expect(screen.getByText("1 tengdur")).toBeInTheDocument();
  });

  it("flags a screen whose heartbeat is stale", () => {
    mockedUseScreenReports.mockReturnValue([
      entry({
        connectionId: "conn-1",
        label: "Skjár AAAA",
        lastHeartbeat: fixedNow - 5 * 60 * 1000,
      }),
    ]);
    render(<PerimeterDisplayReports />);

    expect(screen.getByText("Ósvöruð")).toBeInTheDocument();
    expect(screen.getByText(/Skjárinn svarar ekki nýlega/)).toBeInTheDocument();
  });

  it("ignores stale flags while the server time is unavailable", () => {
    mockedUsePerimeter.mockReturnValue({
      getServerTime: () => 0,
    } as unknown as ReturnType<typeof usePerimeter>);
    mockedUseScreenReports.mockReturnValue([
      entry({
        connectionId: "conn-1",
        label: "Skjár AAAA",
        lastHeartbeat: 0,
        connectedAt: 1,
      }),
    ]);
    render(<PerimeterDisplayReports />);

    expect(screen.getByText("Í lagi")).toBeInTheDocument();
  });
});
