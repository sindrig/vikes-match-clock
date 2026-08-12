import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerimeterControl from "./PerimeterControl";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { closestCenter } from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent } from "@dnd-kit/core";

vi.mock("../contexts/FirebaseStateContext", () => ({
  usePerimeter: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../firebase", () => ({
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-staging.appspot.com",
  storageHelpers: {
    listAll: vi.fn().mockResolvedValue({ items: [] }),
    uploadBytes: vi.fn().mockResolvedValue(undefined),
  },
}));

const dndProps = vi.hoisted(() => ({
  onDragEnd: null as null | ((event: DragEndEvent) => void),
  collisionDetection: null as null | CollisionDetection,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dndProps.onDragEnd = props.onDragEnd
        ? (event: DragEndEvent) => props.onDragEnd?.(event)
        : null;
      dndProps.collisionDetection = props.collisionDetection ?? null;
      return createElement(actual.DndContext, props);
    },
  };
});

const mockedUsePerimeter = vi.mocked(usePerimeter);
const mockedUseLocalState = vi.mocked(useLocalState);

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

const baseAppliedAdLayout = {
  lanes: [
    { id: "lane-1", name: "40 skjáir" },
    { id: "lane-2", name: "48 skjáir" },
  ],
  revision: "rev-123",
  phase: "idle" as const,
  error: null,
  updatedAt: Date.now(),
  columns: [],
};

const mockSetPerimeterAdLayout =
  vi.fn<ReturnType<typeof usePerimeter>["setPerimeterAdLayout"]>();

const createMockPerimeterReturn = (
  overrides: Partial<ReturnType<typeof usePerimeter>> = {},
): ReturnType<typeof usePerimeter> =>
  ({
    perimeter: { enabled: true, state: "off" },
    preview: basePreview,
    previewLoaded: true,
    setPerimeterState: vi.fn(),
    setPerimeterOverlay: vi.fn(),
    clearPerimeterOverlay: vi.fn(),
    setPerimeterAdLayout: mockSetPerimeterAdLayout,
    overlay: null,
    overlayStatus: null,
    adLayout: null,
    appliedAdLayout: baseAppliedAdLayout,
    appliedAdLayoutLoaded: true,
    appliedAdLayoutError: null,
    getServerTime: () => Date.now(),
    ...overrides,
  }) as unknown as ReturnType<typeof usePerimeter>;

const createMockLocalState = (
  overrides: Partial<ReturnType<typeof useLocalState>> = {},
): ReturnType<typeof useLocalState> =>
  ({
    listenPrefix: "test-location",
    setListenPrefix: vi.fn(),
    available: ["test-location"],
    auth: { email: "test@example.com", uid: "test-uid" },
    isAdmin: false,
    screenKey: null,
    setScreenKey: vi.fn(),
    email: "test@example.com",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useLocalState>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePerimeter.mockReturnValue(createMockPerimeterReturn());
  mockedUseLocalState.mockReturnValue(createMockLocalState());
});

