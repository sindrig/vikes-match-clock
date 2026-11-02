import { useEffect, type ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type User } from "firebase/auth";
import {
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type DataSnapshot,
} from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_THEME } from "../constants";
import ClubOverrideForm from "../controller/ClubOverrideForm";
import ThemeEditorModal from "../controller/theme/ThemeEditor";
import GoalScorerDialog from "../controller/GoalScorerDialog";
import { getPlayerAssetObject } from "../controller/asset/team/assetHelpers";
import { storageHelpers } from "../firebase";
import { firebaseAuth } from "../firebaseAuth";
import { firebaseDatabase } from "../firebaseDatabase";
import { DEFAULT_BRIGHTNESS_AUTO_CONFIG } from "../lib/autoBrightness";
import { MutationRejectedError } from "../lib/mutationSession";
import { minimalPerimeterDisplay } from "../lib/venue.fixtures";
import type { ClubOverride } from "../types";
import {
  FirebaseStateProvider,
  useFirebaseState,
} from "./FirebaseStateContext";
import { LocalStateProvider, useLocalState } from "./LocalStateContext";

vi.mock("react-drag-drop-files", () => ({
  FileUploader: ({ handleChange }: { handleChange: (file: File) => void }) => (
    <input
      type="file"
      aria-label="Logo"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) handleChange(file);
      }}
    />
  ),
}));

vi.mock("../firebase", () => ({
  database: {},
  FIREBASE_STORAGE_BUCKET: "session-test.appspot.com",
  storageHelpers: {
    uploadBytes: vi.fn(),
    getDownloadURL: vi.fn(),
    deleteObject: vi.fn(),
  },
}));
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ ".sv": "timestamp" })),
}));
vi.mock("../firebaseAuth", () => ({
  firebaseAuth: {
    onAuthStateChanged: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    userToAuthState: (user: User | null) => ({
      isLoaded: true,
      isEmpty: !user,
      uid: user?.uid,
      email: user?.email,
    }),
  },
}));
vi.mock("../controller/asset/team/assetHelpers", () => ({
  getPlayerAssetObject: vi.fn(),
}));

type Data = Record<string, unknown>;
type Api = ReturnType<typeof useFirebaseState>;
type LocalApi = ReturnType<typeof useLocalState>;
type Subscription = (snapshot: DataSnapshot) => unknown;
let data: Data;
let currentApi: Api;
let local: LocalApi;
let authChanged: (user: User | null) => void;
let sdkUser: User | null;
let connected = true;
let deliverWrites = true;
const subscriptions = new Map<string, Set<Subscription>>();
const operator = { uid: "operator", email: "local@example.test" } as User;
const player = { id: 10, name: "Jón", number: 7, show: true };
type PlayerAsset = NonNullable<
  Awaited<ReturnType<typeof getPlayerAssetObject>>
>;
const asset: PlayerAsset = {
  type: "NO_IMAGE_PLAYER",
  key: "scorer",
  name: "Jón",
  overlay: { text: "" },
  teamName: "Víkingur R",
  number: 7,
};
const override: ClubOverride = {
  name: "Draft Club",
  clubId: "-1",
  logoUrl: "https://example.test/logo.svg",
  isOverride: false,
};
const pairId = "11111111-1111-4111-8111-111111111111";
const overlay = {
  version: 2 as const,
  kind: "goal-scorer" as const,
  id: "goal",
  player: { id: "10", name: "Jón", number: "7" },
};

