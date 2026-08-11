import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PerimeterControl from "./PerimeterControl";
import { usePerimeter } from "../contexts/FirebaseStateContext";

vi.mock("../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);

describe("PerimeterControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      setPerimeterState: vi.fn(),
    });
  });

  it("renders nothing when perimeter is not enabled", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: false, state: "off" },
      setPerimeterState: vi.fn(),
    });

    const { container } = render(<PerimeterControl />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Kveikt")).not.toBeInTheDocument();
    expect(screen.queryByText("Slökkt")).not.toBeInTheDocument();
  });

  it("renders Kveikt and Slökkt buttons when enabled", () => {
    render(<PerimeterControl />);

    expect(screen.getByText("Kveikt")).toBeInTheDocument();
    expect(screen.getByText("Slökkt")).toBeInTheDocument();
  });

  it("calls setPerimeterState with on when Kveikt is clicked", () => {
    const setPerimeterState = vi.fn();
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      setPerimeterState,
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByText("Kveikt"));

    expect(setPerimeterState).toHaveBeenCalledWith("on");
  });

  it("calls setPerimeterState with off when Slökkt is clicked", () => {
    const setPerimeterState = vi.fn();
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "on" },
      setPerimeterState,
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByText("Slökkt"));

    expect(setPerimeterState).toHaveBeenCalledWith("off");
  });
});
