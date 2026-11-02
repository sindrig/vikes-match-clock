import { useEffect } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  onValue,
  ref,
  set,
  update,
  type DataSnapshot,
} from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GoalScorerDialog from "../controller/GoalScorerDialog";
import PerimeterControl from "../controller/PerimeterControl";
import { storageHelpers } from "../firebase";
import { minimalPerimeterDisplay } from "../lib/venue.fixtures";
import {
  FirebaseStateProvider,
  useFirebaseState,
} from "./FirebaseStateContext";

vi.mock("../firebase", () => ({
  database: {},
  functions: {},
  FIREBASE_STORAGE_BUCKET: "web-test.appspot.com",
  storageHelpers: { getDownloadURL: vi.fn(), listAll: vi.fn() },
}));
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  off: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 1000),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("./LocalStateContext", () => ({
  useLocalState: () => ({ listenPrefix: "venue", auth: { isEmpty: false } }),
  useRemoteSettings: () => ({ listenPrefix: "venue" }),
}));

type RecordData = Record<string, unknown>;
type Subscription = (snapshot: DataSnapshot) => unknown;
const subscriptions = new Map<string, Set<Subscription>>();
let data: RecordData;
let locationsLoaded: boolean;
let currentApi: ReturnType<typeof useFirebaseState> | null;

const mapping = {
  ...minimalPerimeterDisplay,
  compatibilityKeys: {
    base: { "lane-a": "strip" },
    overlay: { "2": "strip", "4": "strip" },
  },
};
const players = [
  { id: 10, name: "Jón", number: 7, show: true },
  { id: 11, name: "Anna", number: 8, show: true },
];
const files = {
  "2": {
    name: "goal-48.mp4",
    source: "gs://web-test.appspot.com/venue/perimeter/goal-48.mp4",
  },
  "4": {
    name: "goal-40.mp4",
    source: "gs://web-test.appspot.com/venue/perimeter/goal-40.mp4",
  },
};
const legacyOverlay = {
  version: 1,
  id: "existing-files",
  columns: [{ durationMs: 10000, files }],
};

function record(value: unknown): RecordData {
  if (value === null || typeof value !== "object")
    throw new Error("Expected object");
  return value as RecordData;
}
function read(path: string): unknown {
  if (path === ".info/connected") return true;
  if (path === ".info/serverTimeOffset") return 0;
  return (
    path
      .split("/")
      .filter(Boolean)
      .reduce<unknown>(
        (node, key) =>
          node && typeof node === "object" ? record(node)[key] : null,
        data,
      ) ?? null
  );
}
function write(path: string, value: unknown): void {
  const parts = path.split("/").filter(Boolean);
  const leaf = parts.pop();
  if (!leaf) throw new Error("Expected leaf path");
  let node = data;
  for (const part of parts) {
    node[part] ??= {};
    node = record(node[part]);
  }
  if (value === null) delete node[leaf];
  else node[leaf] = structuredClone(value);
}
function emit(): void {
  for (const [path, callbacks] of subscriptions) {
    if (path !== "locations" || locationsLoaded) {
      callbacks.forEach((callback) =>
        callback({ val: () => structuredClone(read(path)) } as DataSnapshot),
      );
    }
  }
}
function api(): ReturnType<typeof useFirebaseState> {
  if (!currentApi) throw new Error("Provider has not mounted");
  return currentApi;
}
function Capture() {
  const value = useFirebaseState();
  useEffect(() => {
    currentApi = value;
  }, [value]);
  return null;
}
function mount({ authenticated = true, controls = false } = {}) {
  return render(
    <FirebaseStateProvider
      listenPrefix="venue"
      isAuthenticated={authenticated}
      uid="operator"
      screenKey={null}
    >
      <Capture />
      {controls && (
        <>
          <PerimeterControl standalone />
          <GoalScorerDialog
            open
            players={players}
            teamName="Víkingur R"
            onClose={() => undefined}
          />
        </>
      )}
    </FirebaseStateProvider>,
  );
}
function expectNoRetiredOperations(): void {
  const reads = vi
    .mocked(onValue)
    .mock.calls.map(([reference]) => String(reference));
  expect(
    reads.filter(
      (path) =>
        path.startsWith("perimeter/") &&
        path !== "perimeter/venue/brightnessStatus",
    ),
  ).toEqual([]);
  expect(reads.some((path) => path.endsWith("/goalScorerPreparation"))).toBe(
    false,
  );
  expect(httpsCallable).not.toHaveBeenCalled();
  const writes = [
    ...vi.mocked(set).mock.calls.map(([reference]) => String(reference)),
    ...vi
      .mocked(update)
      .mock.calls.flatMap(([, changes]) => Object.keys(changes)),
  ];
  expect(
    writes.some((path) =>
      /goalScorerPreparation|overlayGeometry|overlayStatus/.test(path),
    ),
  ).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  subscriptions.clear();
  currentApi = null;
  locationsLoaded = true;
  data = {
    locations: { venue: { label: "Venue", perimeterDisplay: mapping } },
    states: {
      venue: {
        controller: { view: "idle", roster: { home: players, away: [] } },
        perimeter: {
          enabled: true,
          state: "on",
          brightness: 20,
          goalVideo: { files },
          overlay: legacyOverlay,
          goalScorerPreparation: { jobId: "inert-old-request", players },
          adLayout: {
            version: 1,
            revision: "ads",
            columns: [
              {
                id: "ad",
                files: {
                  "lane-a": {
                    name: "ad.png",
                    source: "gs://web-test.appspot.com/venue/perimeter/ad.png",
                  },
                },
              },
            ],
          },
        },
      },
    },
    perimeter: {
      venue: {
        updatedAt: 1,
        columns: [{ name: "Stale preview" }],
        adLayout: {
          lanes: [{ id: "obsolete", name: "Stale lane" }],
          revision: "old",
          phase: "error",
        },
        overlayStatus: { phase: "error", error: "Stale overlay failure" },
        overlayGeometry: { revision: "old" },
        goalScorerPreparation: { phase: "ready" },
        brightnessStatus: {
          requestedPercent: 20,
          appliedPercent: 20,
          phase: "applied",
          error: null,
          updatedAt: 1000,
        },
      },
    },
  };
  vi.mocked(ref).mockImplementation((_, path = "") => path as never);
  vi.mocked(onValue).mockImplementation((reference, callback) => {
    const path = String(reference);
    const callbacks = subscriptions.get(path) ?? new Set<Subscription>();
    callbacks.add(callback);
    subscriptions.set(path, callbacks);
    if (path !== "locations" || locationsLoaded)
      callback({ val: () => structuredClone(read(path)) } as DataSnapshot);
    return () => {
      callbacks.delete(callback);
    };
  });
  vi.mocked(update).mockImplementation((reference, changes) => {
    for (const [path, value] of Object.entries(changes))
      write([String(reference), path].filter(Boolean).join("/"), value);
    emit();
    return Promise.resolve();
  });
  vi.mocked(set).mockImplementation((reference, value: unknown) => {
    write(String(reference), value);
    emit();
    return Promise.resolve();
  });
  vi.mocked(storageHelpers.getDownloadURL).mockImplementation((path) =>
    path.includes("/players/")
      ? Promise.reject(new Error("missing portrait"))
      : Promise.resolve(`https://storage.example/${path}`),
  );
  vi.mocked(storageHelpers.listAll).mockResolvedValue({
    items: [],
    prefixes: [],
  });
});