function object(value: unknown): Data {
  if (!value || typeof value !== "object") throw new Error("Expected object");
  return value as Data;
}
function read(path: string): unknown {
  if (path === ".info/connected") return connected;
  if (path === ".info/serverTimeOffset") return 0;
  return (
    path
      .split("/")
      .filter(Boolean)
      .reduce<unknown>(
        (value, key) =>
          value && typeof value === "object" ? object(value)[key] : null,
        data,
      ) ?? null
  );
}
function write(path: string, value: unknown) {
  const keys = path.split("/").filter(Boolean);
  const leaf = keys.pop();
  if (!leaf) throw new Error("Missing leaf");
  let node = data;
  for (const key of keys) {
    node[key] ??= {};
    node = object(node[key]);
  }
  if (value === null) delete node[leaf];
  else node[leaf] = structuredClone(value);
}
function emit(path?: string) {
  for (const [key, callbacks] of subscriptions) {
    if (!path || key === path)
      callbacks.forEach((callback) =>
        callback({ val: () => read(key) } as DataSnapshot),
      );
  }
}
function hidden(value: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function Capture() {
  const api = useFirebaseState();
  const localApi = useLocalState();
  useEffect(() => {
    currentApi = api;
    local = localApi;
  }, [api, localApi]);
  return null;
}
function Bridge({ children }: { children: ReactNode }) {
  const { listenPrefix, auth, mutationSession } = useLocalState();
  return (
    <FirebaseStateProvider
      listenPrefix={listenPrefix}
      isAuthenticated={auth.isLoaded && !auth.isEmpty}
      uid={auth.uid}
      screenKey={null}
      mutationSession={mutationSession}
    >
      <Capture />
      {children}
    </FirebaseStateProvider>
  );
}
function mount(children?: ReactNode) {
  return render(
    <LocalStateProvider>
      <Bridge>{children}</Bridge>
    </LocalStateProvider>,
  );
}
function clearAttempts() {
  vi.mocked(update).mockClear();
  vi.mocked(set).mockClear();
  vi.mocked(runTransaction).mockClear();
  vi.mocked(firebaseDatabase.writeAudited).mockClear();
  vi.mocked(firebaseDatabase.writeAuditOnly).mockClear();
}
function noAttempts() {
  expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
  expect(firebaseDatabase.writeAuditOnly).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(runTransaction).not.toHaveBeenCalled();
}
const boundaries: Array<[string, () => void]> = [
  ["hide", () => hidden(true)],
  ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
  ["offline", () => window.dispatchEvent(new Event("offline"))],
  [
    "Firebase drop",
    () => {
      connected = false;
      emit(".info/connected");
    },
  ],
  [
    "hide -> resume",
    () => {
      hidden(true);
      hidden(false);
    },
  ],
  [
    "offline -> online",
    () => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    },
  ],
  ["venue switch", () => local.setListenPrefix("B")],
  [
    "batched A -> B -> A",
    () => {
      local.setListenPrefix("B");
      local.setListenPrefix("A");
    },
  ],
  [
    "logout + same-user login",
    () => {
      authChanged(null);
      authChanged(operator);
    },
  ],
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(firebaseDatabase, "writeAudited");
  vi.spyOn(firebaseDatabase, "writeAuditOnly");
  sdkUser = operator;
  vi.mocked(firebaseAuth.getCurrentUser).mockImplementation(() => sdkUser);
  connected = true;
  deliverWrites = true;
  subscriptions.clear();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("clock_listenPrefix", "A");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  const venueState = {
    match: {
      homeScore: 2,
      awayScore: 0,
      homeTeam: "Víkingur R",
      started: 0,
      countdown: false,
    },
    controller: {
      view: "idle",
      queues: {
        queue: {
          id: "queue",
          name: "Queue",
          items: [asset],
          autoPlay: true,
          imageSeconds: 3,
          cycle: true,
          order: 0,
        },
      },
      activeQueueId: "queue",
      playing: true,
      roster: { home: [player], away: [] },
      currentAsset: { asset, time: null },
    },
    view: {
      background: "Default",
      themePreset: "Default",
      idleAd: "old.png",
      customPresets: { custom: { name: "Old", theme: {} } },
    },
    clubOverrides: { club: override },
    perimeter: {
      enabled: true,
      state: "on",
      brightness: 20,
      overlay,
      mediaPairs: {
        [pairId]: {
          name: "Pair",
          files: {
            "2": {
              name: "left.png",
              source: `gs://session-test.appspot.com/A/perimeter-overlays/${pairId}/48/left.png`,
            },
            "4": {
              name: "right.png",
              source: `gs://session-test.appspot.com/A/perimeter-overlays/${pairId}/40/right.png`,
            },
          },
        },
      },
    },
  };
  data = {
    locations: {
      A: { label: "A", perimeterDisplay: minimalPerimeterDisplay },
      B: { label: "B" },
    },
    states: {
      A: structuredClone(venueState),
      B: {
        ...structuredClone(venueState),
        match: { ...venueState.match, homeScore: 90 },
      },
    },
  };
  vi.mocked(ref).mockImplementation((_, path = "") => path as never);
  vi.mocked(onValue).mockImplementation((reference, callback) => {
    const path = String(reference);
    const callbacks = subscriptions.get(path) ?? new Set<Subscription>();
    callbacks.add(callback);
    subscriptions.set(path, callbacks);
    callback({ val: () => read(path) } as DataSnapshot);
    return () => {
      callbacks.delete(callback);
    };
  });
  vi.mocked(update).mockImplementation((reference, changes) => {
    for (const [path, value] of Object.entries(changes))
      write([String(reference), path].filter(Boolean).join("/"), value);
    if (deliverWrites) emit();
    return Promise.resolve();
  });
  vi.mocked(runTransaction).mockImplementation((reference, change) => {
    const path = String(reference);
    const next: unknown = change(read(path));
    if (next === undefined)
      return { committed: false, snapshot: { val: () => read(path) } } as never;
    write(path, next);
    emit();
    return { committed: true, snapshot: { val: () => next } } as never;
  });
  vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((callback) => {
    authChanged = (user) => {
      sdkUser = user;
      callback(user);
    };
    callback(operator);
    return () => undefined;
  });
  vi.mocked(firebaseAuth.logout).mockImplementation(() => {
    authChanged(null);
    return Promise.resolve();
  });
  vi.mocked(storageHelpers.getDownloadURL).mockResolvedValue(
    "https://example.test/upload.svg",
  );
  vi.mocked(storageHelpers.uploadBytes).mockResolvedValue({
    metadata: { generation: "1" },
  } as never);
  vi.mocked(storageHelpers.deleteObject).mockResolvedValue(undefined);
  vi.mocked(getPlayerAssetObject).mockResolvedValue(asset);
});
afterEach(() => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

describe("ordinary session command boundary", () => {
  it.each(boundaries)(
    "drops deferred scorer media after %s, with no state or audit attempt",
    async (_label, invalidate) => {
      const media = deferred<PlayerAsset>();
      vi.mocked(getPlayerAssetObject).mockReturnValue(media.promise);
      const close = vi.fn();
      mount(
        <GoalScorerDialog
          open
          players={[player]}
          teamName="Víkingur R"
          onClose={close}
        />,
      );
      expect(currentApi.writeEligible).toBe(true);
      fireEvent.click(screen.getByText("Jón"));
      const before = structuredClone(read("states"));
      clearAttempts();
      act(invalidate);
      await act(async () => {
        media.resolve(asset);
        await media.promise;
      });
      noAttempts();
      expect(read("states")).toEqual(before);
      expect(read("audit")).toBeNull();
      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Ekki tókst að vista",
      );
    },
  );

  it("blocks within the visibility event turn before React can update callbacks", async () => {
    mount();
    const retained = currentApi;
    clearAttempts();
    let attempt: Promise<void> | undefined;
    act(() => {
      hidden(true);
      attempt = retained.setPerimeterAdLayout(null);
      retained.addGoal("home");
    });
    await expect(attempt).rejects.toBeInstanceOf(MutationRejectedError);
    noAttempts();
    expect(read("states/A/match/homeScore")).toBe(2);
  });

  it("blocks synchronous Firebase connectivity loss before effects", async () => {
    mount();
    const retained = currentApi;
    clearAttempts();
    let attempt: Promise<void> | undefined;
    act(() => {
      connected = false;
      emit(".info/connected");
      attempt = retained.setPerimeterBrightness(60);
    });
    await expect(attempt).rejects.toBeInstanceOf(MutationRejectedError);
    noAttempts();
  });

  it("checks the current Auth SDK user before the React auth listener runs", async () => {
    mount();
    const retained = currentApi;
    clearAttempts();
    sdkUser = null;
    await act(async () => {
      await expect(retained.setPerimeterBrightness(60)).rejects.toBeInstanceOf(
        MutationRejectedError,
      );
    });
    noAttempts();
  });

  it("invalidates at logout invocation before the auth promise settles", async () => {
    const signOut = deferred<void>();
    vi.mocked(firebaseAuth.logout).mockReturnValue(signOut.promise);
    mount();
    const retained = currentApi;
    clearAttempts();
    let logout: Promise<void> | undefined;
    act(() => {
      logout = local.logout();
      retained.addGoal("home");
    });
    noAttempts();
    await act(async () => {
      signOut.resolve();
      await logout;
    });
  });

  it("recovers a failed logout through a new scope while old commands stay obsolete", async () => {
    mount();
    const retained = currentApi;
    vi.mocked(firebaseAuth.logout).mockRejectedValueOnce(
      new Error("sign-out failed"),
    );
    await act(async () => {
      await expect(local.logout()).rejects.toThrow("sign-out failed");
    });
    expect(currentApi.writeEligible).toBe(true);
    clearAttempts();
    await act(async () => {
      await expect(retained.renderAsset(null)).rejects.toBeInstanceOf(
        MutationRejectedError,
      );
    });
    noAttempts();
    act(() => currentApi.addGoal("home"));
    expect(read("states/A/match/homeScore")).toBe(3);
  });

  it.each(boundaries)(
    "never mixes current refs with retained callback paths after %s",
    async (_label, invalidate) => {
      mount();
      const retained = currentApi;
      act(invalidate);
      clearAttempts();
      const before = structuredClone(read("states"));
      await act(async () => {
        retained.addGoal("home");
        retained.selectView("match");
        retained.setBackground("old callback");
        await expect(
          retained.setPerimeterBrightness(65),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        await expect(
          retained.commitClubOverride("old", override, "clubOverrides.create"),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        expect(
          await retained.completeCountdownIfCurrent({
            started: 1,
            countdown: true,
            halftimeCountdown: false,
          }),
        ).toBe(false);
      });
      noAttempts();
      expect(read("states")).toEqual(before);
    },
  );

  it("accepts newly rendered commands after ABA, with current identity and only A's subscribed data", async () => {
    mount();
    act(() => {
      local.setListenPrefix("B");
      local.setListenPrefix("A");
    });
    clearAttempts();
    act(() => currentApi.addGoal("home"));
    expect(read("states/A/match/homeScore")).toBe(3);
    expect(read("states/B/match/homeScore")).toBe(90);
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
      "A",
      "match",
      { homeScore: 3 },
      expect.objectContaining({ uid: "operator", action: "match.add-goal" }),
    );
    const events = Object.values(object(read("audit/A"))).map(object);
    expect(events).toHaveLength(1);
    expect(events[0]?.timestamp).toEqual({ ".sv": "timestamp" });
    expect(events[0]?.sessionId).toEqual(expect.any(String));
    await Promise.resolve();
  });

  it("never advances refs or rendered state on an unconfirmed/failed ordinary write", async () => {
    mount();
    deliverWrites = false;
    act(() => currentApi.addGoal("home"));
    expect(currentApi.match.homeScore).toBe(2);
    act(() => currentApi.addGoal("home"));
    expect(firebaseDatabase.writeAudited).toHaveBeenLastCalledWith(
      "A",
      "match",
      { homeScore: 3 },
      expect.anything(),
    );
    vi.mocked(update).mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      await expect(currentApi.renderAsset(null)).rejects.toThrow("denied");
    });
    expect(currentApi.controller.currentAsset?.asset.key).toBe("scorer");
    expect(currentApi.mutationError).toBe("denied");
  });

  it("retains an uploaded club draft and dialog when hide/resume invalidates the pending save", async () => {
    const upload =
      deferred<Awaited<ReturnType<typeof storageHelpers.uploadBytes>>>();
    vi.mocked(storageHelpers.uploadBytes).mockReturnValue(upload.promise);
    const close = vi.fn();
    mount(
      <ClubOverrideForm
        open
        onClose={close}
        editOverride={{ id: "club", override }}
      />,
    );
    const nameInput = await screen.findByPlaceholderText("Nafn liðs...");
    await waitFor(() => expect(nameInput).toHaveValue("Draft Club"));
    fireEvent.change(nameInput, { target: { value: "Unsaved name" } });
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) throw new Error("Missing logo input");
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vista" }));
    await waitFor(() => expect(storageHelpers.uploadBytes).toHaveBeenCalled());
    clearAttempts();
    act(() => {
      hidden(true);
      hidden(false);
    });
    await act(async () => {
      upload.resolve({ metadata: { generation: "1" } } as never);
      await upload.promise;
    });
    noAttempts();
    expect(close).not.toHaveBeenCalled();
    expect(nameInput).toHaveValue("Unsaved name");
    expect(screen.getByRole("alert")).toHaveTextContent("Ekki tókst að vista");
    expect(screen.getByText("logo.svg")).toBeVisible();
  });

  it("keeps a blocked preset rename draft open with a visible error", async () => {
    mount(<ThemeEditorModal open onClose={() => undefined} />);
    fireEvent.click(screen.getByTitle("Endurnefna"));
    const input = document.querySelector<HTMLInputElement>(
      ".theme-rename-input",
    );
    if (!input) throw new Error("Missing rename input");
    fireEvent.change(input, { target: { value: "Unsaved preset name" } });
    clearAttempts();
    act(() => {
      hidden(true);
      fireEvent.blur(input);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ekki tókst að vista",
    );
    expect(input).toHaveValue("Unsaved preset name");
    expect(screen.getByRole("dialog")).toBeVisible();
    noAttempts();
  });

  it("does not accept a queued snapshot from an earlier ABA subscription scope", () => {
    mount();
    const oldCallback = [...(subscriptions.get("states/A/match") ?? [])][0];
    if (!oldCallback) throw new Error("Missing match subscription");
    act(() => {
      local.setListenPrefix("B");
      local.setListenPrefix("A");
      oldCallback({ val: () => ({ homeScore: 999 }) } as DataSnapshot);
    });
    expect(currentApi.match.homeScore).toBe(2);
    clearAttempts();
    act(() => currentApi.addGoal("home"));
    expect(read("states/A/match/homeScore")).toBe(3);
  });

  it("invalidates retained callbacks on provider unmount", async () => {
    const mounted = mount();
    const retained = currentApi;
    mounted.unmount();
    clearAttempts();
    await expect(retained.renderAsset(null)).rejects.toBeInstanceOf(
      MutationRejectedError,
    );
    noAttempts();
  });

  it("surfaces a media lookup rejection without submitting or closing", async () => {
    vi.mocked(getPlayerAssetObject).mockRejectedValueOnce(
      new Error("media failed"),
    );
    const close = vi.fn();
    mount(
      <GoalScorerDialog
        open
        players={[player]}
        teamName="Víkingur R"
        onClose={close}
      />,
    );
    clearAttempts();
    fireEvent.click(screen.getByText("Jón"));
    expect(await screen.findByRole("alert")).toHaveTextContent("media failed");
    noAttempts();
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps conditional generation semantics and audits only a committed transition", async () => {
    write("states/A/match", {
      started: 1,
      countdown: true,
      halftimeCountdown: false,
    });
    mount();
    clearAttempts();
    const observed = { started: 1, countdown: true, halftimeCountdown: false };
    await act(async () => {
      expect(await currentApi.completeCountdownIfCurrent(observed)).toBe(true);
    });
    expect(read("states/A/match/countdown")).toBe(false);
    expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await currentApi.completeCountdownIfCurrent(observed)).toBe(false);
    });
    expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledTimes(1);
  });

  it("aborts a conditional retry invalidated by suspension and emits no audit", async () => {
    write("states/A/match", {
      started: 1,
      countdown: true,
      halftimeCountdown: false,
    });
    mount();
    vi.mocked(runTransaction).mockImplementationOnce(
      async (reference, change) => {
        expect(change(read(String(reference)))).toBeDefined();
        hidden(true);
        hidden(false);
        expect(change(read(String(reference)))).toBeUndefined();
        return Promise.resolve({
          committed: false,
          snapshot: { val: () => read(String(reference)) },
        } as never);
      },
    );
    clearAttempts();
    await act(async () => {
      expect(
        await currentApi.completeCountdownIfCurrent({
          started: 1,
          countdown: true,
          halftimeCountdown: false,
        }),
      ).toBe(false);
    });
    expect(firebaseDatabase.writeAuditOnly).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects invalid brightness/config rather than pretending to save", async () => {
    mount();
    clearAttempts();
    await act(async () => {
      await expect(currentApi.setPerimeterBrightness(101)).rejects.toThrow(
        "bjartleiki",
      );
      await expect(
        currentApi.setPerimeterBrightnessAuto({
          ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
          min: 90,
          max: 10,
        }),
      ).rejects.toThrow();
    });
    noAttempts();
  });
});

