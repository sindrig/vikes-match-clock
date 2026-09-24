import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import type { ComponentProps } from "react";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import PerimeterControl from "./PerimeterControl";
import {
  useListeners,
  usePerimeter,
  useController,
} from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { closestCenter } from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent } from "@dnd-kit/core";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useFirebaseState: vi.fn(() => ({ writeEligible: true })),
  usePerimeter: vi.fn(),
  useListeners: vi.fn(),
  useController: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

vi.mock("../firebase", () => ({
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-staging.appspot.com",
  database: {},
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
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseLocalState = vi.mocked(useLocalState);
const mockedUseController = vi.mocked(useController);

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
    setPerimeterIdleClock: vi.fn().mockResolvedValue(undefined),
    skipPerimeterCue: vi.fn(),
    restartPerimeterDisplays: vi.fn(),
    setPerimeterOverlay: vi.fn(),
    clearPerimeterOverlay: vi.fn(),
    setPerimeterAdLayout: mockSetPerimeterAdLayout,
    overlay: null,
    overlayStatus: null,
    adLayout: null,
    appliedAdLayout: baseAppliedAdLayout,
    appliedAdLayoutLoaded: true,
    appliedAdLayoutError: null,
    brightness: null,
    brightnessStatus: null,
    brightnessAuto: null,
    setPerimeterBrightness: vi.fn().mockResolvedValue(undefined),
    setPerimeterBrightnessAuto: vi.fn().mockResolvedValue(undefined),
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
  mockedUseListeners.mockReturnValue({ available: [], screens: [] });
  mockedUseLocalState.mockReturnValue(createMockLocalState());
  mockedUseController.mockReturnValue({
    controller: { roster: { home: [], away: [] } },
  } as unknown as ReturnType<typeof useController>);
});

describe("PerimeterControl", () => {
  it("renders standalone controls without an opener modal", () => {
    const setPerimeterState = vi.fn();
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({ setPerimeterState }),
    );

    render(<PerimeterControl standalone />);

    expect(screen.getByRole("heading", { name: "Jaðarskjár" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Opna" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kveikja" }));
    expect(setPerimeterState).toHaveBeenCalledWith("on");
  });

  const mockWebVenueScreens = [
    {
      key: "test-location",
      label: "Test location",
      screen: {} as never,
      perimeterDisplay: {
        renderer: "web",
        compatibilityKeys: {
          base: { "1": "left" },
          overlay: {},
        },
        logicalScreens: {
          left: { id: "left", name: "Left", width: 4, height: 1 },
        },
      } as never,
    },
  ];

  const webVenueAdLayout = {
    version: 1,
    revision: "revision",
    columns: [
      {
        id: "column-1",
        files: {
          "1": { name: "left.png", source: "gs://bucket/left.png" },
        },
      },
    ],
  };

  it("offers a skip-forward button on a web venue while playing", () => {
    const skipPerimeterCue = vi.fn();
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        skipPerimeterCue,
      }),
    );

    render(<PerimeterControl standalone />);

    const skipButton = screen.getByRole("button", {
      name: "Fara á næsta dálk",
    });
    expect(skipButton).toBeEnabled();
    fireEvent.click(skipButton);
    expect(skipPerimeterCue).toHaveBeenCalledTimes(1);
  });

  it("disables the skip-forward button while the perimeter is off", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "off" },
        adLayout: webVenueAdLayout,
      }),
    );

    render(<PerimeterControl standalone />);

    expect(
      screen.getByRole("button", { name: "Fara á næsta dálk" }),
    ).toBeDisabled();
  });

  it("shows the brightness section on a web venue", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-brightness");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Bjartleiki jaðarskjás"),
    ).toBeVisible();
  });

  it("hides the brightness section at venues without a brightness controller", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUseLocalState.mockReturnValue(
      createMockLocalState({ listenPrefix: "virkid" }),
    );
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
      }),
    );

    render(<PerimeterControl standalone />);

    expect(document.querySelector(".perimeter-brightness")).toBeNull();
    expect(screen.queryByText("Bjartleiki jaðarskjás")).toBeNull();
  });

  it("shows the unconfigured goal-video fallback state", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        goalVideo: null,
        setPerimeterGoalVideo: vi.fn().mockResolvedValue(undefined),
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-goal-video");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText(
        "Ekkert stillt — markið notar goal-48/goal-40 skrárnar",
      ),
    ).toBeVisible();
    expect(
      within(section as HTMLElement).getByRole("button", {
        name: "Stilla markmyndband",
      }),
    ).toBeVisible();
  });

  it("shows the scorer celebration selector on a web venue with the default style active", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterScorerCelebration: vi.fn().mockResolvedValue(undefined),
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-scorer-celebration");
    expect(section).not.toBeNull();
    const ribbon = within(section as HTMLElement).getByRole("button", {
      name: "Sjálfgefið",
    });
    expect(ribbon).toHaveAttribute("aria-pressed", "true");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Bylgja" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("hides the scorer celebration selector on a Resolume venue", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: [
        {
          key: "test-location",
          label: "Test location",
          screen: {} as never,
          perimeterDisplay: {
            renderer: "resolume",
            compatibilityKeys: {
              base: { "1": "left" },
              overlay: { "2": "left" },
            },
            logicalScreens: {
              left: { id: "left", name: "Left", width: 4, height: 1 },
            },
          } as never,
        },
      ],
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
      }),
    );

    render(<PerimeterControl standalone />);

    expect(document.querySelector(".perimeter-scorer-celebration")).toBeNull();
  });

  it("saves the idle toggle without optimistic state and reports write failures", async () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    const save = vi.fn().mockResolvedValue(undefined);
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({ setPerimeterIdleClock: save }),
    );
    const { rerender } = render(<PerimeterControl standalone />);
    const toggle = screen.getByRole("switch", {
      name: "Sýna klukku og Víkingsmerki þegar slökkt er",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(save).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "off", idleClock: true },
        setPerimeterIdleClock: save,
      }),
    );
    rerender(<PerimeterControl standalone />);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    save.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(toggle);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ekki tókst að vista",
    );
    expect(save).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("writes the selected scorer celebration style", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    const setPerimeterScorerCelebration = vi
      .fn<ReturnType<typeof usePerimeter>["setPerimeterScorerCelebration"]>()
      .mockResolvedValue(undefined);
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterScorerCelebration,
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-scorer-celebration");
    expect(section).not.toBeNull();
    fireEvent.click(
      within(section as HTMLElement).getByRole("button", { name: "Bylgja" }),
    );

    expect(setPerimeterScorerCelebration).toHaveBeenCalledTimes(1);
    expect(setPerimeterScorerCelebration).toHaveBeenCalledWith("wave");
  });

  it("shows the player band style selector on a web venue with Default active", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterPlayerDisplayStyle: vi.fn().mockResolvedValue(undefined),
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-player-band-style");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Default" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Glow" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Streamer" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("hides the player band style selector on a Resolume venue", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: [
        {
          key: "test-location",
          label: "Test location",
          screen: {} as never,
          perimeterDisplay: {
            renderer: "resolume",
            compatibilityKeys: {
              base: { "1": "left" },
              overlay: { "2": "left" },
            },
            logicalScreens: {
              left: { id: "left", name: "Left", width: 4, height: 1 },
            },
          } as never,
        },
      ],
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
      }),
    );

    render(<PerimeterControl standalone />);

    expect(document.querySelector(".perimeter-player-band-style")).toBeNull();
    expect(document.querySelector(".perimeter-substitution-style")).toBeNull();
  });

  it("writes the selected player band style and disables while settling", async () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    const setPerimeterPlayerDisplayStyle = vi
      .fn<ReturnType<typeof usePerimeter>["setPerimeterPlayerDisplayStyle"]>()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20)),
      );
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterPlayerDisplayStyle,
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-player-band-style");
    expect(section).not.toBeNull();
    fireEvent.click(
      within(section as HTMLElement).getByRole("button", { name: "Glow" }),
    );

    expect(setPerimeterPlayerDisplayStyle).toHaveBeenCalledTimes(1);
    expect(setPerimeterPlayerDisplayStyle).toHaveBeenCalledWith("glow");
    // The controls stay disabled until the subscription reflects the write.
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Glow" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        within(section as HTMLElement).getByRole("button", { name: "Glow" }),
      ).toBeEnabled(),
    );
  });

  it("shows the substitution style selector on a web venue with Static active", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterSubstitutionStyle: vi.fn().mockResolvedValue(undefined),
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-substitution-style");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Static" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Relay" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Flash" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("writes the selected substitution style and disables while settling", async () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    const setPerimeterSubstitutionStyle = vi
      .fn<ReturnType<typeof usePerimeter>["setPerimeterSubstitutionStyle"]>()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20)),
      );
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        setPerimeterSubstitutionStyle,
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-substitution-style");
    expect(section).not.toBeNull();
    fireEvent.click(
      within(section as HTMLElement).getByRole("button", { name: "Flash" }),
    );

    expect(setPerimeterSubstitutionStyle).toHaveBeenCalledTimes(1);
    expect(setPerimeterSubstitutionStyle).toHaveBeenCalledWith("flash");
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Flash" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        within(section as HTMLElement).getByRole("button", { name: "Flash" }),
      ).toBeEnabled(),
    );
  });

  it("shows the configured goal-video files and edits them", async () => {
    const setPerimeterGoalVideo = vi
      .fn<ReturnType<typeof usePerimeter>["setPerimeterGoalVideo"]>()
      .mockResolvedValue(undefined);
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: [
        {
          key: "test-location",
          label: "Test location",
          screen: {} as never,
          perimeterDisplay: {
            renderer: "web",
            compatibilityKeys: {
              base: { "1": "left" },
              overlay: { "2": "screen-48", "4": "screen-40" },
            },
            logicalScreens: {
              "screen-48": {
                id: "screen-48",
                name: "48 skjáir",
                width: 100,
                height: 10,
              },
              "screen-40": {
                id: "screen-40",
                name: "40 skjáir",
                width: 90,
                height: 10,
              },
            },
          } as never,
        },
      ],
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        goalVideo: {
          files: {
            "2": {
              name: "goal-48.mp4",
              source: "gs://bucket/test-location/perimeter/goal-48.mp4",
              generation: "1",
            },
            "4": {
              name: "goal-40.mp4",
              source: "gs://bucket/test-location/perimeter/goal-40.mp4",
              generation: "2",
            },
          },
        },
        setPerimeterGoalVideo,
      }),
    );

    render(<PerimeterControl standalone />);

    const section = document.querySelector(".perimeter-goal-video");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("48 skjáir: goal-48.mp4"),
    ).toBeVisible();
    expect(
      within(section as HTMLElement).getByText("40 skjáir: goal-40.mp4"),
    ).toBeVisible();

    fireEvent.click(
      within(section as HTMLElement).getByRole("button", { name: "Breyta" }),
    );
    const modal = screen.getByRole("dialog");
    // The edit modal opens with one picker per configured overlay target.
    expect(
      within(modal).getByRole("button", {
        name: "Hreinsa stillingu",
      }),
    ).toBeEnabled();
    const save = within(modal).getByRole("button", {
      name: "Vista",
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      expect(setPerimeterGoalVideo).toHaveBeenCalledTimes(1);
    });
    expect(setPerimeterGoalVideo).toHaveBeenCalledWith({
      files: {
        "2": {
          name: "goal-48.mp4",
          source: "gs://bucket/test-location/perimeter/goal-48.mp4",
          generation: "1",
        },
        "4": {
          name: "goal-40.mp4",
          source: "gs://bucket/test-location/perimeter/goal-40.mp4",
          generation: "2",
        },
      },
    });
  });

  it("hides the skip-forward button on non-web venues", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
      }),
    );

    render(<PerimeterControl standalone />);
    expect(
      screen.queryByRole("button", { name: "Fara á næsta dálk" }),
    ).toBeNull();
  });

  it("offers a restart button on a web venue", () => {
    const restartPerimeterDisplays = vi.fn();
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        restartPerimeterDisplays,
      }),
    );

    render(<PerimeterControl standalone />);

    const restartButton = screen.getByRole("button", {
      name: "Endurræsa alla jaðarskjá",
    });
    expect(restartButton).toBeEnabled();
    fireEvent.click(restartButton);
    expect(restartPerimeterDisplays).toHaveBeenCalledTimes(1);
  });

  it("hides the restart button on non-web venues", () => {
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
      }),
    );

    render(<PerimeterControl standalone />);

    expect(
      screen.queryByRole("button", { name: "Endurræsa alla jaðarskjá" }),
    ).toBeNull();
  });

  it("hides the scorer preparation panel and retry control on a web venue", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: mockWebVenueScreens,
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        adLayout: webVenueAdLayout,
        goalScorerPreparationStatus: {
          jobId: "job-1",
          phase: "preparing",
          readyCount: 0,
          fallbackCount: 0,
          unavailableCount: 0,
          failedCount: 0,
          total: 2,
          updatedAt: Date.now(),
          error: null,
          players: {},
        } as never,
      }),
    );

    render(<PerimeterControl standalone />);

    expect(
      screen.queryByText("Markaskorari — jaðarefni"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Endurtaka undirbúning" }),
    ).toBeNull();
  });

  it("keeps the scorer preparation panel and retry control on a Resolume venue", () => {
    const requestGoalScorerPreparation = vi.fn().mockResolvedValue(undefined);
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: [
        {
          key: "test-location",
          label: "Test location",
          screen: {} as never,
          perimeterDisplay: {
            renderer: "resolume",
            compatibilityKeys: { base: {}, overlay: {} },
            logicalScreens: {},
          } as never,
        },
      ],
    });
    mockedUseController.mockReturnValue({
      controller: {
        roster: {
          home: [{ id: 10, name: "Jón", number: 7, show: true, role: "FW" }],
          away: [],
        },
      },
    } as unknown as ReturnType<typeof useController>);
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        perimeter: { enabled: true, state: "on" },
        goalScorerPreparationStatus: {
          jobId: "job-1",
          phase: "ready",
          readyCount: 1,
          fallbackCount: 0,
          unavailableCount: 0,
          failedCount: 0,
          total: 1,
          updatedAt: Date.now(),
          error: null,
          players: {
            "10": { status: "ready", error: null },
          },
        } as never,
        requestGoalScorerPreparation,
      }),
    );

    render(<PerimeterControl standalone />);

    expect(screen.getByText("Markaskorari — jaðarefni")).toBeVisible();
    expect(screen.getByTestId("goal-scorer-player-10")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Endurtaka undirbúning" }),
    );
    expect(requestGoalScorerPreparation).toHaveBeenCalledWith(true);
  });

  it("derives editable lanes from a web venue mapping without daemon status", () => {
    mockedUseListeners.mockReturnValue({
      available: [],
      screens: [
        {
          key: "test-location",
          label: "Test location",
          screen: {} as never,
          perimeterDisplay: {
            renderer: "web",
            compatibilityKeys: {
              base: { "1": "left", "3": "right" },
              overlay: {},
            },
            logicalScreens: {
              left: { id: "left", name: "Left", width: 4, height: 1 },
              right: { id: "right", name: "Right", width: 4, height: 1 },
            },
          } as never,
        },
      ],
    });
    mockedUsePerimeter.mockReturnValue(
      createMockPerimeterReturn({
        appliedAdLayout: undefined,
        appliedAdLayoutLoaded: false,
        adLayout: {
          version: 1,
          revision: "revision",
          columns: [
            {
              id: "column",
              files: {
                "1": { name: "left.png", source: "gs://bucket/left.png" },
                "3": { name: "right.png", source: "gs://bucket/right.png" },
              },
            },
          ],
        },
      }),
    );

    render(<PerimeterControl />);
    fireEvent.click(screen.getByRole("button", { name: "Opna" }));

    expect(screen.getByText("2 raðir")).toBeInTheDocument();
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

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

    // Save button should be disabled initially (no lanes selected). Scope to
    // the add-column dialog — the brightness section has its own Vista button.
    const addDialog = document.querySelector(".perimeter-add-dialog");
    expect(addDialog).not.toBeNull();
    const saveBtn = within(addDialog as HTMLElement).getByRole("button", {
      name: "Vista",
    });
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

  describe("BrightnessSection", () => {
    const openModal = () => {
      render(<PerimeterControl />);
      fireEvent.click(screen.getByRole("button", { name: "Opna" }));
    };

    const getBrightnessInput = () => {
      const modal = document.querySelector(".perimeter-preview-modal");
      expect(modal).not.toBeNull();
      const input = modal!.querySelector(
        ".perimeter-brightness-controls input",
      );
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    };

    const getBrightnessSection = () => {
      const section = document.querySelector(".perimeter-brightness");
      expect(section).not.toBeNull();
      return section as HTMLElement;
    };

    const getApplyButton = () => screen.getByRole("button", { name: "Vista" });

    it("submits a valid percentage to setPerimeterBrightness", () => {
      const setBrightness = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightness"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightness: setBrightness }),
      );
      openModal();

      const input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "60" } });
      fireEvent.click(getApplyButton());

      expect(setBrightness).toHaveBeenCalledWith(60);
    });

    it("rejects an out-of-range percentage without submitting", () => {
      const setBrightness = vi.fn().mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightness: setBrightness }),
      );
      openModal();

      const input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "150" } });

      expect(
        screen.getByText("Heiltala á milli 0 og 100 er leyfileg."),
      ).toBeInTheDocument();
      expect(getApplyButton()).toBeDisabled();
      fireEvent.click(getApplyButton());
      expect(setBrightness).not.toHaveBeenCalled();
    });

    it("rejects a non-integer value without submitting", () => {
      const setBrightness = vi.fn().mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightness: setBrightness }),
      );
      openModal();

      const input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "4.5" } });

      expect(
        screen.getByText("Heiltala á milli 0 og 100 er leyfileg."),
      ).toBeInTheDocument();
      expect(getApplyButton()).toBeDisabled();
      fireEvent.click(getApplyButton());
      expect(setBrightness).not.toHaveBeenCalled();
    });

    it("rejects a negative value without submitting", () => {
      const setBrightness = vi.fn().mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightness: setBrightness }),
      );
      openModal();

      const input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "-5" } });

      expect(
        screen.getByText("Heiltala á milli 0 og 100 er leyfileg."),
      ).toBeInTheDocument();
      expect(getApplyButton()).toBeDisabled();
      fireEvent.click(getApplyButton());
      expect(setBrightness).not.toHaveBeenCalled();
    });

    it("disables the apply button while a write is pending", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 60,
          brightnessStatus: {
            requestedPercent: 60,
            appliedPercent: null,
            phase: "pending",
            error: null,
            updatedAt: Date.now(),
            mode: "manual",
          },
        }),
      );
      openModal();

      expect(
        within(getBrightnessSection()).getByText("Í bið"),
      ).toBeInTheDocument();
      expect(getApplyButton()).toBeDisabled();
    });

    it("renders the applied phase and verified value", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 60,
          brightnessStatus: {
            requestedPercent: 60,
            appliedPercent: 60,
            phase: "applied",
            error: null,
            updatedAt: Date.now(),
            mode: "manual",
          },
        }),
      );
      openModal();

      expect(
        within(getBrightnessSection()).getByText("Vistað"),
      ).toBeInTheDocument();
      expect(
        within(getBrightnessSection()).getByText("Staðfest: 60%"),
      ).toBeInTheDocument();
    });

    it("renders a failed phase with the safe error message", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 60,
          brightnessStatus: {
            requestedPercent: 60,
            appliedPercent: null,
            phase: "failed",
            error: "Vnnox ekki tiltækt",
            updatedAt: Date.now(),
            mode: "manual",
          },
        }),
      );
      openModal();

      expect(
        within(getBrightnessSection()).getByText("Villa"),
      ).toBeInTheDocument();
      expect(
        within(getBrightnessSection()).getByText("Vnnox ekki tiltækt"),
      ).toBeInTheDocument();
    });

    it("shows the Firebase-synchronized requested value", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ brightness: 42 }),
      );
      openModal();

      expect(screen.getByText("Óskað: 42%")).toBeInTheDocument();
      expect(getBrightnessInput().value).toBe("42");
    });

    it("exposes the input as an accessible control named after the section", () => {
      mockedUsePerimeter.mockReturnValue(createMockPerimeterReturn());
      openModal();

      expect(
        screen.getByRole("textbox", { name: "Bjartleiki jaðarskjás" }),
      ).toBeInTheDocument();
    });

    it("shows a blank input rather than 0 when no brightness is set", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ brightness: null }),
      );
      openModal();

      expect(getBrightnessInput().value).toBe("");
    });

    it("treats a cleared input as invalid rather than defaulting to 0", () => {
      const setBrightness = vi.fn().mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 42,
          setPerimeterBrightness: setBrightness,
        }),
      );
      openModal();

      const input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "" } });

      expect(input.value).toBe("");
      expect(getApplyButton()).toBeDisabled();
      fireEvent.click(getApplyButton());
      expect(setBrightness).not.toHaveBeenCalled();
    });

    it("allows re-submission once the brightness subscription confirms the prior submission", () => {
      const setBrightness = vi.fn().mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 40,
          setPerimeterBrightness: setBrightness,
        }),
      );
      const { rerender } = render(<PerimeterControl />);
      fireEvent.click(screen.getByRole("button", { name: "Opna" }));

      let input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "60" } });
      fireEvent.click(getApplyButton());
      expect(setBrightness).toHaveBeenCalledWith(60);
      // Apply is disabled while the submission is settling.
      expect(getApplyButton()).toBeDisabled();

      // The Firebase subscription now reflects the submitted value — the
      // component must clear its pending-submission state and re-enable
      // Vista for a subsequent request.
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 60,
          setPerimeterBrightness: setBrightness,
        }),
      );
      rerender(<PerimeterControl />);

      input = getBrightnessInput();
      fireEvent.change(input, { target: { value: "70" } });
      fireEvent.click(getApplyButton());
      expect(setBrightness).toHaveBeenCalledWith(70);
    });
  });

  describe("BrightnessSection automatic mode", () => {
    const autoConfig = {
      enabled: true,
      min: 3,
      max: 100,
      exponent: 0.35,
      cloudWeight: 1,
      luxMin: 5,
      luxMax: 100000,
      updatedAt: 1723392000000,
    };

    const autoStatus = (overrides: Record<string, unknown> = {}) =>
      ({
        requestedPercent: 48,
        appliedPercent: 48,
        phase: "applied",
        error: null,
        updatedAt: Date.now(),
        mode: "auto",
        predicted: {
          lux: 10930.2,
          sunElevationDeg: 24.6,
          cloudCover: 1,
          weatherAgeMin: 7,
          weatherStale: false,
        },
        ...overrides,
      }) as ReturnType<typeof usePerimeter>["brightnessStatus"];

    const openModal = () => {
      render(<PerimeterControl />);
      fireEvent.click(screen.getByRole("button", { name: "Opna" }));
    };

    const getAutoInputs = () => ({
      min: screen.getByRole("textbox", { name: "Sjálfvirkt lágmark" }),
      max: screen.getByRole("textbox", { name: "Sjálfvirkt hámark" }),
      exponent: screen.getByRole("textbox", { name: "Sjálfvirkt ákeðni" }),
      cloudWeight: screen.getByRole("textbox", {
        name: "Sjálfvirkt skýjaáhrif",
      }),
    });

    beforeEach(() => {
      // The 24 h curve preview fetches Open-Meteo on mount; by default the
      // fetch never resolves so mounting produces no stray state updates.
      // Tests that exercise fetch outcomes override this stub.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockReturnValue(new Promise<never>(() => undefined)),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("switching to Automatic with no prior config writes the defaults enabled", () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightnessAuto: setAuto }),
      );
      openModal();

      fireEvent.click(screen.getByRole("button", { name: "Sjálfvirkt" }));

      expect(setAuto).toHaveBeenCalledWith({
        enabled: true,
        min: 3,
        max: 100,
        exponent: 0.35,
        cloudWeight: 1,
        luxMin: 5,
        luxMax: 100000,
      });
    });

    it("switching to Automatic preserves an existing config's parameters", () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: { ...autoConfig, enabled: false },
          setPerimeterBrightnessAuto: setAuto,
        }),
      );
      openModal();

      fireEvent.click(screen.getByRole("button", { name: "Sjálfvirkt" }));

      expect(setAuto).toHaveBeenCalledWith({
        enabled: true,
        min: 3,
        max: 100,
        exponent: 0.35,
        cloudWeight: 1,
        luxMin: 5,
        luxMax: 100000,
      });
    });

    it("switching back to Manual only writes enabled: false", () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          setPerimeterBrightnessAuto: setAuto,
        }),
      );
      openModal();

      fireEvent.click(screen.getByRole("button", { name: "Handvirkt %" }));

      expect(setAuto).toHaveBeenCalledWith({
        enabled: false,
        min: 3,
        max: 100,
        exponent: 0.35,
        cloudWeight: 1,
        luxMin: 5,
        luxMax: 100000,
      });
      // The manual InputNumber flow stays untouched.
      expect(setAuto).toHaveBeenCalledTimes(1);
    });

    it("mode buttons stay disabled until the subscription reflects the switch", () => {
      mockedUsePerimeter.mockReturnValue(createMockPerimeterReturn());
      const { rerender } = render(<PerimeterControl />);
      fireEvent.click(screen.getByRole("button", { name: "Opna" }));

      fireEvent.click(screen.getByRole("button", { name: "Sjálfvirkt" }));
      expect(screen.getByRole("button", { name: "Sjálfvirkt" })).toBeDisabled();

      // Firebase now reflects the written node — Sjálfvirkt is active and
      // the automatic panel replaces the manual input.
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ brightnessAuto: autoConfig }),
      );
      rerender(<PerimeterControl />);

      expect(
        screen.getByRole("button", { name: "Sjálfvirkt" }),
      ).not.toHaveAttribute("disabled");
      expect(
        screen.getByRole("textbox", { name: "Sjálfvirkt lágmark" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: "Bjartleiki jaðarskjás" }),
      ).toBeNull();
    });

    it("saves slider edits as a single whole-node write", () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          setPerimeterBrightnessAuto: setAuto,
        }),
      );
      openModal();

      const inputs = getAutoInputs();
      fireEvent.change(inputs.min, { target: { value: "5" } });
      fireEvent.change(inputs.max, { target: { value: "95" } });
      fireEvent.change(inputs.exponent, { target: { value: "0.5" } });
      fireEvent.change(inputs.cloudWeight, { target: { value: "0.4" } });

      const saveButton = screen.getByRole("button", { name: "Vista" });
      expect(saveButton).toBeEnabled();
      fireEvent.click(saveButton);

      expect(setAuto).toHaveBeenCalledWith({
        enabled: true,
        min: 5,
        max: 95,
        exponent: 0.5,
        cloudWeight: 0.4,
        luxMin: 5,
        luxMax: 100000,
      });
      expect(setAuto).toHaveBeenCalledTimes(1);
    });

    it("disables Vista while the auto write is settling", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ brightnessAuto: autoConfig }),
      );
      openModal();

      fireEvent.change(
        screen.getByRole("textbox", { name: "Sjálfvirkt lágmark" }),
        { target: { value: "7" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Vista" }));

      expect(screen.getByRole("button", { name: "Vista" })).toBeDisabled();
      expect(
        screen.getByRole("textbox", { name: "Sjálfvirkt lágmark" }),
      ).toBeDisabled();
    });

    it("renders the daemon-predicted live readout", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightness: 48,
          brightnessAuto: autoConfig,
          brightnessStatus: autoStatus(),
        }),
      );
      openModal();

      const live = document.querySelector(".perimeter-brightness-auto-live");
      expect(live).not.toBeNull();
      const liveText = (live as HTMLElement).textContent ?? "";
      expect(liveText).toContain("Ljós:");
      // Locale-formatted thousands separators (10.930 / 10 930) vary.
      expect(liveText).toMatch(/10[.,\u00a0 ]930/);
      expect(liveText).toContain("Mark: 48%");
      expect(liveText).toContain("Veður: 7 mín");
      expect(screen.queryByText("Gömul veðurgögn")).toBeNull();
    });

    it("flags stale weather data with a warning badge", () => {
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          brightnessStatus: autoStatus({
            predicted: {
              lux: 5000,
              sunElevationDeg: 20,
              cloudCover: 0.8,
              weatherAgeMin: 190,
              weatherStale: true,
            },
          }),
        }),
      );
      openModal();

      expect(screen.getByText("Gömul veðurgögn")).toBeInTheDocument();
      const live = document.querySelector(".perimeter-brightness-auto-live");
      expect((live as HTMLElement).textContent).toContain("Veður: 190 mín");
    });

    it("renders the 24 h target-curve preview with the forecast label", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              hourly: {
                time: [
                  "2026-09-22T00:00",
                  "2026-09-22T12:00",
                  "2026-09-23T00:00",
                ],
                cloud_cover: [50, 50, 50],
              },
            }),
        }),
      );
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          brightnessStatus: autoStatus(),
        }),
      );
      openModal();

      expect(screen.getByText("Spá frá Open-Meteo.com")).toBeInTheDocument();
      expect(
        document.querySelector(".perimeter-brightness-curve-svg"),
      ).not.toBeNull();
      // With a good forecast response the clear-sky fallback note stays hidden.
      await waitFor(() => {
        expect(screen.queryByText(/Ekki tókst að sækja skýjaspá/)).toBeNull();
      });
    });

    it("falls back to a clear-sky curve note when the forecast fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
      );
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          brightnessStatus: autoStatus(),
        }),
      );
      openModal();

      expect(
        await screen.findByText(
          "Ekki tókst að sækja skýjaspá — ferillinn sýnir klára himinn.",
        ),
      ).toBeInTheDocument();
    });

    it("drops a forecast that resolves after the panel unmounts", async () => {
      let resolveFetch: (value: unknown) => void = () => undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ brightnessAuto: autoConfig }),
      );
      const { unmount } = render(<PerimeterControl />);
      fireEvent.click(screen.getByRole("button", { name: "Opna" }));

      unmount();
      // The in-flight fetch resolves after unmount; the panel must drop it
      // without touching state.
      resolveFetch({ ok: false, json: () => Promise.resolve({}) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("polls the forecast every 15 minutes while the panel is open", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi
          .fn()
          .mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
        vi.stubGlobal("fetch", fetchMock);
        mockedUsePerimeter.mockReturnValue(
          createMockPerimeterReturn({ brightnessAuto: autoConfig }),
        );
        render(<PerimeterControl />);
        fireEvent.click(screen.getByRole("button", { name: "Opna" }));
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("treats a cleared auto parameter as invalid and blocks Vista", () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockResolvedValue(undefined);
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          setPerimeterBrightnessAuto: setAuto,
        }),
      );
      openModal();

      const inputs = getAutoInputs();
      fireEvent.change(inputs.min, { target: { value: "" } });

      expect(
        screen.getByText("Allir reitir verða að vera með gildi."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Vista" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Vista" }));
      expect(setAuto).not.toHaveBeenCalled();

      // Entering a value again restores a valid draft and a live button.
      fireEvent.change(inputs.min, { target: { value: "5" } });
      expect(
        screen.queryByText("Allir reitir verða að vera með gildi."),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Vista" })).toBeEnabled();
    });

    it("restores the mode buttons and shows an error when the switch write fails", async () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockRejectedValue(new Error("offline"));
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({ setPerimeterBrightnessAuto: setAuto }),
      );
      openModal();

      fireEvent.click(screen.getByRole("button", { name: "Sjálfvirkt" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "Ekki tókst að breyta stjórnun bjartleika. Reyndu aftur.",
          ),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "Sjálfvirkt" })).toBeEnabled();
    });

    it("shows an error and re-enables Vista when the auto save write fails", async () => {
      const setAuto = vi
        .fn<ReturnType<typeof usePerimeter>["setPerimeterBrightnessAuto"]>()
        .mockRejectedValue(new Error("denied"));
      mockedUsePerimeter.mockReturnValue(
        createMockPerimeterReturn({
          brightnessAuto: autoConfig,
          setPerimeterBrightnessAuto: setAuto,
        }),
      );
      openModal();

      fireEvent.change(
        screen.getByRole("textbox", { name: "Sjálfvirkt lágmark" }),
        { target: { value: "7" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Vista" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "Ekki tókst að vista sjálfvirka stillingu. Reyndu aftur.",
          ),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "Vista" })).toBeEnabled();
    });
  });
});
