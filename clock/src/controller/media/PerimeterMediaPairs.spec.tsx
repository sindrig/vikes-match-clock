import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerimeterMediaPairs from "./PerimeterMediaPairs";
import {
  useController,
  usePerimeter,
} from "../../contexts/FirebaseStateContext";
import { useLocalState } from "../../contexts/LocalStateContext";
import { ListResult, storageHelpers } from "../../firebase";
import { Asset, MainScreenMediaAsset, PerimeterMediaPair } from "../../types";

vi.mock("../../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
  useController: vi.fn(),
}));

vi.mock("../../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-firebase.appspot.com",
  storageHelpers: {
    uploadBytes: vi.fn().mockResolvedValue({
      metadata: { generation: "1700000000000000" },
    }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    listAll: vi.fn(),
    getDownloadURL: vi.fn(),
  },
}));

const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseController = vi.mocked(useController);
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
const mockCreatePair = vi
  .fn<(pairId: string, pair: PerimeterMediaPair) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockDeletePair = vi.fn().mockResolvedValue(undefined);
const mockSetMainScreen = vi.fn().mockResolvedValue(undefined);
const mockShowItemNow = vi.fn<(asset: Asset) => void>();
const mockRenderAsset = vi.fn();

const mainScreenAsset: MainScreenMediaAsset = {
  key: "library-photo",
  name: "sindri.jpg",
  url: "https://example.com/vikuti/images/sindri.jpg",
  type: "IMAGE",
};

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
    setPerimeterMediaPairMainScreenAsset: mockSetMainScreen,
    writeEligible: true,
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
  mockedUseController.mockReturnValue({
    showItemNow: mockShowItemNow,
    renderAsset: mockRenderAsset,
  } as unknown as ReturnType<typeof useController>);
  mockedUseLocalState.mockReturnValue(createMockLocalState());
  vi.mocked(storageHelpers.listAll).mockResolvedValue({
    items: ["sindri.jpg", "celebration.MP4"].map((name) => ({
      name,
      fullPath: `vikuti/images/${name}`,
    })),
    prefixes: [],
  } as unknown as ListResult);
  vi.mocked(storageHelpers.getDownloadURL).mockImplementation((path) =>
    Promise.resolve(`https://example.com/${path}`),
  );
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
    expect(Object.keys(overlay.columns[0]!.files as object)).toEqual([
      "2",
      "4",
    ]);
    expect(mockShowItemNow).not.toHaveBeenCalled();
  });

  it.each(["IMAGE", "VIDEO"] as const)(
    "shows the linked %s and both perimeter files with one click",
    (type) => {
      const asset = {
        ...mainScreenAsset,
        type,
        ...(type === "VIDEO" ? { loop: true } : {}),
      };
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          mediaPairs: { [pairId]: { ...pair, mainScreenAsset: asset } },
        }),
      );
      render(<PerimeterMediaPairs />);

      expect(screen.getByText("Stórskjár: sindri.jpg")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Sýna" }));

      const shown = mockShowItemNow.mock.calls[0]?.[0];
      expect(shown).toMatchObject({
        name: asset.name,
        type,
        url: asset.url,
        ...(type === "VIDEO" ? { loop: true } : {}),
      });
      expect(shown?.key).toBeTypeOf("string");
      expect(shown?.key).not.toBe(asset.key);
      expect(mockSetPerimeterOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [{ durationMs: 10000, files: pair.files }],
        }),
      );
      const firstKey: unknown = mockShowItemNow.mock.calls[0]?.[0];
      fireEvent.click(screen.getByRole("button", { name: "Sýna" }));
      expect(mockShowItemNow.mock.calls[1]?.[0]).not.toEqual(firstKey);
    },
  );

  it("calls clearPerimeterOverlay from the tab-local clear control", () => {
    render(<PerimeterMediaPairs />);

    fireEvent.click(screen.getByRole("button", { name: "Hreinsa jaðarskjá" }));

    expect(mockClearPerimeterOverlay).toHaveBeenCalledTimes(1);
    expect(mockRenderAsset).not.toHaveBeenCalled();
  });

  it("clears all three screens with the explicit all-screens control", () => {
    render(<PerimeterMediaPairs />);
    fireEvent.click(screen.getByRole("button", { name: "Hreinsa alla skjái" }));
    expect(mockRenderAsset).toHaveBeenCalledWith(null);
    expect(mockClearPerimeterOverlay).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "disables mutations when unavailable (authenticated: %s)",
    (authenticated) => {
      mockedUseLocalState.mockReturnValue(createMockLocalState(authenticated));
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ writeEligible: false }),
      );
      render(<PerimeterMediaPairs />);
      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeDisabled();
      }
      fireEvent.click(screen.getByRole("button", { name: "Sýna" }));
      expect(mockShowItemNow).not.toHaveBeenCalled();
      expect(mockSetPerimeterOverlay).not.toHaveBeenCalled();
    },
  );

  it("links existing media to a pair without reuploading perimeter files", async () => {
    render(<PerimeterMediaPairs />);
    fireEvent.click(screen.getByRole("button", { name: "Stórskjár" }));
    fireEvent.click(screen.getByRole("button", { name: "Velja úr myndefni" }));
    fireEvent.click(await screen.findByAltText("sindri.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    await waitFor(() =>
      expect(mockSetMainScreen).toHaveBeenCalledWith(
        pairId,
        expect.objectContaining({
          name: "sindri.jpg",
          url: "https://example.com/vikuti/images/sindri.jpg",
          type: "IMAGE",
        }),
      ),
    );
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockCreatePair).not.toHaveBeenCalled();
  });

  it("can remove the optional main-screen link without deleting any media", async () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        mediaPairs: { [pairId]: { ...pair, mainScreenAsset } },
      }),
    );
    render(<PerimeterMediaPairs />);
    fireEvent.click(screen.getByRole("button", { name: "Stórskjár" }));
    fireEvent.click(screen.getByRole("button", { name: "Aftengja stórskjá" }));
    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    await waitFor(() =>
      expect(mockSetMainScreen).toHaveBeenCalledWith(pairId, null),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("leaves the main-screen editor open when saving fails", async () => {
    mockSetMainScreen.mockRejectedValueOnce(new Error("permission denied"));
    render(<PerimeterMediaPairs />);
    fireEvent.click(screen.getByRole("button", { name: "Stórskjár" }));
    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ekki tókst að vista stórskjárefni",
    );
    expect(screen.getByRole("button", { name: "Vista" })).toBeEnabled();
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
      {
        name: string;
        files: Record<string, { name: string; generation?: string }>;
      },
    ];
    expect(created[1].name).toBe("Sindri");
    expect(Object.keys(created[1].files)).toEqual(["2", "4"]);
    expect(created[1].files["2"]?.generation).toBe("1700000000000000");
    expect(created[1].files["4"]?.generation).toBe("1700000000000000");
    expect(created[1]).not.toHaveProperty("mainScreenAsset");
  });

  it("creates a triple using an existing looping MP4 from the media library", async () => {
    render(<PerimeterMediaPairs />);
    fireEvent.click(screen.getByRole("button", { name: "Nýtt jaðarefni" }));
    fireEvent.change(screen.getByLabelText("Nafn"), {
      target: { value: "Sindri" },
    });
    fireEvent.change(screen.getByLabelText("48 skjáir"), {
      target: { files: [new File(["v"], "48.mp4", { type: "video/mp4" })] },
    });
    fireEvent.change(screen.getByLabelText("40 skjáir"), {
      target: { files: [new File(["i"], "40.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Velja úr myndefni" }));
    fireEvent.click(await screen.findByLabelText("celebration.MP4"));
    fireEvent.click(screen.getByRole("button", { name: "Vista" }));

    await waitFor(() => expect(mockCreatePair).toHaveBeenCalledTimes(1));
    expect(mockCreatePair.mock.calls[0]?.[1].mainScreenAsset).toMatchObject({
      name: "celebration.MP4",
      type: "VIDEO",
      loop: true,
      url: "https://example.com/vikuti/images/celebration.MP4",
    });
    expect(mockedUpload).toHaveBeenCalledTimes(2);
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

  it("cleans up a successful upload when its sibling upload fails", async () => {
    // First upload (48 skjáir) fails; the second (40 skjáir) already landed
    // and must be removed so it is not orphaned in Storage.
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
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    const deleted = mockedDelete.mock.calls[0]?.[0] as string;
    expect(deleted).toMatch(
      /\/perimeter-overlays\/[0-9a-f-]+\/40\/40-\d+-sindri\.png$/,
    );
  });

  it("cleans up both uploaded files when the library record write fails", async () => {
    mockCreatePair.mockRejectedValueOnce(new Error("write failed"));
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
      expect(screen.getByText(/write failed/)).toBeInTheDocument(),
    );
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    // Both uploads landed but the record write failed: both must be removed so
    // a retry under a fresh pair ID never orphans them.
    expect(mockedDelete).toHaveBeenCalledTimes(2);
  });
});
