import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  onValue,
  ref,
  set,
  update,
  type DataSnapshot,
} from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocationsManager } from "../admin/LocationsManager";
import apiConfig from "../apiConfig";
import TodaysMatches from "../controller/asset/team/TodaysMatches";
import { minimalPerimeterDisplay } from "../lib/venue.fixtures";
import { FirebaseStateProvider, useListeners } from "./FirebaseStateContext";

vi.mock("../firebase", () => ({
  database: {},
  functions: {},
  FIREBASE_STORAGE_BUCKET: "venue-test.appspot.com",
}));

vi.mock("../firebaseDatabase", () => ({
  firebaseDatabase: {
    writeAudited: vi.fn().mockResolvedValue(undefined),
    writeAuditOnly: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 0),
}));

vi.mock("./LocalStateContext", () => ({
  useRemoteSettings: () => ({ listenPrefix: "test-venue" }),
}));

type RecordData = Record<string, unknown>;
type Subscription = (snapshot: DataSnapshot) => unknown;

const subscriptions = new Map<string, Set<Subscription>>();
const fetchMock = vi.fn<typeof fetch>();
let locations: RecordData;

const snapshot = (value: unknown): DataSnapshot =>
  ({ val: () => value }) as DataSnapshot;

function record(value: unknown): RecordData {
  if (value === null || typeof value !== "object") {
    throw new Error("Expected a metadata object");
  }
  return value as RecordData;
}

function emitLocations(value: unknown = locations): void {
  subscriptions
    .get("locations")
    ?.forEach((callback) => callback(snapshot(value)));
}

// Apply Firebase's path-update semantics only in memory. Both the admin and
// runtime use their real parsers, subscriptions, and components in this test.
function applyUpdates(target: RecordData, changes: RecordData): void {
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split("/");
    const leaf = parts.pop();
    if (!leaf) throw new Error("Expected an update path");
    let node = target;
    for (const part of parts) {
      node[part] ??= {};
      node = record(node[part]);
    }
    if (value === null) delete node[leaf];
    else node[leaf] = structuredClone(value);
  }
}

const storedVenue = (): RecordData => record(locations["test-venue"]);

function RuntimeMetadata() {
  const listeners = useListeners();
  return (
    <output aria-label="Runtime venues">{JSON.stringify(listeners)}</output>
  );
}

function renderVenue({ admin = false, metadata = false } = {}) {
  return render(
    <FirebaseStateProvider
      listenPrefix="test-venue"
      isAuthenticated
      screenKey={null}
    >
      {admin && <LocationsManager />}
      {metadata && <RuntimeMetadata />}
      <TodaysMatches />
    </FirebaseStateProvider>,
  );
}

async function fetchTodaysMatches(): Promise<Request> {
  const count = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Sækja leiki í dag" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(count + 1));
  const request = fetchMock.mock.calls[count]?.[0];
  if (!(request instanceof Request))
    throw new Error("Expected a generated SDK Request");
  return request;
}

function expectTeamRequest(
  request: Request,
  teamId: number,
  suffix: string,
): void {
  const url = new URL(request.url);
  expect(url.origin).toBe(new URL(apiConfig.gateWayUrl).origin);
  expect(url.pathname).toBe(`/v3/${teamId}/matches/${suffix}`);
  expect(request.method).toBe("GET");
}

const apiMatch = {
  id: 501,
  dateTimeUTC: "2026-11-02T19:00:00Z",
  competition: { id: 1, name: "Test competition" },
  homeTeam: { id: 2058, name: "Valur" },
  awayTeam: { id: 2492, name: "Víkingur R" },
};