// This table is the runtime mutation inventory. Each ordinary action must
// produce exactly one audited root update when accepted, and zero attempts
// through a retained callback. CAS start/pause/lifecycle use their own tests.
const ordinaryCommands: Array<
  [string, string, (api: Api) => void | Promise<void>]
> = [
  ["updateMatch", "match.update", (api) => api.updateMatch({ homeScore: 5 })],
  ["resetMatch", "match.reset", (api) => api.resetMatch()],
  ["addGoal", "match.add-goal", (api) => api.addGoal("home")],
  [
    "addPenalty",
    "match.add-penalty",
    (api) => api.addPenalty("home", "new", 2),
  ],
  [
    "removePenalty",
    "match.remove-penalty",
    (api) => api.removePenalty("penalty"),
  ],
  [
    "addToPenalty",
    "match.add-to-penalty",
    (api) => api.addToPenalty("penalty", 1),
  ],
  [
    "updateHalfLength",
    "match.update-half-length",
    (api) => api.updateHalfLength(45, "40"),
  ],
  [
    "adjustMatchTime",
    "match.correct-time-backward",
    (api) => api.adjustMatchTime(-1000),
  ],
  [
    "setHalfStops",
    "match.set-half-stops",
    (api) => api.setHalfStops([40, 80], "minutes"),
  ],
  ["matchTimeout", "match.timeout", (api) => api.matchTimeout("home")],
  ["removeTimeout", "match.remove-timeout", (api) => api.removeTimeout()],
  ["buzz", "match.buzz", (api) => api.buzz(true)],
  ["countdown", "match.countdown", (api) => api.countdown()],
  [
    "startHalftimeCountdown",
    "match.start-halftime-countdown",
    (api) => api.startHalftimeCountdown(),
  ],
  [
    "stopHalftimeCountdown",
    "match.stop-halftime-countdown",
    (api) => api.stopHalftimeCountdown(),
  ],
  [
    "updateRedCards",
    "match.update-red-cards",
    (api) => api.updateRedCards(1, 0),
  ],
  [
    "updateController",
    "controller.update",
    (api) => api.updateController({ refreshToken: "new" }),
  ],
  ["selectView", "controller.select-view", (api) => api.selectView("match")],
  [
    "selectAssetView",
    "controller.select-asset-view",
    (api) => api.selectAssetView("teams"),
  ],
  [
    "createQueue",
    "controller.create-queue",
    (api) => {
      api.createQueue("New");
    },
  ],
  ["deleteQueue", "controller.delete-queue", (api) => api.deleteQueue("queue")],
  [
    "renameQueue",
    "controller.rename-queue",
    (api) => api.renameQueue("queue", "Renamed"),
  ],
  [
    "reorderQueues",
    "controller.reorder-queues",
    (api) => api.reorderQueues(["queue"]),
  ],
  [
    "addItemsToQueue",
    "controller.add-items-to-queue",
    (api) => api.addItemsToQueue("queue", [{ ...asset, key: "new" }]),
  ],
  [
    "removeItemFromQueue",
    "controller.remove-item-from-queue",
    (api) => api.removeItemFromQueue("queue", "scorer"),
  ],
  [
    "reorderItemsInQueue",
    "controller.reorder-items-in-queue",
    (api) => api.reorderItemsInQueue("queue", [asset]),
  ],
  [
    "updateQueueSettings",
    "controller.update-queue-settings",
    (api) => api.updateQueueSettings("queue", { imageSeconds: 7 }),
  ],
  ["playQueue", "controller.play-queue", (api) => api.playQueue("queue")],
  [
    "activateQueue",
    "controller.activate-queue",
    (api) => api.activateQueue("other"),
  ],
  ["stopPlaying", "controller.stop-playing", (api) => api.stopPlaying()],
  ["showItemNow", "controller.render-asset", (api) => api.showItemNow(asset)],
  ["setPlaying", "controller.set-playing", (api) => api.setPlaying(false)],
  ["renderAsset", "controller.render-asset", (api) => api.renderAsset(null)],
  ["showNextAsset", "controller.show-next-asset", (api) => api.showNextAsset()],
  [
    "removeAssetAfterTimeout",
    "controller.remove-asset-after-timeout",
    (api) => api.removeAssetAfterTimeout(),
  ],
  ["remoteRefresh", "controller.remote-refresh", (api) => api.remoteRefresh()],
  [
    "setRoster",
    "controller.set-roster",
    (api) => api.setRoster({ home: [], away: [] }),
  ],
  [
    "editPlayer",
    "controller.edit-player",
    (api) => api.editPlayer("home", 0, { name: "Updated" }),
  ],
  [
    "deletePlayer",
    "controller.delete-player",
    (api) => api.deletePlayer("home", 0),
  ],
  ["addPlayer", "controller.add-player", (api) => api.addPlayer("home")],
  ["clearRoster", "controller.clear-roster", (api) => api.clearRoster()],
  ["selectTab", "controller.select-tab", (api) => api.selectTab("media")],
  ["updateView", "view.update", (api) => api.updateView({ background: "new" })],
  [
    "setViewPort",
    "view.set-viewport",
    (api) =>
      api.setViewPort({
        key: "new",
        name: "New",
        style: { height: 10, width: 20 },
      }),
  ],
  ["setBackground", "view.set-background", (api) => api.setBackground("new")],
  ["setIdleImage", "view.set-idle-image", (api) => api.setIdleImage("new.png")],
  ["setIdleAd", "view.set-idle-ad", (api) => api.setIdleAd(null)],
  [
    "setBlackoutStart",
    "view.set-blackout-start",
    (api) => api.setBlackoutStart("22:00"),
  ],
  [
    "setBlackoutEnd",
    "view.set-blackout-end",
    (api) => api.setBlackoutEnd("07:00"),
  ],
  [
    "setGoalGifSettings",
    "view.set-goal-gif-settings",
    (api) => api.setGoalGifSettings({ goalGif1: "new.gif" }),
  ],
  [
    "setTheme",
    "view.set-theme",
    (api) => api.setTheme({ ...DEFAULT_THEME, scoreBoxColor: "red" }),
  ],
  [
    "setThemePreset",
    "view.set-theme-preset",
    (api) => api.setThemePreset("Blue Ice"),
  ],
  [
    "saveCustomPreset",
    "view.save-custom-preset",
    (api) =>
      api.saveCustomPreset("new", { name: "New", theme: { ...DEFAULT_THEME } }),
  ],
  [
    "deleteCustomPreset",
    "view.delete-custom-preset",
    (api) => api.deleteCustomPreset("custom"),
  ],
  [
    "saveClubOverride",
    "clubOverrides.save",
    (api) =>
      api.saveClubOverride({
        name: "New",
        clubId: "-1",
        isOverride: false,
        logoFile: new File(["svg"], "logo.svg"),
      }),
  ],
  [
    "commitClubOverride create",
    "clubOverrides.create",
    (api) => api.commitClubOverride("new", override, "clubOverrides.create"),
  ],
  [
    "commitClubOverride update",
    "clubOverrides.update",
    (api) => api.commitClubOverride("club", override, "clubOverrides.update"),
  ],
  [
    "deleteClubOverride",
    "clubOverrides.delete",
    (api) => api.deleteClubOverride("club"),
  ],
  [
    "setPerimeterState",
    "perimeter.set-state",
    (api) => api.setPerimeterState("off"),
  ],
  ["skipPerimeterCue", "perimeter.skip-cue", (api) => api.skipPerimeterCue()],
  [
    "restartPerimeterDisplays",
    "perimeter.restart-displays",
    (api) => api.restartPerimeterDisplays(),
  ],
  [
    "setPerimeterOverlay",
    "perimeter.set-overlay",
    (api) => api.setPerimeterOverlay(overlay),
  ],
  [
    "clearPerimeterOverlay",
    "perimeter.clear-overlay",
    (api) => api.clearPerimeterOverlay(),
  ],
  [
    "setPerimeterAdLayout",
    "perimeter.set-ad-layout",
    (api) =>
      api.setPerimeterAdLayout({ version: 1, revision: "new", columns: [] }),
  ],
  [
    "setPerimeterGoalVideo",
    "perimeter.set-goal-video",
    (api) => api.setPerimeterGoalVideo(null),
  ],
  [
    "setPerimeterScorerCelebration",
    "perimeter.set-scorer-celebration",
    (api) => api.setPerimeterScorerCelebration("wave"),
  ],
  [
    "setPerimeterIdleClock",
    "perimeter.set-idle-clock",
    (api) => api.setPerimeterIdleClock(true),
  ],
  [
    "setPerimeterPlayerDisplayStyle",
    "perimeter.set-player-display-style",
    (api) => api.setPerimeterPlayerDisplayStyle("glow"),
  ],
  [
    "setPerimeterSubstitutionStyle",
    "perimeter.set-substitution-style",
    (api) => api.setPerimeterSubstitutionStyle("relay"),
  ],
  [
    "setPerimeterBrightness",
    "perimeter.set-brightness",
    (api) => api.setPerimeterBrightness(60),
  ],
  [
    "setPerimeterBrightnessAuto",
    "perimeter.set-brightness-auto",
    (api) => api.setPerimeterBrightnessAuto(DEFAULT_BRIGHTNESS_AUTO_CONFIG),
  ],
  [
    "createPerimeterMediaPair",
    "perimeter.create-media-pair",
    (api) => api.createPerimeterMediaPair(pairId, { name: "Pair", files: {} }),
  ],
  [
    "setPerimeterMediaPairMainScreenAsset",
    "perimeter.set-media-pair-main-screen",
    (api) => api.setPerimeterMediaPairMainScreenAsset(pairId, null),
  ],
  [
    "deletePerimeterMediaPair",
    "perimeter.delete-media-pair",
    (api) => api.deletePerimeterMediaPair(pairId),
  ],
];