describe("PerimeterControl", () => {
  it("renders nothing when perimeter is not enabled", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: false, state: "off" },
      }),
    );

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

  it("opens the modal with the new title", () => {
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText("Jaðarskjár — Umsýsla auglýsinga"),
    ).toBeInTheDocument();
  });

  it("shows a loading state before the appliedAdLayout subscription delivers", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({ appliedAdLayoutLoaded: false }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText(/Sæki forskoðun/i)).toBeInTheDocument();
  });

  it("shows the no-preview state when appliedAdLayout is undefined", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: undefined,
        appliedAdLayoutLoaded: true,
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText(/Engin forskoðun hefur verið birt enn/i),
    ).toBeInTheDocument();
  });

  it("shows an error state when phase is error", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          phase: "error",
          error: "Failed to load Resolume composition",
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Villa")).toBeInTheDocument();
    expect(
      screen.getByText("Failed to load Resolume composition"),
    ).toBeInTheDocument();
  });

  it("shows a no-lanes warning when lanes array is empty", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          lanes: [],
          columns: [],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText(/Engar raðir eru stilltar/i)).toBeInTheDocument();
  });

  it("shows empty state with add button when no columns exist", () => {
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText(/Engir dálkar í jaðarskjánum/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Bæta við dálki")).toBeInTheDocument();
  });

  it("shows the status bar with phase and lane count", () => {
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Í bið")).toBeInTheDocument();
    expect(screen.getByText("2 raðir")).toBeInTheDocument();
  });

  it("shows revision pending indicator when revisions differ", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-different",
          columns: [],
        },
        appliedAdLayout: baseAppliedAdLayout,
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Uppfærslu beðið")).toBeInTheDocument();
  });

  it("shows live indicator when revisions match", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [],
        },
        appliedAdLayout: baseAppliedAdLayout,
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Lifandi")).toBeInTheDocument();
  });

  it("shows stale warning based on the applied ad-layout status timestamp", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          updatedAt: Date.now() - 60 * 60 * 1000,
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText(/Staða jaðarskjás er gömul/i)).toBeInTheDocument();
  });

  it("does not warn when the applied status is fresh", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        preview: { updatedAt: Date.now() - 60 * 60 * 1000, columns: [] },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.queryByText(/Staða jaðarskjás er gömul/i),
    ).not.toBeInTheDocument();
  });

  it("opens add column dialog when clicking add button", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          columns: [
            {
              id: "col-1",
              deckColumns: [1],
              files: {
                "lane-1": {
                  name: "test.mp4",
                  thumbnail: "data:image/png;base64,abc",
                },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));
    fireEvent.click(screen.getByText("Bæta við dálki"));

    expect(screen.getByText("Nýr dálkur")).toBeInTheDocument();
    // Lane labels appear in both the column and the dialog; verify dialog is open
    const dialogLabels = screen.getAllByText("40 skjáir");
    expect(dialogLabels.length).toBeGreaterThanOrEqual(1);
    const dialogLabels48 = screen.getAllByText("48 skjáir");
    expect(dialogLabels48.length).toBeGreaterThanOrEqual(1);
  });

  it("disables the save button until all lanes have a file selected", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          columns: [],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));
    fireEvent.click(screen.getByText("Bæta við dálki"));

    // Save button should be disabled initially (no lanes selected)
    const saveBtn = screen.getByRole("button", { name: "Vista" });
    expect(saveBtn).toBeDisabled();
  });

  it("derives columns from adLayout when available", () => {
    const testColumn = {
      id: "col-test",
      files: {
        "lane-1": { name: "file.mp4", source: "gs://bucket/test/file.mp4" },
      },
    };
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [testColumn],
        },
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          columns: [
            {
              id: "col-test",
              deckColumns: [1],
              files: {
                "lane-1": {
                  name: "file.mp4",
                },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    // Should show the column from adLayout
    expect(screen.getByText("Dálkur 1")).toBeInTheDocument();
  });

  it("labels the icon-only delete control with an accessible name", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [
            {
              id: "col-1",
              files: {
                "lane-1": {
                  name: "a.mp4",
                  source: "gs://bucket/a.mp4",
                },
                "lane-2": {
                  name: "b.mp4",
                  source: "gs://bucket/b.mp4",
                },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByRole("button", { name: "Fjarlægja dálk 1" }),
    ).toBeInTheDocument();
  });

  it("disables adding a column at the 20-column limit", () => {
    const manyColumns = Array.from({ length: 20 }, (_, i) => ({
      id: `col-${i}`,
      files: {
        "lane-1": {
          name: `a${i}.mp4`,
          source: `gs://bucket/a${i}.mp4`,
        },
        "lane-2": {
          name: `b${i}.mp4`,
          source: `gs://bucket/b${i}.mp4`,
        },
      },
    }));
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: { version: 1, revision: "rev-123", columns: manyColumns },
        appliedAdLayout: { ...baseAppliedAdLayout, columns: [] },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByRole("button", { name: /Bæta við dálki/ }),
    ).toBeDisabled();
    expect(screen.getByText(/Hámark 20 dálka náð/)).toBeInTheDocument();
  });

  it("keeps the board visible and shows the error in the status bar", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: {
          ...baseAppliedAdLayout,
          phase: "error",
          error: "scp failed",
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("Villa")).toBeInTheDocument();
    expect(screen.getByText(/scp failed/)).toBeInTheDocument();
    // The add control remains available for a corrective revision.
    expect(screen.getByText("Bæta við dálki")).toBeInTheDocument();
  });

  it("shows a subscription error instead of an endless loader", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: undefined,
        appliedAdLayoutLoaded: true,
        appliedAdLayoutError: "Gat ekki sótt stöðu jaðarskjás",
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(
      screen.getByText(/Gat ekki sótt stöðu jaðarskjás/),
    ).toBeInTheDocument();
  });

  it("shows a write error and stays open when saving fails", async () => {
    mockSetPerimeterAdLayout.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [
            {
              id: "col-1",
              files: {
                "lane-1": {
                  name: "a.mp4",
                  source: "gs://bucket/a.mp4",
                },
                "lane-2": {
                  name: "b.mp4",
                  source: "gs://bucket/b.mp4",
                },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Fjarlægja dálk 1" }));

    expect(await screen.findByText(/Ekki tókst að vista/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("uses closestCenter collision detection for raw UUID column ids", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [
            {
              id: "col-1",
              files: {
                "lane-1": { name: "a.mp4", source: "gs://bucket/a.mp4" },
                "lane-2": { name: "b.mp4", source: "gs://bucket/b.mp4" },
              },
            },
            {
              id: "col-2",
              files: {
                "lane-1": { name: "c.mp4", source: "gs://bucket/c.mp4" },
                "lane-2": { name: "d.mp4", source: "gs://bucket/d.mp4" },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(dndProps.collisionDetection).toBe(closestCenter);
  });

  it("reorders columns and writes a fresh revision on drag end", async () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        adLayout: {
          version: 1,
          revision: "rev-123",
          columns: [
            {
              id: "col-1",
              files: {
                "lane-1": { name: "a.mp4", source: "gs://bucket/a.mp4" },
                "lane-2": { name: "b.mp4", source: "gs://bucket/b.mp4" },
              },
            },
            {
              id: "col-2",
              files: {
                "lane-1": { name: "c.mp4", source: "gs://bucket/c.mp4" },
                "lane-2": { name: "d.mp4", source: "gs://bucket/d.mp4" },
              },
            },
          ],
        },
      }),
    );
    render(<PerimeterControl />);

    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(dndProps.onDragEnd).not.toBeNull();
    dndProps.onDragEnd!({ active: { id: "col-2" }, over: { id: "col-1" } });

    await waitFor(() =>
      expect(mockSetPerimeterAdLayout).toHaveBeenCalledTimes(1),
    );
    const layout = mockSetPerimeterAdLayout.mock.calls[0]?.[0];
    expect(layout).toBeDefined();
    expect(layout?.revision).not.toBe("rev-123");
    expect(layout?.columns.map((c) => c.id)).toEqual(["col-2", "col-1"]);
  });
});