beforeEach(() => {
  vi.clearAllMocks();
  subscriptions.clear();
  locations = {
    "test-venue": {
      label: "Test venue",
      config: {
        homeTeam: 2492,
        weatherStation: "reykjavik",
        future: { enabled: true },
      },
      pitchIds: [102, "103"],
      futureVenue: { keep: [1, 2] },
    },
  };
  fetchMock
    .mockReset()
    .mockImplementation(() => Promise.resolve(Response.json([])));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(ref).mockImplementation((_, path) => path as never);
  vi.mocked(onValue).mockImplementation((reference, callback) => {
    const path = String(reference);
    const callbacks = subscriptions.get(path) ?? new Set<Subscription>();
    callbacks.add(callback);
    subscriptions.set(path, callbacks);
    callback(
      snapshot(
        path === "locations"
          ? locations
          : path === ".info/connected"
            ? true
            : null,
      ),
    );
    return () => {
      callbacks.delete(callback);
    };
  });
  vi.mocked(update).mockImplementation((reference, changes) => {
    const path = String(reference);
    expect(path).toBe("locations/test-venue");
    applyUpdates(storedVenue(), record(changes));
    emitLocations();
    return Promise.resolve();
  });
  // Retain set semantics so the saved-ID regression also runs against the old
  // admin implementation and fails at the actual outgoing request URL.
  vi.mocked(set).mockImplementation((reference, value: unknown) => {
    expect(String(reference)).toBe("locations/test-venue");
    locations["test-venue"] = structuredClone(value);
    emitLocations();
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("coordinator regression: preserves an edit when unrelated venue metadata changes", () => {
  renderVenue({ admin: true });
  fireEvent.click(screen.getByText("Test venue"));
  fireEvent.change(screen.getByDisplayValue("2492"), {
    target: { value: "2058" },
  });
  expect(screen.getByDisplayValue("2058")).toBeInTheDocument();
  act(() => {
    locations = {
      ...locations,
      "test-venue": {
        ...storedVenue(),
        futureVenue: { keep: [1, 2, 3] },
      },
    };
    emitLocations();
  });
  expect(screen.getByDisplayValue("2058")).toBeInTheDocument();
  expect(record(storedVenue().config).homeTeam).toBe(2492);
  expect(
    screen.getByRole("button", { name: "Vista breytingar" }),
  ).toBeInTheDocument();
});

describe("admin drafts across venue snapshots", () => {
  it.each(["array", "map"])(
    "saves edits without reverting changed, added or removed metadata in a screen %s",
    async (shape) => {
      const childKey = shape === "array" ? "0" : "main-screen";
      const mainScreen = {
        key: "main",
        name: "Main",
        futureScreen: { revision: 1 },
        removedScreen: true,
        style: {
          width: 512,
          height: 400,
          calibration: { revision: 1 },
          removedStyle: true,
        },
      };
      storedVenue().screens =
        shape === "array" ? [mainScreen] : { [childKey]: mainScreen };
      record(storedVenue().config).removedConfig = true;
      renderVenue({ admin: true, metadata: true });
      fireEvent.click(screen.getByText("Test venue"));
      fireEvent.change(screen.getByLabelText("Heimalið (ID)"), {
        target: { value: "2058" },
      });
      fireEvent.change(screen.getByPlaceholderText("Nafn"), {
        target: { value: "Edited main" },
      });
      fireEvent.change(screen.getByDisplayValue("512"), {
        target: { value: "640" },
      });

      const latest = structuredClone(storedVenue());
      latest.futureVenue = { keep: [1, 2, 3] };
      const config = record(latest.config);
      config.weatherStation = "akureyri";
      config.future = { enabled: false };
      config.addedConfig = true;
      delete config.removedConfig;
      const latestScreen = record(record(latest.screens)[childKey]);
      latestScreen.futureScreen = { revision: 2 };
      latestScreen.addedScreen = true;
      delete latestScreen.removedScreen;
      const style = record(latestScreen.style);
      style.calibration = { revision: 2 };
      style.addedStyle = true;
      delete style.removedStyle;
      act(() => {
        locations = { ...locations, "test-venue": latest };
        emitLocations();
      });

      expect(screen.getByDisplayValue("2058")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Edited main")).toBeInTheDocument();
      expect(screen.getByDisplayValue("640")).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
      const expectedChanges = {
        "config/homeTeam": 2058,
        [`screens/${childKey}/name`]: "Edited main",
        [`screens/${childKey}/style/width`]: 640,
      };
      const expected = structuredClone(latest);
      applyUpdates(expected, expectedChanges);
      fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));

      await waitFor(() =>
        expect(update).toHaveBeenCalledExactlyOnceWith(
          "locations/test-venue",
          expectedChanges,
        ),
      );
      expect(storedVenue()).toEqual(expected);
      expectTeamRequest(
        await fetchTodaysMatches(),
        2058,
        new Date().toISOString().slice(0, 10),
      );
      expect(set).not.toHaveBeenCalled();
    },
  );

  it("does not restore removed style metadata when edited default dimensions need materializing", async () => {
    storedVenue().screens = {
      main: {
        key: "main",
        name: "Main",
        style: { width: 512, height: 400, calibration: "old" },
      },
    };
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByDisplayValue("512"), {
      target: { value: "640" },
    });
    const latest = structuredClone(storedVenue());
    delete record(record(latest.screens).main).style;
    act(() => {
      locations = { ...locations, "test-venue": latest };
      emitLocations();
    });
    expect(screen.getByDisplayValue("640")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith("locations/test-venue", {
        "screens/main/style": { width: 640, height: 400 },
      }),
    );
    expect(record(record(storedVenue().screens).main).style).toEqual({
      width: 640,
      height: 400,
    });
  });

  it.each([
    { path: "label", value: "Updated venue" },
    { path: "config/homeTeam", value: 2500 },
    { path: "pitchIds", value: [104, 105] },
    { path: "screens/0/name", value: "Updated main" },
    { path: "screens/0/key", value: "new-main" },
    { path: "screens/0/fontSize", value: "120%" },
    { path: "screens/0/style/width", value: 640 },
    { path: "screens/0/style/height", value: 480 },
    { path: "perimeterDisplay/playback/cueDurationMs", value: 30_000 },
  ])("refreshes drafts when the known $path changes", ({ path, value }) => {
    storedVenue().screens = [
      { key: "main", name: "Main", style: { width: 512, height: 400 } },
    ];
    storedVenue().perimeterDisplay = minimalPerimeterDisplay;
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heimalið (ID)"), {
      target: { value: "2058" },
    });
    const latest = structuredClone(storedVenue());
    applyUpdates(latest, { [path]: value });
    act(() => {
      locations = { ...locations, "test-venue": latest };
      emitLocations();
    });

    expect(screen.queryByDisplayValue("2058")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vista breytingar" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText(path === "label" ? "Updated venue" : "Test venue"),
    );
    const displayedValue =
      path === "perimeterDisplay/playback/cueDurationMs"
        ? "30"
        : Array.isArray(value)
          ? value.join(", ")
          : String(value);
    expect(screen.getByDisplayValue(displayedValue)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("does not carry a draft to a different venue with identical fields", () => {
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heimalið (ID)"), {
      target: { value: "2058" },
    });
    act(() => {
      locations = { "other-venue": structuredClone(storedVenue()) };
      emitLocations();
    });
    expect(screen.getByText("other-venue")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("2058")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Test venue"));
    expect(screen.getByDisplayValue("2492")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vista breytingar" }),
    ).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("saved venue configuration to generated API requests", () => {
  it.each([false, true])(
    "sends the non-default saved home team unchanged (scoreboard screen: %s)",
    async (hasScreen) => {
      if (hasScreen) {
        storedVenue().screens = [
          { key: "main", name: "Main", style: { width: 512, height: 400 } },
        ];
      }
      const original = structuredClone(storedVenue());
      renderVenue({ admin: true });
      fireEvent.click(screen.getByText("Test venue"));
      fireEvent.change(screen.getByDisplayValue("2492"), {
        target: { value: "2058" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));

      await waitFor(() =>
        expect(record(storedVenue().config).homeTeam).toBe(2058),
      );
      fetchMock.mockResolvedValueOnce(Response.json([apiMatch]));
      const request = await fetchTodaysMatches();
      expectTeamRequest(request, 2058, new Date().toISOString().slice(0, 10));
      expect(new URL(request.url).searchParams.get("utcOffset")).toBe("0");
      expect(storedVenue()).toEqual({
        ...original,
        config: { ...record(original.config), homeTeam: 2058 },
      });
      expect(update).toHaveBeenCalledExactlyOnceWith("locations/test-venue", {
        "config/homeTeam": 2058,
      });
      expect(set).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(Response.json({ home: {}, away: {} }));
      fireEvent.click(
        await screen.findByRole("button", { name: /Valur - Víkingur R/ }),
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const lineupRequest = fetchMock.mock.calls[1]?.[0];
      if (!(lineupRequest instanceof Request))
        throw new Error("Expected lineup Request");
      expectTeamRequest(lineupRequest, 2058, "501/lineups");
    },
  );

  it("uses a legacy string ID for match-report info and lineups without any screens", async () => {
    storedVenue().config = { homeTeam: "2058" };
    storedVenue().perimeterDisplay = minimalPerimeterDisplay;
    vi.spyOn(window, "prompt").mockReturnValue("501");
    fetchMock.mockResolvedValueOnce(Response.json(apiMatch));
    fetchMock.mockResolvedValueOnce(Response.json({ home: {}, away: {} }));
    renderVenue({ metadata: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Slá inn ID leikskýrslu" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requests = fetchMock.mock.calls.map(([request]) => {
      if (!(request instanceof Request))
        throw new Error("Expected SDK Request");
      return request;
    });
    expectTeamRequest(requests[0]!, 2058, "501/info");
    expectTeamRequest(requests[1]!, 2058, "501/lineups");
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"screens":[]',
    );
    expect(
      subscriptions.get("perimeter/test-venue/overlayGeometry")?.size ?? 0,
    ).toBe(0);
    expect(
      subscriptions.get("perimeter/test-venue/goalScorerPreparation")?.size ??
        0,
    ).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, -1, 1.5, "invalid", "9007199254740993", false])(
    "sends fallback 2492 for missing/invalid saved ID %s",
    async (homeTeam) => {
      storedVenue().config = { homeTeam };
      renderVenue();
      const request = await fetchTodaysMatches();
      expectTeamRequest(request, 2492, new Date().toISOString().slice(0, 10));
      expect(update).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    },
  );

  it("uses live subscription changes and clears removed venue config", async () => {
    renderVenue({ metadata: true });
    act(() => {
      storedVenue().config = { homeTeam: 2058 };
      emitLocations();
    });
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"homeTeam":2058',
    );
    expectTeamRequest(
      await fetchTodaysMatches(),
      2058,
      new Date().toISOString().slice(0, 10),
    );

    act(() => emitLocations(null));
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"venues":{}',
    );
    expectTeamRequest(
      await fetchTodaysMatches(),
      2492,
      new Date().toISOString().slice(0, 10),
    );
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("admin metadata roundtrip", () => {
  it("does not let new-location creation overwrite an existing venue", () => {
    const original = structuredClone(locations);
    renderVenue({ admin: true });
    fireEvent.click(screen.getByRole("button", { name: "Ný staðsetning" }));
    const modal = within(screen.getByRole("dialog"));
    fireEvent.change(modal.getByPlaceholderText("t.d. Víkin úti"), {
      target: { value: "Test venue" },
    });
    fireEvent.change(modal.getByPlaceholderText("vikuti"), {
      target: { value: "test-venue" },
    });
    fireEvent.change(modal.getByPlaceholderText("outside"), {
      target: { value: "main" },
    });
    const create = modal.getByRole("button", { name: "Búa til" });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(locations).toEqual(original);
  });

  it("patches edited fields while preserving unknown config, screen, style and mapping metadata", async () => {
    storedVenue().name = "Legacy name";
    storedVenue().screens = {
      "3": {
        key: "main",
        name: "Main",
        style: { width: "512", height: 400, calibration: 7 },
        futureScreen: true,
      },
    };
    const { compatibilityKeys, ...mapping } = minimalPerimeterDisplay;
    storedVenue().perimeterDisplay = {
      ...mapping,
      compatibility: { ...compatibilityKeys, futureKeys: { key: "value" } },
      framebuffer: { ...mapping.framebuffer, calibration: "keep" },
      futureMapping: { keep: true },
    };
    const original = structuredClone(storedVenue());
    renderVenue({ admin: true, metadata: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heiti"), {
      target: { value: "Updated venue" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nafn"), {
      target: { value: "Updated screen" },
    });
    fireEvent.change(screen.getByLabelText("Völlur (pitchIds)"), {
      target: { value: "104, 105" },
    });
    // Simulate metadata arriving at the database before this editor's next
    // subscription delivery. Leaf updates must preserve that field too.
    record(storedVenue().config).addedByAnotherAdmin = true;
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith("locations/test-venue", {
        label: "Updated venue",
        "screens/3/name": "Updated screen",
        pitchIds: [104, 105],
      }),
    );
    expect(storedVenue()).toEqual({
      ...original,
      label: "Updated venue",
      pitchIds: [104, 105],
      config: { ...record(original.config), addedByAnotherAdmin: true },
      screens: {
        "3": {
          ...record(record(original.screens)["3"]),
          name: "Updated screen",
        },
      },
    });
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"pitchIds":[104,105]',
    );
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"renderer":"web"',
    );
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"compatibilityKeys":{"base":{"1":"strip"},"overlay":{"2":"strip"}}',
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps mapping drafts and publishes without reverting incoming unknown mapping metadata", async () => {
    storedVenue().perimeterDisplay = {
      ...minimalPerimeterDisplay,
      futureMapping: true,
      playback: { ...minimalPerimeterDisplay.playback, futurePlayback: true },
      regions: [{ ...minimalPerimeterDisplay.regions[0], futureRegion: true }],
    };
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("cue duration seconds"), {
      target: { value: "30" },
    });
    const latest = structuredClone(storedVenue());
    const mapping = record(latest.perimeterDisplay);
    mapping.futureMapping = { revision: 2 };
    record(mapping.playback).futurePlayback = "new metadata";
    record(record(mapping.regions)["0"]).futureRegion = { revision: 2 };
    act(() => {
      locations = { ...locations, "test-venue": latest };
      emitLocations();
    });
    expect(screen.getByLabelText("cue duration seconds")).toHaveValue("30");
    expect(update).not.toHaveBeenCalled();
    const original = structuredClone(storedVenue());
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const changes: unknown = vi.mocked(update).mock.calls[0]?.[1];
    expect(changes).toEqual({
      "perimeterDisplay/revision": expect.any(String) as unknown,
      "perimeterDisplay/playback/cueDurationMs": 30_000,
    });
    const expected = structuredClone(original);
    applyUpdates(expected, record(changes));
    expect(storedVenue()).toEqual(expected);
    expect(set).not.toHaveBeenCalled();
  });

  it("clears only homeTeam and leaves other config fields intact", async () => {
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heimalið (ID)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith("locations/test-venue", {
        "config/homeTeam": null,
      }),
    );
    expect(storedVenue().config).toEqual({
      weatherStation: "reykjavik",
      future: { enabled: true },
    });
    expectTeamRequest(
      await fetchTodaysMatches(),
      2492,
      new Date().toISOString().slice(0, 10),
    );
  });

  it("edits legacy region aliases and defaulted playback without losing compatibility metadata", async () => {
    const region = minimalPerimeterDisplay.regions[0]!;
    const { compatibilityKeys, playback, ...mapping } = minimalPerimeterDisplay;
    storedVenue().perimeterDisplay = {
      ...mapping,
      framebuffer: { ...mapping.framebuffer, width: 3 },
      compatibility: { ...compatibilityKeys, futureKeys: true },
      regions: [
        {
          id: region.id,
          screenId: region.logicalScreenId,
          sourceRegion: region.source,
          destinationRegion: region.destination,
          transform: { horizontalFlip: false, futureTransform: true },
          futureRegion: true,
        },
      ],
    };
    const original = structuredClone(storedVenue());
    renderVenue({ admin: true, metadata: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("destination x"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("cue duration seconds"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const changes: unknown = vi.mocked(update).mock.calls[0]?.[1];
    expect(changes).toEqual({
      "perimeterDisplay/revision": expect.any(String) as unknown,
      "perimeterDisplay/regions/0/destinationRegion/x": 1,
      "perimeterDisplay/playback": { ...playback, cueDurationMs: 30_000 },
    });
    const expected = structuredClone(original);
    applyUpdates(expected, record(changes));
    expect(storedVenue()).toEqual(expected);
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"destination":{"x":1,"y":0,"width":2,"height":1}',
    );
    expect(screen.getByLabelText("Runtime venues")).toHaveTextContent(
      '"compatibilityKeys":{"base":{"1":"strip"},"overlay":{"2":"strip"}}',
    );
  });

  it("keeps malformed/unrecognized persisted metadata on an unrelated edit", async () => {
    storedVenue().config = { homeTeam: "bad-id", other: { keep: true } };
    storedVenue().perimeterDisplay = {
      version: 2,
      renderer: "future",
      keep: true,
    };
    storedVenue().pitchIds = ["102", "legacy-invalid-id"];
    storedVenue().screens = [null, { key: "main", style: { width: "legacy" } }];
    const original = structuredClone(storedVenue());
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heiti"), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith("locations/test-venue", {
        label: "Renamed",
      }),
    );
    expect(storedVenue()).toEqual({ ...original, label: "Renamed" });
  });

  it("keeps failed saves editable and retries without losing metadata", async () => {
    vi.mocked(update).mockRejectedValueOnce(new Error("Permission denied"));
    renderVenue({ admin: true });
    fireEvent.click(screen.getByText("Test venue"));
    fireEvent.change(screen.getByLabelText("Heimalið (ID)"), {
      target: { value: "2058" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permission denied",
    );
    expect(record(storedVenue().config).homeTeam).toBe(2492);
    fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));
    await waitFor(() =>
      expect(record(storedVenue().config).homeTeam).toBe(2058),
    );
    expect(record(storedVenue().config).weatherStation).toBe("reykjavik");
  });

  it.each(["homeTeam", "pitchIds"])(
    "blocks malformed %s input locally",
    (field) => {
      renderVenue({ admin: true });
      fireEvent.click(screen.getByText("Test venue"));
      fireEvent.change(
        screen.getByLabelText(
          field === "homeTeam" ? "Heimalið (ID)" : "Völlur (pitchIds)",
        ),
        {
          target: { value: field === "homeTeam" ? "1.5" : "102, 103oops" },
        },
      );
      fireEvent.click(screen.getByRole("button", { name: "Vista breytingar" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Auðkenni þurfa að vera jákvæðar heiltölur.",
      );
      expect(update).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    },
  );
});