describe("ordinary mutation inventory", () => {
  it.each(ordinaryCommands)(
    "audits an accepted %s command (%s)",
    async (_name, action, command) => {
      write("states/A/perimeter/enabled", false);
      write("states/A/match/timeElapsed", 45 * 60 * 1000);
      write("states/A/match/halfStops", [45, 90]);
      write("states/A/match/matchStartTime", "23:59");
      write("states/A/match/timeout", 100);
      write("states/A/match/home2min", [
        { key: "penalty", atTimeElapsed: 0, penaltyLength: 2 },
      ]);
      mount();
      clearAttempts();
      await act(async () => {
        await command(currentApi);
      });
      if (_name === "deleteClubOverride")
        expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
          "A/club-logos/club",
        );
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
      expect(firebaseDatabase.writeAuditOnly).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
      const events = Object.values(object(read("audit/A"))).map(object);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe(action);
      expect(events[0]?.uid).toBe("operator");
      expect(events[0]?.timestamp).toEqual({ ".sv": "timestamp" });
      expect(events[0]?.sessionId).toEqual(expect.any(String));
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0];
      expect(events[0]?.changes).toBe(JSON.stringify(call?.[2]));
    },
  );

  it("drops every retained ordinary action after hide/resume with zero write, audit or Storage cleanup attempts", async () => {
    mount();
    const retained = currentApi;
    act(() => {
      hidden(true);
      hidden(false);
    });
    clearAttempts();
    const before = structuredClone(data);
    await act(async () => {
      for (const [, , command] of ordinaryCommands) {
        // Void controls report centrally; save APIs expose the same rejection.
        const result = command(retained);
        if (result)
          await expect(result).rejects.toBeInstanceOf(MutationRejectedError);
      }
    });
    noAttempts();
    expect(data).toEqual(before);
    expect(storageHelpers.uploadBytes).not.toHaveBeenCalled();
    expect(storageHelpers.deleteObject).not.toHaveBeenCalled();
  });
});