describe("web-only perimeter integration", () => {
  it.each([true, false])(
    "never starts retired work before metadata, on roster changes or reload (authenticated: %s)",
    (authenticated) => {
      locationsLoaded = false;
      const mounted = mount({ authenticated });
      expect(api().ready).toBe(true);
      expectNoRetiredOperations();
      act(() => {
        locationsLoaded = true;
        emit();
      });
      expect(api().listeners.screens).toEqual([]);
      expect(api().listeners.venues.venue?.perimeterDisplay?.renderer).toBe(
        "web",
      );
      act(() => {
        api().setRoster({
          home: [...players, { id: 12, number: 9, name: "New" }],
          away: [],
        });
      });
      expectNoRetiredOperations();
      mounted.unmount();
      mount({ authenticated });
      expectNoRetiredOperations();
      expect(read("states/venue/perimeter/goalScorerPreparation")).toEqual({
        jobId: "inert-old-request",
        players,
      });
    },
  );

  it("uses published lanes and Storage thumbnails while preserving v1 files and ordered semantic replacement/clear", async () => {
    mount({ controls: true });
    expect(screen.getByText("Strip")).toBeVisible();
    expect(screen.queryByText("Stale lane")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale overlay failure")).not.toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "ad.png" })).toHaveAttribute(
      "src",
      "https://storage.example/venue/perimeter/ad.png",
    );
    expect(api().perimeterOverlay).toEqual(legacyOverlay);
    expect(api().perimeterGoalVideo).toEqual({ files });
    fireEvent.click(screen.getByText("Jón"));
    await waitFor(() =>
      expect(api().perimeterOverlay).toMatchObject({
        version: 2,
        player: { id: "10", name: "Jón", number: "7" },
      }),
    );
    expect(api().controller.currentAsset?.asset).toMatchObject({
      type: "NO_IMAGE_PLAYER",
      name: "Jón",
      isGoalCelebration: true,
    });
    const actions = vi.mocked(update).mock.calls.flatMap(([, changes]) =>
      Object.entries(record(changes))
        .filter(([path]) => path.endsWith("/action"))
        .map(([, action]) => action),
    );
    expect(actions).toEqual([
      "controller.render-asset",
      "perimeter.set-overlay",
    ]);
    const first = api().perimeterOverlay?.id;
    fireEvent.click(screen.getByText("Anna"));
    await waitFor(() =>
      expect(api().perimeterOverlay).toMatchObject({
        version: 2,
        player: { id: "11" },
      }),
    );
    expect(api().perimeterOverlay?.id).not.toBe(first);
    act(() => {
      api().renderAsset(null);
      api().clearPerimeterOverlay();
    });
    expect(api().controller.currentAsset).toBeNull();
    expect(api().perimeterOverlay).toBeNull();
    expectNoRetiredOperations();
  });

  it.each([
    ["missing", null],
    ["invalid", { ...mapping, regions: [] }],
    ["retired renderer", { ...mapping, renderer: "resolume" }],
  ])(
    "keeps main-screen reveals and hardware brightness available with a %s mapping",
    async (_label, config) => {
      write("locations/venue/perimeterDisplay", config);
      mount({ controls: true });
      expect(screen.getByText("Jaðarskjár er ekki stilltur.")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Bæta við dálki" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Staðfest: 20%")).toBeVisible();
      fireEvent.click(screen.getByText("Jón"));
      await waitFor(() =>
        expect(api().controller.currentAsset?.asset.name).toBe("Jón"),
      );
      expect(api().perimeterOverlay).toEqual(legacyOverlay);
      fireEvent.change(screen.getByLabelText("Bjartleiki jaðarskjás"), {
        target: { value: "60" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Vista" }));
      await waitFor(() => expect(api().perimeterBrightness).toBe(60));
      expect(api().perimeterBrightnessStatus?.appliedPercent).toBe(20);
      expectNoRetiredOperations();
    },
  );
});
