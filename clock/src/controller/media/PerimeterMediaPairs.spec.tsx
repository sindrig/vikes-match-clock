import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerimeterMediaPairs from "./PerimeterMediaPairs";
import { usePerimeter } from "../../contexts/FirebaseStateContext";
import { useLocalState } from "../../contexts/LocalStateContext";
import { storageHelpers } from "../../firebase";

vi.mock("../../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
}));

vi.mock("../../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-firebase.appspot.com",
  storageHelpers: {
    uploadBytes: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseLocalState = vi.mocked(useLocalState);
const mockedUpload = vi.mocked(storageHelpers.uploadBytes);
const mockedDelete = vi.mocked(storageHelpers.deleteObject);

const pairId = "11111111-1111-4111-8111-111111111111";
const pair = {
  name: "Sindri",
  files: {
    "2": {
      name: "48-1-sindri.mp4",
      source: `gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/${pairId}/48/48-1-sindri.mp4`,
    },
    "4": {
      name: "40-1-sindri.png",
      source: `gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/${pairId}/40/40-1-sindri.png`,
    },
  },
};

const mockSetPerimeterOverlay = vi.fn();
const mockClearPerimeterOverlay = vi.fn();
const mockCreatePair = vi.fn().mockResolvedValue(undefined);
const mockDeletePair = vi.fn().mockResolvedValue(undefined);

const createMockPerimeterReturn = (
  overrides: Partial<ReturnType<typeof usePerimeter>> = {},
): ReturnType<typeof usePerimeter> =>
  ({
    perimeter: { enabled: true, state: "off" },
    preview: null,
    previewLoaded: false,
    setPerimeterState: vi.fn(),
    setPerimeterOverlay: mockSetPerimeterOverlay,
    clearPerimeterOverlay: mockClearPerimeterOverlay,
    setPerimeterAdLayout: vi.fn(),
    createPerimeterMediaPair: mockCreatePair,
    deletePerimeterMediaPair: mockDeletePair,
    mediaPairs: { [pairId]: pair },
    overlay: null,
    overlayStatus: null,
    adLayout: null,
    appliedAdLayout: undefined,
    appliedAdLayoutLoaded: false,
    appliedAdLayoutError: null,
    getServerTime: () => Date.now(),
    ...overrides,
  }) as unknown as ReturnType<typeof usePerimeter>;

const createMockLocalState = (
  authenticated = true,
): ReturnType<typeof useLocalState> =>
  ({
    listenPrefix: "vikuti",
    auth: { isLoaded: true, isEmpty: !authenticated },
  }) as unknown as ReturnType<typeof useLocalState>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePerimeter.mockReturnValue(createMockPerimeterReturn());
  mockedUseLocalState.mockReturnValue(createMockLocalState());
});

describe("PerimeterMediaPairs", () => {
  it("renders an empty state when no pairs exist", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({ mediaPairs: {} }),
    );
    render(<PerimeterMediaPairs />);

    expect(screen.getByText("Engin jaðarefni skráð.")).toBeInTheDocument();
  });

  it("renders pair cards with the name and both filenames only", () => {
    const { container } = render(<PerimeterMediaPairs />);

    expect(screen.getByText("Sindri")).toBeInTheDocument();
    expect(screen.getByText("48 skjáir: 48-1-sindri.mp4")).toBeInTheDocument();
    expect(screen.getByText("40 skjáir: 40-1-sindri.png")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("emits a fresh overlay command on Sýna", () => {
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Sýna" }));

    expect(mockSetPerimeterOverlay).toHaveBeenCalledTimes(1);
    const overlay = mockSetPerimeterOverlay.mock.calls[0]?.[0] as {
      id: string;
      columns: Array<{ durationMs: number; files: unknown }>;
    };
    expect(overlay.id).toBeTypeOf("string");
    expect(overlay.id).not.toBe(pairId);
    expect(overlay.columns).toHaveLength(1);
    expect(overlay.columns[0]).toEqual({
      durationMs: 10000,
      files: pair.files,
    });
    expect(Object.keys(overlay.columns[0].files as object)).toEqual(["2", "4"]);
  });

  it("calls clearPerimeterOverlay from the tab-local clear control", () => {
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Hreinsa jaðarskjá" }));

    expect(mockClearPerimeterOverlay).toHaveBeenCalledTimes(1);
  });

  it("deletes only the library record, never the Storage assets", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Fjarlægja" }));

    expect(mockDeletePair).toHaveBeenCalledWith(pairId);
    expect(mockedDelete).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("shows the daemon overlay status and error text", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        overlayStatus: {
          commandId: pairId,
          phase: "downloading",
          activeColumn: 0,
          error: "scp failed",
        },
      }),
    );
    render(<PerimeterMediaPairs />);

    expect(screen.getByText("Sækir")).toBeInTheDocument();
    expect(screen.getByText("scp failed")).toBeInTheDocument();
  });

  it("disables Vista until name, 48 and 40 files are selected", () => {
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Nýtt jaðarefni" }));

    expect(screen.getByRole("button", { name: "Vista" })).toBeDisabled();
  });

  it("uploads both files before writing the library record", async () => {
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Nýtt jaðarefni" }));
    fireEvent.change(screen.getByPlaceholderText("t.d. Sindri"), {
      target: { value: "Sindri" },
    });

    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0] as Element, {
      target: { files: [new File(["video"], "48.mp4", { type: "video/mp4" })] },
    });
    fireEvent.change(fileInputs[1] as Element, {
      target: { files: [new File(["image"], "40.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    await waitFor(() => expect(mockCreatePair).toHaveBeenCalledTimes(1));

    expect(mockedUpload).toHaveBeenCalledTimes(2);
    const uploadOrder = mockedUpload.mock.invocationCallOrder[0] ?? 0;
    const createOrder = mockCreatePair.mock.invocationCallOrder[0] ?? 0;
    expect(uploadOrder).toBeLessThan(createOrder);

    const created = mockCreatePair.mock.calls[0] as unknown as [
      string,
      { name: string; files: Record<string, { name: string }> },
    ];
    expect(created[1].name).toBe("Sindri");
    expect(Object.keys(created[1].files)).toEqual(["2", "4"]);
  });

  it("does not write a record when an upload fails", async () => {
    mockedUpload.mockRejectedValueOnce(new Error("upload failed"));
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Nýtt jaðarefni" }));
    fireEvent.change(screen.getByPlaceholderText("t.d. Sindri"), {
      target: { value: "Sindri" },
    });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0] as Element, {
      target: { files: [new File(["v"], "48.mp4", { type: "video/mp4" })] },
    });
    fireEvent.change(fileInputs[1] as Element, {
      target: { files: [new File(["i"], "40.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    await waitFor(() =>
      expect(screen.getByText(/upload failed/)).toBeInTheDocument(),
    );
    expect(mockCreatePair).not.toHaveBeenCalled();
  });
});