it("does not erase an observed Firebase drop on repeated suspension signals", async () => {
  mount();
  const retained = currentApi;
  act(() => {
    hidden(true);
    connected = false;
    emit(".info/connected");
    window.dispatchEvent(new Event("pagehide"));
    hidden(true);
    window.dispatchEvent(new Event("offline"));
    connected = true;
    emit(".info/connected");
    hidden(false);
    window.dispatchEvent(new Event("online"));
  });
  expect(currentApi.writeEligible).toBe(false);
  clearAttempts();
  await act(async () => {
    await expect(retained.renderAsset(null)).rejects.toBeInstanceOf(
      MutationRejectedError,
    );
  });
  noAttempts();
  act(() => emit("states/A/match"));
  expect(currentApi.writeEligible).toBe(true);
});

it("fails a conditional command before submission when audit identity is unavailable", async () => {
  write("states/A/match", {
    started: 1,
    countdown: true,
    halftimeCountdown: false,
  });
  mount();
  clearAttempts();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("session storage unavailable");
  });
  await act(async () => {
    expect(
      await currentApi.completeCountdownIfCurrent({
        started: 1,
        countdown: true,
        halftimeCountdown: false,
      }),
    ).toBe(false);
  });
  noAttempts();
  expect(read("states/A/match/countdown")).toBe(true);
});
