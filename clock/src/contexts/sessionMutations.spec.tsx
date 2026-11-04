import { useEffect, useState, type ReactNode } from "react";
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
import { PlaybackAsset, useDeferredAsset } from "../controller/asset/Asset";
import Team from "../controller/asset/team/Team";
import { useHomeTeamQuickActions } from "../controller/asset/team/useHomeTeamQuickActions";
import { useQueuePickerActions } from "../controller/asset/queue/useQueuePickerActions";
import { storageHelpers } from "../firebase";
import { firebaseAuth } from "../firebaseAuth";
import { firebaseDatabase } from "../firebaseDatabase";
import { DEFAULT_BRIGHTNESS_AUTO_CONFIG } from "../lib/autoBrightness";
import { MutationRejectedError } from "../lib/mutationSession";
import { minimalPerimeterDisplay } from "../lib/venue.fixtures";
import MatchLifecycle from "../match/MatchLifecycle";
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
let pickerApi: ReturnType<typeof useQueuePickerActions>;
let quickApi: ReturnType<typeof useHomeTeamQuickActions>;
let connected = true;
let deliverWrites = true;
const subscriptions = new Map<string, Set<Subscription>>();
const pausedVenues = new Set<string>();
const operator = { uid: "operator", email: "local@example.test" } as User;
const player = { id: 10, name: "Jón", number: 7, show: true };
const benchPlayer = { id: 11, name: "Óli", number: 8, show: false };
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
const substitution = {
  side: "home" as const,
  outgoing: player,
  incoming: benchPlayer,
  asset: { type: "SUB" as const, key: "sub", subIn: asset, subOut: asset },
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
function CaptureQueueCallers() {
  const picker = useQueuePickerActions();
  const quick = useHomeTeamQuickActions();
  useEffect(() => {
    pickerApi = picker;
    quickApi = quick;
  }, [picker, quick]);
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
  pausedVenues.clear();
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
    if (!pausedVenues.has(path.split("/")[1] ?? ""))
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

describe("initial subscription readiness and freshness handshake", () => {
  const required = [
    "match",
    "controller",
    "view",
    "clubOverrides",
    "perimeter",
  ];
  const cases = [false, true].flatMap((startup) =>
    required.map((last) => ({ startup, last })),
  );

  function loading(startup: boolean) {
    const location = startup ? "A" : "B";
    if (startup) pausedVenues.add(location);
    mount();
    const retained = currentApi;
    if (!startup) {
      expect(currentApi.writeEligible).toBe(true);
      pausedVenues.add(location);
      act(() => local.setListenPrefix(location));
    }
    expect(currentApi.ready).toBe(false);
    expect(currentApi.writeEligible).toBe(false);
    clearAttempts();
    return { location, retained };
  }
  function deliver(location: string, leaf: string) {
    act(() => emit(`states/${location}/${leaf}`));
  }
  async function blocked(api = currentApi) {
    await act(async () => {
      await expect(api.setPerimeterBrightness(45)).rejects.toBeInstanceOf(
        MutationRejectedError,
      );
    });
    noAttempts();
  }
  async function saved(location: string, retained: Api) {
    expect(currentApi.ready).toBe(true);
    expect(currentApi.writeFreshness).toBe("ready");
    expect(currentApi.writeEligible).toBe(true);
    await blocked(retained);
    await act(async () => currentApi.setPerimeterBrightness(45));
    expect(read(`states/${location}/perimeter/brightness`)).toBe(45);
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(firebaseDatabase.writeAuditOnly).not.toHaveBeenCalled();
    expect(read(`audit/${location}`)).not.toBeNull();
    clearAttempts();
    act(() => {
      hidden(true);
      hidden(false);
    });
    expect(currentApi.writeEligible).toBe(true);
    await blocked(retained);
  }

  it.each(cases)(
    "recovers after hide/resume during loading (startup=$startup, last=$last)",
    async ({ startup, last }) => {
      const { location, retained } = loading(startup);
      act(() => {
        hidden(true);
        hidden(false);
      });
      for (const leaf of required.filter((leaf) => leaf !== last)) {
        deliver(location, leaf);
        expect(currentApi.ready).toBe(false);
        await blocked();
      }
      deliver(location, last);
      await saved(location, retained);
    },
  );

  it.each(cases)(
    "finishes an undropped resume with only the missing initial snapshot (startup=$startup, last=$last)",
    async ({ startup, last }) => {
      const { location, retained } = loading(startup);
      for (const leaf of required.filter((leaf) => leaf !== last))
        deliver(location, leaf);
      act(() => {
        hidden(true);
        hidden(false);
      });
      await blocked();
      deliver(location, last);
      await saved(location, retained);
    },
  );

  it.each([false, true])(
    "keeps reconnect proof received before the final non-core initial snapshot (startup=%s)",
    async (startup) => {
      const { location, retained } = loading(startup);
      act(() => {
        window.dispatchEvent(new Event("offline"));
        connected = false;
        emit(".info/connected");
        window.dispatchEvent(new Event("online"));
        connected = true;
        emit(".info/connected");
      });
      for (const leaf of required.filter((leaf) => leaf !== "perimeter"))
        deliver(location, leaf);
      expect(currentApi.ready).toBe(false);
      await blocked();
      deliver(location, "perimeter");
      await saved(location, retained);
    },
  );

  it.each([false, true])(
    "requires a connected core delivery when all initial snapshots precede reconnect (startup=%s)",
    async (startup) => {
      const { location, retained } = loading(startup);
      act(() => {
        connected = false;
        emit(".info/connected");
        window.dispatchEvent(new Event("offline"));
      });
      for (const leaf of required) deliver(location, leaf);
      expect(currentApi.ready).toBe(true);
      await blocked();
      act(() => {
        connected = true;
        emit(".info/connected");
        window.dispatchEvent(new Event("online"));
      });
      deliver(location, "perimeter");
      deliver(location, "clubOverrides");
      await blocked();
      deliver(location, "view");
      await saved(location, retained);
    },
  );

  it("records the inherited stall when all startup snapshots arrive disconnected without a pending recovery", async () => {
    connected = false;
    const { location } = loading(true);
    for (const leaf of required) deliver(location, leaf);
    await blocked();
    act(() => {
      connected = true;
      emit(".info/connected");
    });
    await blocked();
    deliver(location, "match");
    // Baseline policy does not schedule recovery for this delivery order.
    // This compatibility repair does not expand its readiness guarantees.
    expect(currentApi.writeFreshness).toBe("loading");
    await blocked();
  });

  it.each(cases)(
    "preserves baseline initial-load progress after a cached reconnect (startup=$startup, last=$last)",
    async ({ startup, last }) => {
      const { location, retained } = loading(startup);
      for (const leaf of required.filter((leaf) => leaf !== last))
        deliver(location, leaf);
      act(() => {
        connected = false;
        emit(".info/connected");
      });
      await blocked();
      act(() => {
        connected = true;
        emit(".info/connected");
      });
      // Connection alone never unlocks. An unchanged cached core need not
      // emit again; initial loading still finishes on the missing delivery.
      await blocked();
      deliver(location, last);
      await saved(location, retained);
    },
  );

  it("does not erase an already-pending loading recovery on another disconnect", async () => {
    const { location, retained } = loading(false);
    for (const leaf of ["match", "controller", "view"]) deliver(location, leaf);
    act(() => {
      window.dispatchEvent(new Event("offline"));
      connected = false;
      emit(".info/connected");
      connected = true;
      emit(".info/connected");
    });
    deliver(location, "clubOverrides");
    deliver(location, "perimeter");
    await blocked();
    deliver(location, "controller");
    await saved(location, retained);
  });

  it.each([false, true])(
    "waits for visibility when initial snapshots finish while hidden (startup=%s)",
    async (startup) => {
      const { location, retained } = loading(startup);
      act(() => hidden(true));
      for (const leaf of required) deliver(location, leaf);
      expect(currentApi.ready).toBe(true);
      await blocked();
      act(() => hidden(false));
      await saved(location, retained);
    },
  );

  it("does not use a prior scope's callbacks as readiness or reconnect proof after A -> B -> A", async () => {
    mount();
    const retained = currentApi;
    const prior = [...subscriptions.entries()].flatMap(([path, callbacks]) =>
      path.startsWith("states/A/")
        ? [...callbacks].map((callback) => ({ path, callback }))
        : [],
    );
    pausedVenues.add("A");
    act(() => {
      local.setListenPrefix("B");
      local.setListenPrefix("A");
    });
    act(() => {
      hidden(true);
      connected = false;
      emit(".info/connected");
      connected = true;
      emit(".info/connected");
      hidden(false);
      for (const { callback } of prior)
        callback({ val: () => ({ homeScore: 999 }) } as DataSnapshot);
    });
    expect(currentApi.ready).toBe(false); // A new opaque scope masks the old venue projection.
    expect(currentApi.writeEligible).toBe(false);
    expect(currentApi.match.homeScore).toBe(0);
    clearAttempts();
    await blocked();
    for (const leaf of required.filter((leaf) => leaf !== "perimeter"))
      deliver("A", leaf);
    await blocked();
    deliver("A", "perimeter");
    await saved("A", retained);
  });
});

describe("preset rename completion ownership", () => {
  function Editor() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen((value) => !value)}>Toggle theme</button>
        <ThemeEditorModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  function input() {
    const element = document.querySelector<HTMLInputElement>(
      ".theme-rename-input",
    );
    if (!element) throw new Error("Missing rename input");
    return element;
  }
  function edit(index: number, value: string) {
    fireEvent.click(screen.getAllByTitle("Endurnefna")[index]!);
    fireEvent.change(input(), { target: { value } });
  }
  function submit() {
    fireEvent.keyDown(input(), { key: "Enter", code: "Enter" });
  }
  function setup() {
    write("states/A/view/customPresets/second", { name: "Second", theme: {} });
    mount(<Editor />);
    const pending = deferred<void>();
    vi.mocked(firebaseDatabase.writeAudited).mockReturnValueOnce(
      pending.promise,
    );
    edit(0, "First submission");
    submit();
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    return pending;
  }
  async function settle(
    pending: ReturnType<typeof deferred<void>>,
    failure: boolean,
  ) {
    await act(async () => {
      if (failure) pending.reject(new Error("Old rename failed"));
      else pending.resolve();
      await pending.promise.catch(() => undefined);
    });
  }

  const changes: Array<[string, () => void]> = [
    ["A -> B", () => edit(1, "New draft")],
    [
      "A -> B -> A",
      () => {
        edit(1, "Other draft");
        edit(0, "New draft");
      },
    ],
    [
      "same-ID revision",
      () => fireEvent.change(input(), { target: { value: "New draft" } }),
    ],
    ["same-ID reopened edit", () => edit(0, "New draft")],
    [
      "modal close/reopen",
      () => {
        fireEvent.click(screen.getByText("Toggle theme"));
        fireEvent.click(screen.getByText("Toggle theme"));
        edit(0, "New draft");
      },
    ],
  ];
  it.each(
    changes.flatMap(([label, change]) =>
      [false, true].map((failure) => ({ label, change, failure })),
    ),
  )(
    "preserves $label after late completion (failure=$failure)",
    async ({ change, failure }) => {
      const pending = setup();
      change();
      await settle(pending, failure);
      expect(input()).toHaveValue("New draft");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "ignores completion after closing and reopening without a new edit (failure=%s)",
    async (failure) => {
      const pending = setup();
      fireEvent.click(screen.getByText("Toggle theme"));
      fireEvent.click(screen.getByText("Toggle theme"));
      // Reopening can focus the old draft; clicking another control then
      // blurs it in a new modal lifetime without another explicit save.
      fireEvent.blur(input());
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
      await settle(pending, failure);
      expect(input()).toHaveValue("First submission");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it.each(
    boundaries
      .filter(
        ([label]) =>
          label === "batched A -> B -> A" ||
          label === "logout + same-user login",
      )
      .flatMap(([label, invalidate]) =>
        [false, true].map((failure) => ({ label, invalidate, failure })),
      ),
  )(
    "ignores a previous session's completion after $label (failure=$failure)",
    async ({ invalidate, failure }) => {
      const pending = setup();
      act(invalidate);
      await settle(pending, failure);
      expect(input()).toHaveValue("First submission");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("deduplicates Enter/blur, keeps a matching rejection and allows explicit retry", async () => {
    const pending = setup();
    fireEvent.blur(input());
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    await settle(pending, true);
    expect(input()).toHaveValue("First submission");
    expect(screen.getByRole("alert")).toHaveTextContent("Old rename failed");
    fireEvent.blur(input());
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    submit();
    await waitFor(() =>
      expect(document.querySelector(".theme-rename-input")).toBeNull(),
    );
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "preserves a newer submission's feedback after an old completion (failure=%s)",
    async (failure) => {
      const pending = setup();
      const newer = deferred<void>();
      vi.mocked(firebaseDatabase.writeAudited).mockReturnValueOnce(
        newer.promise,
      );
      fireEvent.change(input(), { target: { value: "New draft" } });
      submit();
      await act(async () => {
        newer.reject(new Error("New rename failed"));
        await newer.promise.catch(() => undefined);
      });
      await settle(pending, failure);
      expect(input()).toHaveValue("New draft");
      expect(screen.getByRole("alert")).toHaveTextContent("New rename failed");
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(2);
    },
  );

  it("does not clear a newer submission's pending guard when an old save settles", async () => {
    const pending = setup();
    const newer = deferred<void>();
    vi.mocked(firebaseDatabase.writeAudited).mockReturnValueOnce(newer.promise);
    fireEvent.change(input(), { target: { value: "New draft" } });
    submit();
    await settle(pending, false);
    fireEvent.blur(input());
    submit();
    expect(input()).toHaveValue("New draft");
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(2);
    await settle(newer, false);
    expect(document.querySelector(".theme-rename-input")).toBeNull();
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

  it.each([undefined, "first-A"])(
    "consumes legacy/identified playback once and stamps even a one-item successor (%s)",
    async (occurrenceId) => {
      const currentAsset = {
        asset,
        time: 3,
        ...(occurrenceId ? { occurrenceId } : {}),
      };
      write("states/A/controller/currentAsset", currentAsset);
      mount();
      clearAttempts();
      const observed = {
        occurrenceId: occurrenceId ?? null,
        assetKey: asset.key,
        time: 3,
        activeQueueId: "queue",
        playing: true,
      };
      await act(async () => {
        expect(await currentApi.completeAssetIfCurrent(observed)).toBe(true);
      });
      const successor = object(read("states/A/controller/currentAsset"));
      expect(successor.occurrenceId).toEqual(expect.any(String));
      expect(successor.occurrenceId).not.toBe(occurrenceId);
      expect(successor.asset).toEqual(asset);
      await act(async () => {
        expect(await currentApi.completeAssetIfCurrent(observed)).toBe(false);
      });
      expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledTimes(1);
    },
  );

  it("reuses one successor candidate across transaction retries without reader-generated IDs", async () => {
    write("states/A/controller/currentAsset", {
      asset,
      time: 3,
      occurrenceId: "first-A",
    });
    mount();
    const candidates: unknown[] = [];
    vi.mocked(runTransaction).mockImplementationOnce((reference, change) => {
      const before = read(String(reference));
      candidates.push(object(object(change(before)).currentAsset).occurrenceId);
      const next = change(before);
      candidates.push(object(object(next).currentAsset).occurrenceId);
      write(String(reference), next);
      return Promise.resolve({
        committed: true,
        snapshot: { val: () => next },
      } as never);
    });
    await act(async () => {
      expect(
        await currentApi.completeAssetIfCurrent({
          occurrenceId: "first-A",
          assetKey: asset.key,
          time: 3,
          activeQueueId: "queue",
          playing: true,
        }),
      ).toBe(true);
    });
    expect(candidates[0]).toEqual(expect.any(String));
    expect(candidates[1]).toBe(candidates[0]);
  });

  it("replay changes occurrence while preserving media and unrelated metadata writes preserve it", async () => {
    mount();
    await act(async () => {
      await currentApi.renderAsset(asset);
    });
    const first = object(read("states/A/controller/currentAsset"));
    act(() => {
      currentApi.renameQueue("queue", "Renamed");
    });
    expect(read("states/A/controller/currentAsset")).toEqual(first);
    await act(async () => {
      await currentApi.renderAsset(asset);
    });
    const second = object(read("states/A/controller/currentAsset"));
    expect(second.asset).toEqual(first.asset);
    expect(second.occurrenceId).not.toBe(first.occurrenceId);
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
    async (api) => {
      await api.createQueue("New", [asset]);
    },
  ],
  [
    "replaceQueue",
    "controller.replace-queue",
    async (api) => {
      await api.replaceQueue("Queue", [asset], { cycle: false });
    },
  ],
  [
    "appendSubstitutionAndActivate",
    "controller.append-substitution-and-activate",
    (api) => api.appendSubstitutionAndActivate(substitution),
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
    (api) => api.reorderQueues(["missing", "queue"]),
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

describe("atomic queue intent regressions", () => {
  function holdWrite(reenter?: () => void) {
    const ack = deferred<void>();
    const original = vi.mocked(update).getMockImplementation();
    if (!original) throw new Error("Missing SDK mock");
    const rollback = new Map<string, unknown>();
    vi.mocked(update).mockImplementationOnce((reference, changes) => {
      for (const path of Object.keys(changes))
        rollback.set(path, structuredClone(read(path)));
      void original(reference, changes);
      reenter?.();
      return ack.promise;
    });
    return {
      accept: () => ack.resolve(),
      deny: () => {
        for (const [path, value] of rollback) write(path, value);
        // The real SDK prunes the empty event after rolling back its leaves.
        const events = new Set(
          [...rollback.keys()]
            .filter((path) => path.startsWith("audit/"))
            .map((path) => path.split("/").slice(0, 3).join("/")),
        );
        for (const path of events)
          if (Object.keys(object(read(path))).length === 0) write(path, null);
        emit();
        ack.reject(new Error("permission denied"));
      },
    };
  }

  const independent = {
    ...substitution,
    outgoing: { ...player, id: 12, name: "Other starter", number: 9 },
    incoming: { ...benchPlayer, id: 13, name: "Other bench", number: 10 },
    asset: { ...substitution.asset, key: "independent-sub" },
  };

  it.each(["create", "replace", "substitution"] as const)(
    "%s creation registers before a reentrant SDK echo; a denied predecessor is recomputed without its failed items",
    async (kind) => {
      write("states/A/controller/roster/home", [
        player,
        benchPlayer,
        independent.outgoing,
        independent.incoming,
      ]);
      if (kind === "replace") {
        write("states/A/controller/queues/queue/name", "Skiptingar");
      }
      mount();
      let dependent: Promise<void> | undefined;
      const gate = holdWrite(() => {
        dependent = currentApi.appendSubstitutionAndActivate(independent);
      });
      let first: Promise<unknown>;
      act(() => {
        first = (
          kind === "substitution"
            ? currentApi.appendSubstitutionAndActivate(substitution)
            : kind === "replace"
              ? currentApi.replaceQueue("Skiptingar", [
                  { ...asset, key: "failed-replacement" },
                ])
              : currentApi.createQueue("Skiptingar", [asset])
        ).catch((error: unknown) => error);
      });
      expect(update).toHaveBeenCalledTimes(1);
      // A durable, independent queue edit remains usable during the wait.
      act(() => currentApi.updateQueueSettings("queue", { imageSeconds: 8 }));
      if (kind !== "replace") expect(update).toHaveBeenCalledTimes(2);
      await act(async () => {
        gate.deny();
        expect(await first).toBeInstanceOf(Error);
        await dependent;
      });
      const queue = Object.values(currentApi.controller.queues).find(
        (entry) => entry.name === "Skiptingar",
      );
      expect(queue).toMatchObject({
        name: "Skiptingar",
        items:
          kind === "replace" ? [asset, independent.asset] : [independent.asset],
        cycle: kind === "replace",
        autoPlay: kind === "replace",
        imageSeconds: 3,
      });
      expect(typeof queue?.id).toBe("string");
      expect(typeof queue?.order).toBe("number");
      expect(currentApi.controller.roster.home.map((p) => p.show)).toEqual([
        true,
        false,
        false,
        true,
      ]);
      const events = Object.values(object(read("audit/A"))).map(object);
      expect(
        events.filter(
          (event) =>
            event.action === "controller.append-substitution-and-activate",
        ),
      ).toHaveLength(1);
    },
  );

  it("waits for success, then appends a leaf while preserving durable metadata", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    mount();
    const gate = holdWrite();
    let first: Promise<string>;
    let second: Promise<void>;
    act(() => {
      first = currentApi.createQueue("Skiptingar", [asset]);
      second = currentApi.appendSubstitutionAndActivate(substitution);
    });
    expect(update).toHaveBeenCalledTimes(1);
    const queue = Object.values(currentApi.controller.queues).find(
      (entry) => entry.name === "Skiptingar",
    )!;
    act(() => {
      write(`states/A/controller/queues/${queue.id}/imageSeconds`, 27);
      emit();
    });
    await act(async () => {
      gate.accept();
      await Promise.all([first, second]);
    });
    expect(currentApi.controller.queues[queue.id]?.imageSeconds).toBe(27);
    const diff = vi.mocked(firebaseDatabase.writeAudited).mock.calls[1]?.[2];
    expect(diff).toHaveProperty(`queues/${queue.id}/items`, [
      asset,
      substitution.asset,
    ]);
    expect(diff).not.toHaveProperty(`queues/${queue.id}`);
    expect(diff).not.toHaveProperty(`queues/${queue.id}/imageSeconds`);
  });

  it.each(boundaries)(
    "cancels a dependent intent promptly on %s even with an ambiguous acknowledgement",
    async (_name, crossBoundary) => {
      write("states/A/controller/roster/home", [player, benchPlayer]);
      mount();
      const gate = holdWrite();
      let first: Promise<string>;
      let result: Promise<unknown>;
      act(() => {
        first = currentApi.createQueue("Skiptingar", [asset]);
        result = currentApi
          .appendSubstitutionAndActivate(substitution)
          .catch((error: unknown) => error);
      });
      clearAttempts();
      await act(async () => {
        crossBoundary();
        expect(await result).toBeInstanceOf(MutationRejectedError);
      });
      noAttempts();
      await act(async () => {
        gate.accept();
        await first;
      });
      noAttempts();
    },
  );

  it("rechecks multiple overlapping waiters against a successor creation and its settled roster", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    mount();
    const firstGate = holdWrite();
    let first: Promise<unknown>;
    let second: Promise<void>;
    let third: Promise<unknown>;
    let thirdSettled = false;
    act(() => {
      first = currentApi
        .createQueue("Skiptingar", [asset])
        .catch((error: unknown) => error);
      second = currentApi.appendSubstitutionAndActivate(substitution);
      third = currentApi
        .appendSubstitutionAndActivate(substitution)
        .catch((error: unknown) => {
          thirdSettled = true;
          return error;
        });
    });
    const secondGate = holdWrite();
    clearAttempts();
    await act(async () => {
      firstGate.deny();
      await first;
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(thirdSettled).toBe(false);
    clearAttempts();
    await act(async () => {
      secondGate.accept();
      await second;
      expect(String(await third)).toContain("Leikmannahópur");
    });
    noAttempts();
    const queue = Object.values(currentApi.controller.queues).find(
      (entry) => entry.name === "Skiptingar",
    );
    expect(queue?.items).toEqual([substitution.asset]);
    expect(Object.keys(object(read("audit/A")))).toHaveLength(1);
  });

  it("revalidates eligibility after a pending creation settles", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    mount();
    const gate = holdWrite();
    let first: Promise<string>;
    let result: Promise<unknown>;
    act(() => {
      first = currentApi.createQueue("Skiptingar", [asset]);
      result = currentApi
        .appendSubstitutionAndActivate(substitution)
        .catch((error: unknown) => error);
      write("states/A/controller/roster/home/0/show", false);
      emit();
    });
    clearAttempts();
    await act(async () => {
      gate.accept();
      await first;
      expect(String(await result)).toContain("Leikmannahópur");
    });
    noAttempts();
  });

  it("does not resurrect a denied queue for dependent item or metadata edits", async () => {
    mount();
    const gate = holdWrite();
    let first: Promise<unknown>;
    let append: Promise<unknown>;
    act(() => {
      first = currentApi
        .createQueue("Pending", [asset])
        .catch((error: unknown) => error);
    });
    const id = Object.values(currentApi.controller.queues).find(
      (queue) => queue.name === "Pending",
    )!.id;
    act(() => {
      append = currentApi
        .addItemsToQueue(id, [asset])
        .catch((error: unknown) => error);
      currentApi.renameQueue(id, "Renamed");
      currentApi.updateQueueSettings(id, { imageSeconds: 5 });
      currentApi.playQueue(id);
      currentApi.activateQueue(id);
      currentApi.removeItemFromQueue(id, asset.key);
      currentApi.reorderItemsInQueue(id, [asset]);
      currentApi.deleteQueue(id);
      currentApi.updateController({ activeQueueId: id });
      currentApi.updateController({ queues: currentApi.controller.queues });
    });
    expect(update).toHaveBeenCalledTimes(1);
    clearAttempts();
    await act(async () => {
      gate.deny();
      await first;
      expect(String(await append)).toContain("Biðröð");
    });
    noAttempts();
    expect(currentApi.mutationError).toBeTruthy();
    expect(
      vi.mocked(console.error).mock.calls.map(([, error]) => String(error)),
    ).toContain("Error: Biðröð er ekki lengur til. Reyndu aftur.");
    expect(read(`states/A/controller/queues/${id}`)).toBeNull();
  });

  it.each(boundaries)(
    "does not retarget a picker prepared before %s",
    async (_name, crossBoundary) => {
      const media = deferred<PlayerAsset | null>();
      mount(<CaptureQueueCallers />);
      act(() => pickerApi.selectAssets([media.promise]));
      act(() => crossBoundary());
      const before = structuredClone(data);
      clearAttempts();
      await act(async () => {
        media.resolve(asset);
        await media.promise;
      });
      const draft = pickerApi.pending;
      if (!draft) throw new Error("Missing picker draft");
      await act(async () => {
        await expect(
          draft.onCreateAndAdd("Obsolete", draft.assets),
        ).rejects.toBeInstanceOf(MutationRejectedError);
      });
      noAttempts();
      expect(data).toEqual(before);
    },
  );

  it.each(boundaries)(
    "does not retarget a substitution prepared before %s",
    async (_name, crossBoundary) => {
      write("states/A/controller/roster/home", [player, benchPlayer]);
      const media = deferred<PlayerAsset | null>();
      vi.mocked(getPlayerAssetObject).mockReturnValue(media.promise);
      mount(<CaptureQueueCallers />);
      act(() => quickApi.openSubModal("home"));
      act(() => quickApi.handleModalSelect(player));
      act(() => quickApi.handleModalSelect(benchPlayer));
      expect(getPlayerAssetObject).toHaveBeenCalledTimes(2);
      const before = structuredClone(data);
      clearAttempts();
      act(() => crossBoundary());
      await act(async () => {
        media.resolve(asset);
        await media.promise;
      });
      expect(currentApi.mutationError).toContain("lota eða tenging");
      expect(quickApi.error).toBe("");
      noAttempts();
      expect(data).toEqual(before);
    },
  );

  it("replaces a named active queue with all items in one mutation, retaining unrelated queues", async () => {
    write("states/A/controller/queues/other", {
      id: "other",
      name: "Other",
      items: [asset],
      order: 3,
      cycle: true,
      autoPlay: true,
      imageSeconds: 9,
    });
    mount();
    const otherBefore = read("states/A/controller/queues/other");
    clearAttempts();
    let id = "";
    await act(async () => {
      id = await currentApi.replaceQueue(
        "Queue",
        [{ ...asset, key: "replacement" }],
        { cycle: false },
      );
    });
    expect(id).not.toBe("queue");
    expect(read("states/A/controller/queues/queue")).toBeNull();
    expect(read(`states/A/controller/queues/${id}`)).toMatchObject({
      items: [{ key: "replacement" }],
      cycle: false,
      autoPlay: false,
      order: 4,
    });
    expect(read("states/A/controller/queues/other")).toEqual(otherBefore);
    expect(currentApi.controller).toMatchObject({
      activeQueueId: null,
      currentAsset: null,
      playing: false,
    });
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retains the old active queue and audit history when replacement is denied", async () => {
    mount();
    const before = structuredClone(data);
    vi.mocked(update).mockRejectedValueOnce(new Error("replacement denied"));
    await act(async () => {
      await expect(currentApi.replaceQueue("Queue", [asset])).rejects.toThrow(
        "replacement denied",
      );
    });
    expect(data).toEqual(before);
    expect(currentApi.controller.activeQueueId).toBe("queue");
  });

  it("submits both roster flags, queue items and activation together without interrupting playback", async () => {
    write("states/A/controller/roster/home", [benchPlayer, player]);
    mount();
    clearAttempts();
    await act(async () =>
      currentApi.appendSubstitutionAndActivate(substitution),
    );
    const subQueue = Object.values(currentApi.controller.queues).find(
      (queue) => queue.name === "Skiptingar",
    );
    expect(subQueue).toMatchObject({
      items: [substitution.asset],
      cycle: false,
      autoPlay: false,
      order: 1,
    });
    expect(currentApi.controller.activeQueueId).toBe(subQueue?.id);
    expect(currentApi.controller.currentAsset?.asset).toEqual(asset);
    expect(currentApi.controller.playing).toBe(true);
    expect(currentApi.controller.roster.home).toEqual([
      { ...benchPlayer, show: true },
      { ...player, show: false },
    ]);
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    const diff = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]?.[2];
    expect(diff).toMatchObject({
      "roster/home/1/show": false,
      "roster/home/0/show": true,
    });
    expect(diff).not.toHaveProperty("roster");
  });

  it("rejects an absent roster member without a partial queue or roster update", async () => {
    mount();
    clearAttempts();
    const before = structuredClone(data);
    await act(async () => {
      await expect(
        currentApi.appendSubstitutionAndActivate(substitution),
      ).rejects.toThrow("Leikmannahópur");
    });
    noAttempts();
    expect(data).toEqual(before);
  });

  it.each([
    ["0/show", false],
    ["0/show", null],
    ["1/show", true],
    ["1/number", null],
  ])(
    "rejects changed substitution eligibility at %s=%s before any writer",
    async (path, value) => {
      write("states/A/controller/roster/home", [player, benchPlayer]);
      mount();
      const commit = currentApi.appendSubstitutionAndActivate;
      act(() => {
        write(`states/A/controller/roster/home/${String(path)}`, value);
        emit("states/A/controller");
      });
      clearAttempts();
      const before = structuredClone(data);
      await act(async () => {
        await expect(commit(substitution)).rejects.toThrow("Leikmannahópur");
      });
      noAttempts();
      expect(data).toEqual(before);
    },
  );

  it("accepts an eligible numbered incoming player whose current show flag is absent", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    write("states/A/controller/roster/home/1/show", null);
    mount();
    clearAttempts();
    await act(async () =>
      currentApi.appendSubstitutionAndActivate(substitution),
    );
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    expect(currentApi.controller.roster.home.map((p) => p.show)).toEqual([
      false,
      true,
    ]);
  });

  it("keeps both roster flags and the old queue when the substitution save fails", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    mount();
    const before = structuredClone(data);
    vi.mocked(update).mockRejectedValueOnce(new Error("substitution denied"));
    await act(async () => {
      await expect(
        currentApi.appendSubstitutionAndActivate(substitution),
      ).rejects.toThrow("substitution denied");
    });
    expect(data).toEqual(before);
  });

  it("preserves rapid creates and substitutions through subscription echoes before React rerenders", async () => {
    write("states/A/controller/roster/home", [player, benchPlayer]);
    mount();
    const api = currentApi;
    await act(async () => {
      const first = api.createQueue("First", [asset]);
      const second = api.createQueue("Second", [asset]);
      const subOne = api.appendSubstitutionAndActivate(substitution);
      const subTwo = api.appendSubstitutionAndActivate({
        ...substitution,
        outgoing: benchPlayer,
        incoming: player,
        asset: { ...substitution.asset, key: "sub-two" },
      });
      await Promise.all([first, second, subOne, subTwo]);
    });
    expect(
      Object.values(currentApi.controller.queues).map((queue) => queue.order),
    ).toEqual([0, 1, 2, 3]);
    const queue = Object.values(currentApi.controller.queues).find(
      (queue) => queue.name === "Skiptingar",
    );
    expect(queue?.items.map((item) => item.key)).toEqual(["sub", "sub-two"]);
  });

  it("does not advance queue refs without a subscription delivery", async () => {
    mount();
    deliverWrites = false;
    const before = currentApi.controller;
    let id = "";
    await act(async () => {
      id = await currentApi.createQueue("Unobserved", [asset]);
    });
    expect(currentApi.controller).toBe(before);
    clearAttempts();
    await act(async () => {
      await currentApi.addItemsToQueue(id, [
        { ...asset, key: "must-not-use-shadow" },
      ]);
    });
    noAttempts();
    act(() => emit());
    expect(currentApi.controller.queues[id]?.items).toEqual([asset]);
  });

  it("creates initial items in one observable audited mutation", async () => {
    mount();
    clearAttempts();
    let id = "";
    await act(async () => {
      id = await currentApi.createQueue("Initial items", [asset]);
    });
    expect(read(`states/A/controller/queues/${id}/items`)).toEqual([asset]);
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    const events = Object.values(object(read("audit/A"))).map(object);
    expect(events).toHaveLength(1);
    expect(JSON.parse(String(events[0]?.changes))).toMatchObject({
      [`queues/${id}`]: { name: "Initial items", items: [asset], order: 1 },
    });
  });

  it("does not return a valid queue ID when creation submission fails", async () => {
    mount();
    const before = structuredClone(data);
    vi.mocked(update).mockRejectedValueOnce(new Error("queue denied"));
    await act(async () => {
      await expect(
        Promise.resolve(currentApi.createQueue("Denied")),
      ).rejects.toThrow("queue denied");
    });
    expect(data).toEqual(before);
  });

  it.each([
    ["rename", (api: Api) => api.renameQueue("queue", "Renamed")],
    [
      "duration",
      (api: Api) => api.updateQueueSettings("queue", { imageSeconds: 8 }),
    ],
    ["ordering", (api: Api) => api.reorderQueues(["missing", "queue"])],
  ] as const)(
    "%s preserves concurrent items and autoplay via leaf writes",
    (_name, change) => {
      mount();
      // Another writer changed these leaves, before this subscription sees it.
      const concurrent = [{ ...asset, key: "concurrent" }];
      write("states/A/controller/queues/queue/items", concurrent);
      write("states/A/controller/queues/queue/autoPlay", false);
      clearAttempts();
      act(() => change(currentApi));
      expect(read("states/A/controller/queues/queue/items")).toEqual(
        concurrent,
      );
      expect(read("states/A/controller/queues/queue/autoPlay")).toBe(false);
      for (const call of vi.mocked(firebaseDatabase.writeAudited).mock.calls) {
        expect(call[2]).not.toHaveProperty("queues/queue");
        expect(call[2]).not.toHaveProperty("queues/queue/items");
        expect(call[2]).not.toHaveProperty("queues/queue/autoPlay");
      }
    },
  );
});

describe("ordinary mutation inventory", () => {
  it.each(ordinaryCommands)(
    "audits an accepted %s command (%s)",
    async (_name, action, command) => {
      write("states/A/perimeter/enabled", false);
      write("states/A/controller/roster/home", [player, benchPlayer]);
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

function NestedDisplay() {
  const { controller } = useFirebaseState();
  const current = useDeferredAsset(controller.currentAsset);
  return (
    <>
      {current && <PlaybackAsset current={current} />}
      <Team teamName="homeTeam" />
      <MatchLifecycle />
    </>
  );
}

describe("ordinary roster commands preserve raw child identity", () => {
  afterEach(() => {
    const actWarnings = vi
      .mocked(console.error)
      .mock.calls.filter((args) =>
        args.some(
          (value) =>
            typeof value === "string" &&
            /not wrapped in act|without await|overlapping act|not configured to support act/i.test(
              value,
            ),
        ),
      );
    expect(actWarnings).toEqual([]);
  });

  const starter = { ...player, annotation: { keep: "starter" } };
  const coach = { name: "Coach", role: "Þjálfari", producer: { keep: 3 } };
  const rejected = { name: { invalid: true }, annotation: { keep: "raw" } };
  const blank = { name: "", number: "", show: false, role: "" };
  const replacement = [{ name: "Replacement", number: 42, source: "API" }];
  const layouts: Array<{
    name: string;
    raw: unknown;
    selected: string;
    next: string;
  }> = [
    {
      name: "dense",
      raw: [starter, coach, rejected],
      selected: "0",
      next: "3",
    },
    {
      name: "array with a hole",
      raw: [starter, null, coach, rejected],
      selected: "0",
      next: "4",
    },
    {
      name: "sparse numeric map",
      raw: { 17: starter, 26: rejected, 31: coach, 40: false },
      selected: "17",
      next: "41",
    },
    {
      name: "named map",
      raw: { zCoach: coach, aStarter: starter, bRejected: rejected },
      selected: "aStarter",
      next: "zCoach~",
    },
  ];

  function seed(side: "home" | "away", raw: unknown) {
    write("states/A/controller/roster", {
      home: structuredClone([starter, null, rejected, coach]),
      away: structuredClone([starter, null, rejected, coach]),
      [side]: structuredClone(raw),
      provenance: { keep: "roster metadata" },
    });
    mount();
    clearAttempts();
    return structuredClone(object(read("states/A/controller/roster")));
  }

  function expectIntent(action: string, diff: Data) {
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledExactlyOnceWith(
      "A",
      "controller",
      diff,
      expect.objectContaining({ action }),
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
    const events = Object.values(object(read("audit/A")));
    expect(events).toHaveLength(1);
    expect(object(events[0]).changes).toBe(JSON.stringify(diff));
  }

  describe.each(layouts)("$name", ({ raw, selected, next }) => {
    it.each(["home", "away"] as const)(
      "edits only requested %s child fields",
      async (side) => {
        const before = seed(side, raw);
        await act<void>(() => {
          currentApi.editPlayer(side, 0, {
            show: false,
            number: "07",
            role: undefined,
          });
        });
        const expected = structuredClone(before);
        Object.assign(object(object(expected[side])[selected]), {
          show: false,
          number: "07",
        });
        expect(read("states/A/controller/roster")).toEqual(expected);
        expectIntent("controller.edit-player", {
          [`roster/${side}/${selected}/show`]: false,
          [`roster/${side}/${selected}/number`]: "07",
        });
      },
    );

    it.each(["home", "away"] as const)(
      "deletes the actual %s child without rekeying siblings",
      async (side) => {
        const before = seed(side, raw);
        await act<void>(() => currentApi.deletePlayer(side, 0));
        const expected = structuredClone(before);
        delete object(expected[side])[selected];
        expect(read("states/A/controller/roster")).toEqual(expected);
        expectIntent("controller.delete-player", {
          [`roster/${side}/${selected}`]: null,
        });
        expect(currentApi.controller.roster[side]).toEqual([coach]);
      },
    );

    it.each(["home", "away"] as const)(
      "appends an unused %s child after rejected rows too",
      async (side) => {
        const before = seed(side, raw);
        await act<void>(() => currentApi.addPlayer(side));
        const expected = structuredClone(before);
        object(expected[side])[next] = blank;
        expect(read("states/A/controller/roster")).toEqual(expected);
        expectIntent("controller.add-player", {
          [`roster/${side}/${next}`]: blank,
        });
        expect(currentApi.controller.roster[side]).toEqual([
          starter,
          coach,
          blank,
        ]);
      },
    );

    it.each(["home", "away"] as const)(
      "replaces only the requested %s side",
      async (side) => {
        const before = seed(side, raw);
        await act<void>(() => currentApi.setRoster({ [side]: replacement }));
        expect(read("states/A/controller/roster")).toEqual({
          ...before,
          [side]: replacement,
        });
        expectIntent("controller.set-roster", {
          [`roster/${side}`]: replacement,
        });
      },
    );
  });

  it("uses subscription keys across rapid SDK echoes, deletion and additions with a retained current-origin API", async () => {
    const before = seed("home", {
      17: starter,
      26: rejected,
      31: coach,
      40: false,
    });
    const retained = currentApi;
    await act<void>(() => {
      retained.editPlayer("home", 0, { show: false });
      retained.editPlayer("home", 0, { name: "Edited" });
      retained.deletePlayer("home", 0);
      retained.editPlayer("home", 0, { name: "Coach edited" });
      retained.addPlayer("home");
      retained.addPlayer("home");
    });
    expect(read("states/A/controller/roster")).toEqual({
      ...before,
      home: {
        26: rejected,
        31: { ...coach, name: "Coach edited" },
        40: false,
        41: blank,
        42: blank,
      },
    });
    expect(
      vi
        .mocked(firebaseDatabase.writeAudited)
        .mock.calls.map((call) => call[2]),
    ).toEqual([
      { "roster/home/17/show": false },
      { "roster/home/17/name": "Edited" },
      { "roster/home/17": null },
      { "roster/home/31/name": "Coach edited" },
      { "roster/home/41": blank },
      { "roster/home/42": blank },
    ]);
    expect(update).toHaveBeenCalledTimes(6);
  });

  it("ignores unchanged supplied projections and out-of-range selections", async () => {
    const before = seed("home", { 17: starter, 26: rejected });
    await act<void>(() => {
      currentApi.setRoster(currentApi.controller.roster);
      currentApi.editPlayer("home", 0, { show: true, role: undefined });
      for (const index of [-1, 1, 0.5, NaN]) {
        currentApi.editPlayer("home", index, { name: "Wrong" });
        currentApi.deletePlayer("home", index);
      }
    });
    noAttempts();
    expect(read("states/A/controller/roster")).toEqual(before);
  });

  it("keeps a rendered child's key across an earlier deletion and ignores keys that disappeared", async () => {
    seed("home", { 17: starter, 26: rejected, 31: coach });
    const retained = currentApi;
    await act<void>(() => {
      retained.deletePlayer("home", "17");
      retained.editPlayer("home", "31", { show: true });
      retained.editPlayer("home", "17", { name: "Do not resurrect" });
      retained.deletePlayer("home", "17");
      retained.deletePlayer("home", "26");
    });
    expect(read("states/A/controller/roster/home")).toEqual({
      26: rejected,
      31: { ...coach, show: true },
    });
    expect(
      vi
        .mocked(firebaseDatabase.writeAudited)
        .mock.calls.map((call) => call[2]),
    ).toEqual([{ "roster/home/17": null }, { "roster/home/31/show": true }]);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("rejects roster replacement through the generic controller writer", async () => {
    const before = seed("home", { 17: starter, 26: rejected });
    const genericUpdate = {
      view: "match",
      roster: currentApi.controller.roster,
    };
    // Keep act open while the void adapter reports the rejected command.
    await act<void>(() =>
      Promise.resolve(currentApi.updateController(genericUpdate)),
    );
    noAttempts();
    expect(read("states/A/controller/roster")).toEqual(before);
    expect(currentApi.mutationError).toBe(
      "Use roster commands to change players.",
    );
  });

  it("explicitly replaces both imported sides but only full clear removes roster metadata", async () => {
    const before = seed("home", { 17: starter, 26: rejected });
    await act<void>(() =>
      currentApi.setRoster({ home: replacement, away: [] }),
    );
    expect(read("states/A/controller/roster")).toEqual({
      ...before,
      home: replacement,
      away: [],
    });
    expectIntent("controller.set-roster", {
      "roster/home": replacement,
      "roster/away": [],
    });
    clearAttempts();
    await act<void>(() => currentApi.clearRoster());
    expect(read("states/A/controller/roster")).toEqual({ home: [], away: [] });
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledExactlyOnceWith(
      "A",
      "controller",
      { roster: { home: [], away: [] } },
      expect.objectContaining({ action: "controller.clear-roster" }),
    );
  });

  it("clears rejected raw rows even when the parsed roster is empty", async () => {
    seed("home", { 26: rejected });
    await act<void>(() => currentApi.setRoster({ home: [] }));
    expectIntent("controller.set-roster", { "roster/home": [] });
    expect(read("states/A/controller/roster/home")).toEqual([]);
  });
});

describe("nested data at subscription and conditional-write boundaries", () => {
  it("renders a mixed roster and rejects malformed media/penalties with no SDK or audit attempt", async () => {
    write("states/A/controller/currentAsset", {
      asset: { ...asset, background: { not: "a media URL" } },
      time: 0.001,
    });
    write("states/A/controller/roster/home", [
      player,
      null,
      { name: { invalid: true }, number: 9 },
      { name: "Foreign coach", id: "foreign-coach", role: "Þjálfari" },
    ]);
    write("states/A/match/home2min", [
      { key: "bad", atTimeElapsed: [], penaltyLength: false },
      { key: "good", atTimeElapsed: 0, penaltyLength: 120000 },
    ]);
    const before = structuredClone(data);
    mount(<NestedDisplay />);
    await waitFor(() => expect(currentApi.writeEligible).toBe(true));
    expect(screen.getByText("Foreign coach")).toBeInTheDocument();
    expect(currentApi.controller.roster.home).toHaveLength(2);
    expect(currentApi.match.home2min).toHaveLength(1);
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    noAttempts();
    expect(data).toEqual(before);
  });

  it.each([
    [
      null,
      { name: {}, number: 2 },
      { ...player, note: { source: "old" } },
      benchPlayer,
    ],
    {
      7: { ...player, note: { source: "old" } },
      10: { name: {} },
      25: benchPlayer,
    },
    {
      outgoing: { ...player, note: { source: "old" } },
      broken: false,
      incoming: benchPlayer,
    },
  ])(
    "writes substitution flags at original Firebase child keys: %j",
    async (players) => {
      write("states/A/controller/roster/home", players);
      mount();
      clearAttempts();
      await act(async () => {
        await currentApi.appendSubstitutionAndActivate(substitution);
      });
      const offKey = Array.isArray(players)
        ? "2"
        : "7" in players
          ? "7"
          : "outgoing";
      const onKey = Array.isArray(players)
        ? "3"
        : "25" in players
          ? "25"
          : "incoming";
      const changes = vi.mocked(firebaseDatabase.writeAudited).mock
        .calls[0]![2];
      expect(changes).toMatchObject({
        [`roster/home/${offKey}/show`]: false,
        [`roster/home/${onKey}/show`]: true,
      });
      expect(read(`states/A/controller/roster/home/${offKey}/show`)).toBe(
        false,
      );
      expect(read(`states/A/controller/roster/home/${onKey}/show`)).toBe(true);
      expect(read(`states/A/controller/roster/home/${offKey}/note`)).toEqual({
        source: "old",
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it("preserves raw unrelated collections and metadata during a valid legacy completion", async () => {
    write("states/A/controller", {
      playing: false,
      currentAsset: { asset, time: null, annotation: { source: "legacy" } },
      roster: {
        home: { 9: player, 15: { name: {} } },
        away: { 40: benchPlayer },
        note: "keep",
      },
      queues: {
        saved: {
          items: { 4: asset, 9: { type: "SUB", key: "bad" } },
          note: { source: "saved" },
        },
        corrupt: [],
      },
      custom: { revision: 17 },
    });
    const before = structuredClone(read("states/A/controller"));
    mount();
    clearAttempts();
    await act(async () => {
      expect(
        await currentApi.completeAssetIfCurrent({
          occurrenceId: null,
          assetKey: asset.key,
          time: null,
          activeQueueId: null,
          playing: false,
        }),
      ).toBe(true);
    });
    expect(read("states/A/controller")).toEqual({
      ...object(before),
      currentAsset: null,
    });
    expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledExactlyOnceWith(
      "A",
      "controller",
      { currentAsset: null },
      expect.objectContaining({ action: "controller.complete-asset" }),
    );
  });

  it("does not rewrite a sparse penalty collection when completing a countdown", async () => {
    write("states/A/match", {
      started: 100,
      countdown: true,
      halftimeCountdown: false,
      home2min: {
        9: { key: "p", atTimeElapsed: 0, penaltyLength: 120000, note: "keep" },
        40: { invalid: true },
      },
      custom: { source: "legacy" },
    });
    const before = object(structuredClone(read("states/A/match")));
    mount();
    clearAttempts();
    await act(async () => {
      expect(
        await currentApi.completeCountdownIfCurrent({
          started: 100,
          countdown: true,
          halftimeCountdown: false,
        }),
      ).toBe(true);
    });
    expect(read("states/A/match")).toEqual({
      ...before,
      started: 0,
      countdown: false,
    });
    expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledTimes(1);
  });
});
