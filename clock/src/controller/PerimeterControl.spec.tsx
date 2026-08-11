import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PerimeterControl from "./PerimeterControl";
import { usePerimeter } from "../contexts/FirebaseStateContext";

vi.mock("../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);

const basePreview = {
  updatedAt: Date.now(),
  columns: [
    {
      id: 1,
      name: "Column 1",
      clips: [
        {
          id: 12,
          filename: "sponsor-loop.mp4",
          thumbnail: "data:image/jpeg;base64,abc",
        },
        { id: 13, filename: "logo.mp4" },
      ],
    },
  ],
};

describe("PerimeterControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      preview: basePreview,
      previewLoaded: true,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });
  });

  it("renders nothing when perimeter is not enabled", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: false, state: "off" },
      preview: null,
      previewLoaded: true,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });

    const { container } = render(<PerimeterControl />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a settings-row button when enabled", () => {
    render(<PerimeterControl />);

    expect(screen.getByText("Jaðarskjár")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opna" })).toBeInTheDocument();
  });

  it("does not show on/off controls anymore", () => {
    render(<PerimeterControl />);

    expect(screen.queryByText("Kveikt")).not.toBeInTheDocument();
    expect(screen.queryByText("Slökkt")).not.toBeInTheDocument();
  });

  it("opens the preview dialog and renders columns, filenames and thumbnails", () => {
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Jaðarskjár — forskoðun")).toBeInTheDocument();
    expect(screen.getByText("Column 1")).toBeInTheDocument();
    expect(screen.getByText("sponsor-loop.mp4")).toBeInTheDocument();
    expect(screen.getByText("logo.mp4")).toBeInTheDocument();
    expect(screen.getByAltText("sponsor-loop.mp4")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,abc",
    );
  });

  it("shows an unavailable-thumbnail placeholder when a clip has no thumbnail", () => {
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("logo.mp4")).toBeInTheDocument();
    expect(screen.getByText("Engin mynd")).toBeInTheDocument();
  });

  it("shows the no-preview state when no snapshot has been published", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      preview: null,
      previewLoaded: true,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText(/Engin forskoðun hefur verið birt enn/i),
    ).toBeInTheDocument();
  });

  it("shows a loading state before the preview subscription delivers", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      preview: null,
      previewLoaded: false,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText(/Sæki forskoðun/i)).toBeInTheDocument();
  });

  it("shows an empty state when the composition has no columns", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      preview: { updatedAt: Date.now(), columns: [] },
      previewLoaded: true,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText(/Engar klippur í jaðarskjánum/i),
    ).toBeInTheDocument();
  });

  it("shows a stale warning when the snapshot is old", () => {
    mockedUsePerimeter.mockReturnValue({
      perimeter: { enabled: true, state: "off" },
      preview: { updatedAt: Date.now() - 60 * 60 * 1000, columns: [] },
      previewLoaded: true,
      setPerimeterState: vi.fn(),
      getServerTime: () => Date.now(),
    });
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText(/Forskoðun er gömul/i)).toBeInTheDocument();
  });
});
