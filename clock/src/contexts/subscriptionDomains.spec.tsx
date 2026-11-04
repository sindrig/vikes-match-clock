import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import {
  onValue,
  ref,
  runTransaction,
  type DataSnapshot,
} from "firebase/database";
import { memo, StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReadNotice from "../controller/ReadNotice";
import { firebaseDatabase } from "../firebaseDatabase";
import { MutationSession, MutationRejectedError } from "../lib/mutationSession";
import MatchLifecycle from "../match/MatchLifecycle";
import {
  FirebaseStateProvider,
  useFirebaseState,
  useFirebaseReadStatus,
  useMatch,
  usePerimeterTelemetry,
  useVenueMetadataStatus,
} from "./FirebaseStateContext";
import { INITIAL_DELIVERY_DEADLINE_MS } from "./subscriptionRead";

vi.mock("../firebase", () => ({
  database: {},
  FIREBASE_STORAGE_BUCKET: "test.appspot.com",
}));
vi.mock("../firebaseDatabase", () => ({
  firebaseDatabase: { writeAudited: vi.fn(), writeAuditOnly: vi.fn() },
}));
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => 1,
}));

interface Subscription {
  path: string;
  data: (snapshot: DataSnapshot) => unknown;
  error?: (error: Error) => unknown;
  active: boolean;
}
const subscriptions: Subscription[] = [];
const values = new Map<string, unknown>();
const withheld = new Set<string>();
const required = ["match", "controller", "view", "clubOverrides", "perimeter"];
let api: ReturnType<typeof useFirebaseState>;
let status: ReturnType<typeof useFirebaseReadStatus>;
let telemetry: ReturnType<typeof usePerimeterTelemetry>;
let metadata: ReturnType<typeof useVenueMetadataStatus>;
let matchApi: ReturnType<typeof useMatch>;
let matchRenders = 0;
const observedAssets: { asset: unknown; attempts: number }[] = [];
function snapshot(path: string): DataSnapshot {
  return { val: () => values.get(path) ?? null } as DataSnapshot;
}
function emit(path: string) {
  subscriptions
    .filter((entry) => entry.active && entry.path === path)
    .forEach((entry) => entry.data(snapshot(path)));
}
function fail(path: string) {
  subscriptions
    .filter((entry) => entry.active && entry.path === path)
    .forEach((entry) =>
      entry.error?.(
        Object.assign(new Error("private credential should never appear"), {
          code: "PERMISSION_DENIED",
        }),
      ),
    );
}
function report(percent: number) {
  return {
    phase: "applied",
    requestedPercent: percent,
    appliedPercent: percent,
    updatedAt: 1,
  };
}
const MatchProbe = memo(function MatchProbe() {
  const value = useMatch();
  useLayoutEffect(() => {
    matchRenders++;
    matchApi = value;
  });
  return <span>{value.match.homeScore}</span>;
});
function Capture() {
  const value = useFirebaseState();
  const read = useFirebaseReadStatus();
  const hardware = usePerimeterTelemetry();
  const locations = useVenueMetadataStatus();
  useLayoutEffect(() => {
    api = value;
    status = read;
    telemetry = hardware;
    metadata = locations;
    observedAssets.push({
      asset: value.controller.currentAsset,
      attempts: vi.mocked(runTransaction).mock.calls.length,
    });
  });
  return (
    <>
      <ReadNotice status={read.status} retry={read.retry} />
      <ReadNotice {...locations} />
    </>
  );
}
function mount({
  session = new MutationSession({
    location: "A",
    authenticated: true,
    uid: "operator",
  }),
  strict = false,
  lifecycle = false,
} = {}) {
  const children = (
    <>
      <MatchProbe />
      <Capture />
      {lifecycle && <MatchLifecycle />}
    </>
  );
  const tree = (location = "A", authenticated = true) => (
    <FirebaseStateProvider
      listenPrefix={location}
      isAuthenticated={authenticated}
      uid={authenticated ? "operator" : undefined}
      screenKey={null}
      mutationSession={session}
    >
      {children}
    </FirebaseStateProvider>
  );
  const result = render(strict ? <StrictMode>{tree()}</StrictMode> : tree());
  return {
    session,
    rerender: (location = "A", authenticated = true) =>
      result.rerender(tree(location, authenticated)),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  subscriptions.length = 0;
  values.clear();
  withheld.clear();
  observedAssets.length = 0;
  matchRenders = 0;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  values.set(".info/connected", true);
  values.set(".info/serverTimeOffset", 0);
  values.set("states/A/match", { homeScore: 2 });
  values.set("states/A/perimeter", {
    enabled: true,
    state: "on",
    brightness: 20,
  });
  values.set("perimeter/A/brightnessStatus", report(20));
  vi.mocked(ref).mockImplementation((_, path) => path as never);
  vi.mocked(onValue).mockImplementation((reference, callback, cancel) => {
    const entry: Subscription = {
      path: String(reference),
      data: callback,
      error: typeof cancel === "function" ? cancel : undefined,
      active: true,
    };
    subscriptions.push(entry);
    if (!withheld.has(entry.path)) callback(snapshot(entry.path));
    return () => {
      entry.active = false;
    };
  });
  vi.mocked(firebaseDatabase.writeAudited).mockResolvedValue(undefined);
  vi.mocked(firebaseDatabase.writeAuditOnly).mockResolvedValue(undefined);
  vi.mocked(runTransaction).mockImplementation((reference, change) => {
    const path = String(reference);
    const next = change(values.get(path) ?? null);
    if (next === undefined)
      return Promise.resolve({ committed: false, snapshot: snapshot(path) });
    values.set(path, next);
    emit(path);
    return Promise.resolve({ committed: true, snapshot: snapshot(path) });
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("subscription domain ownership", () => {
  it("keeps a media-pair command stable and computes from the parent's SDK echo before React rerenders", async () => {
    mount();
    const command = api.setPerimeterMediaPairMainScreenAsset;
    const id = "11111111-1111-4111-8111-111111111111";
    let submission: Promise<void> | undefined;
    act(() => {
      values.set("states/A/perimeter", {
        mediaPairs: {
          [id]: {
            name: "Pair",
            files: {
              "2": {
                name: "a.png",
                source: `gs://test.appspot.com/A/perimeter-overlays/${id}/48/a.png`,
              },
              "4": {
                name: "b.png",
                source: `gs://test.appspot.com/A/perimeter-overlays/${id}/40/b.png`,
              },
            },
          },
        },
      });
      emit("states/A/perimeter");
      submission = command(id, null);
    });
    await submission;
    expect(api.setPerimeterMediaPairMainScreenAsset).toBe(command);
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
      "A",
      "perimeter",
      { [`mediaPairs/${id}/mainScreenAsset`]: null },
      expect.anything(),
    );
    act(() => {
      values.set("states/A/perimeter", null);
      emit("states/A/perimeter");
    });
    await act(async () => {
      await expect(command(id, null)).rejects.toThrow("Jaðarefni fannst ekki");
    });
    expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
  });

  it("has one desired parent and no child owners, including StrictMode/retry cleanup", () => {
    mount({ strict: true });
    const paths = () =>
      subscriptions.filter((entry) => entry.active).map((entry) => entry.path);
    expect(
      paths().filter((path) => path.startsWith("states/A/perimeter")),
    ).toEqual(["states/A/perimeter"]);
    act(() => status.retry());
    for (const area of required)
      expect(
        paths().filter((path) => path === `states/A/${area}`),
      ).toHaveLength(1);
    cleanup();
    expect(paths()).toEqual([]);
    expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
  });

  it("does not context-invalidate match or replace commands on telemetry and ordinary parent renders", () => {
    const view = mount();
    const before = matchApi;
    const renders = matchRenders;
    act(() => {
      values.set("perimeter/A/brightnessStatus", report(61));
      emit("perimeter/A/brightnessStatus");
    });
    expect(telemetry.brightnessStatus?.appliedPercent).toBe(61);
    expect(matchRenders).toBe(renders);
    expect(matchApi).toBe(before);
    view.rerender();
    expect(matchApi).toBe(before);
    act(() => {
      values.set("states/A/match", { homeScore: 3 });
      emit("states/A/match");
    });
    expect(matchRenders).toBeGreaterThan(renders);
    expect(matchApi.addGoal).toBe(before.addGoal);
  });

  it("projects and clears all desired children from the parent without writes", () => {
    mount();
    act(() => {
      values.set("states/A/perimeter", {
        enabled: true,
        state: "on",
        brightness: 47,
        brightnessAuto: {
          enabled: true,
          min: 2,
          max: 90,
          exponent: 1,
          cloudWeight: 0.5,
          luxMin: 1,
          luxMax: 100,
          updatedAt: 1,
        },
        overlay: {
          version: 2,
          kind: "goal-scorer",
          id: "goal",
          player: { id: "a", name: "Anna", number: "7" },
        },
        adLayout: { version: 1, revision: "ads", columns: [] },
        goalVideo: {
          files: {
            "2": {
              name: "goal.mp4",
              source: "gs://test.appspot.com/A/perimeter/goal.mp4",
            },
          },
        },
      });
      emit("states/A/perimeter");
    });
    expect(api.perimeterBrightness).toBe(47);
    expect(api.perimeterBrightnessAuto?.enabled).toBe(true);
    expect(api.perimeterOverlay?.id).toBe("goal");
    expect(api.perimeterAdLayout?.revision).toBe("ads");
    act(() => {
      values.set("states/A/perimeter", null);
      emit("states/A/perimeter");
    });
    expect(api.perimeter).toEqual({ enabled: false, state: "off" });
    expect([
      api.perimeterOverlay,
      api.perimeterGoalVideo,
      api.perimeterAdLayout,
      api.perimeterBrightness,
      api.perimeterBrightnessAuto,
    ]).toEqual([null, null, null, null, null]);
    expect(api.mediaPairs).toEqual({});
    expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
  });
});

describe("required read faults and recovery", () => {
  it.each(required)(
    "reports %s denial before the initial gate completes",
    (area) => {
      required.forEach((leaf) => withheld.add(`states/A/${leaf}`));
      mount();
      act(() => fail(`states/A/${area}`));
      expect(status.ready).toBe(false);
      expect(screen.getByRole("alert")).toHaveTextContent(area);
      expect(api.writeEligible).toBe(false);
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    },
  );

  it.each(required)(
    "locks %s failure synchronously, retains data, and retries all five without replay",
    async (area) => {
      mount();
      const retained = api;
      act(() => fail(`states/A/${area}`));
      expect(status.ready).toBe(true);
      expect(screen.getByRole("alert")).toHaveTextContent(area);
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        "private credential",
      );
      expect(api.match.homeScore).toBe(2);
      await act(async () => {
        await expect(
          retained.setPerimeterBrightness(50),
        ).rejects.toBeInstanceOf(MutationRejectedError);
      });
      const old = subscriptions.filter((entry) =>
        entry.path.startsWith("states/A/"),
      );
      required.forEach((leaf) => withheld.add(`states/A/${leaf}`));
      act(() => {
        fireEvent.click(
          screen.getByRole("button", { name: "Reyna lestur aftur" }),
        );
      });
      expect(api.writeEligible).toBe(false);
      act(() =>
        old.forEach((entry) => {
          entry.data({ val: () => ({ homeScore: 999 }) } as DataSnapshot);
          entry.error?.(new Error("late"));
        }),
      );
      expect(api.match.homeScore).toBe(2);
      for (const leaf of required.slice(0, -1))
        act(() => emit(`states/A/${leaf}`));
      expect(api.writeEligible).toBe(false);
      act(() => emit("states/A/perimeter"));
      expect(api.writeEligible).toBe(true);
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
      await act(async () => {
        await expect(
          retained.setPerimeterBrightness(50),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        await api.setPerimeterBrightness(60);
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a missing initial delivery at the named deadline, but never times out quiet loaded data", () => {
    vi.useFakeTimers();
    withheld.add("states/A/controller");
    mount();
    expect(status.ready).toBe(false);
    act(() => {
      vi.advanceTimersByTime(INITIAL_DELIVERY_DEADLINE_MS);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("controller");
    act(() => {
      withheld.clear();
      status.retry();
    });
    expect(status.ready).toBe(true);
    act(() => {
      vi.advanceTimersByTime(INITIAL_DELIVERY_DEADLINE_MS * 10);
    });
    expect(status.status.phase).toBe("ready");
  });

  it("cleans partially registered listeners after synchronous cancellation", () => {
    const original = vi.mocked(onValue).getMockImplementation()!;
    vi.mocked(onValue).mockImplementation((reference, callback, cancel) => {
      if (
        String(reference) === "states/A/controller" &&
        typeof cancel === "function"
      )
        cancel(new Error("unavailable"));
      return original(reference, callback, cancel);
    });
    mount();
    expect(status.status.phase).toBe("error");
    expect(
      subscriptions.filter(
        (entry) => entry.active && entry.path.startsWith("states/"),
      ),
    ).toEqual([]);
  });

  it("cleans the attempt when SDK registration throws before returning an unsubscribe", () => {
    const original = vi.mocked(onValue).getMockImplementation()!;
    vi.mocked(onValue).mockImplementation((reference, callback, cancel) => {
      if (String(reference) === "states/A/controller")
        throw new Error("private registration detail");
      return original(reference, callback, cancel);
    });
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("controller");
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "private registration detail",
    );
    expect(
      subscriptions.filter(
        (entry) => entry.active && entry.path.startsWith("states/"),
      ),
    ).toEqual([]);
  });

  it("retains the current playback and its deadline through a same-venue fault/retry", async () => {
    vi.useFakeTimers();
    values.set("states/A/controller", {
      currentAsset: {
        asset: { type: "IMAGE", key: "https://example.test/a.png" },
        time: 10,
        occurrenceId: "occurrence-a",
      },
    });
    mount({ lifecycle: true });
    observedAssets.length = 0;
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    act(() => fail("states/A/view"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(runTransaction).not.toHaveBeenCalled();
    act(() => status.retry());
    expect(
      observedAssets.every(
        (sample) => sample.asset !== null || sample.attempts > 0,
      ),
    ).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(firebaseDatabase.writeAuditOnly).toHaveBeenCalledTimes(1);
    expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
  });
});

describe("scope and optional telemetry", () => {
  it("masks telemetry on a direct UID prop change before layout synchronizes the session", () => {
    const session = new MutationSession({
      location: "A",
      authenticated: true,
      uid: "first",
    });
    const seen: { uid: string; applied: number | null }[] = [];
    function IdentityProbe({ uid }: { uid: string }) {
      const value = usePerimeterTelemetry();
      useLayoutEffect(() => {
        seen.push({
          uid,
          applied: value.brightnessStatus?.appliedPercent ?? null,
        });
      });
      return null;
    }
    const tree = (uid: string) => (
      <FirebaseStateProvider
        listenPrefix="A"
        isAuthenticated
        uid={uid}
        screenKey={null}
        mutationSession={session}
      >
        <IdentityProbe uid={uid} />
      </FirebaseStateProvider>
    );
    const mounted = render(tree("first"));
    expect(seen.some((entry) => entry.applied === 20)).toBe(true);
    withheld.add("perimeter/A/brightnessStatus");
    mounted.rerender(tree("second"));
    expect(
      seen
        .filter((entry) => entry.uid === "second")
        .every((entry) => entry.applied === null),
    ).toBe(true);
  });

  it("masks venue data immediately and rejects late data/errors across batched ABA and logout/login", () => {
    const view = mount();
    const old = [...subscriptions];
    required.forEach((leaf) => withheld.add(`states/A/${leaf}`));
    withheld.add("perimeter/A/brightnessStatus");
    act(() => {
      view.session.setLocation("B");
      view.session.setLocation("A");
    });
    expect(api.match.homeScore).toBe(0);
    expect(api.perimeterBrightness).toBeNull();
    expect(telemetry.brightnessStatus).toBeNull();
    act(() =>
      old
        .filter(
          (entry) =>
            entry.path.startsWith("states/") ||
            entry.path.startsWith("perimeter/"),
        )
        .forEach((entry) => {
          entry.data({ val: () => report(99) } as DataSnapshot);
          entry.error?.(new Error("late"));
        }),
    );
    expect(telemetry.brightnessStatus).toBeNull();
    expect(status.status.phase).toBe("loading");
    act(() => {
      view.session.setAuth(false);
      view.session.setAuth(true, "operator");
    });
    expect(api.writeEligible).toBe(false);
    expect(telemetry.brightnessStatus).toBeNull();
    view.rerender("A", false);
    expect(
      subscriptions.filter(
        (entry) =>
          entry.active && entry.path === "perimeter/A/brightnessStatus",
      ),
    ).toHaveLength(0);
  });

  it("keeps optional telemetry faults out of match readiness, identity and metadata", () => {
    mount();
    const before = matchApi;
    act(() => fail("perimeter/A/brightnessStatus"));
    expect(telemetry.status.phase).toBe("error");
    expect(telemetry.brightnessStatus).toBeNull();
    expect(api.writeEligible).toBe(true);
    expect(status.ready).toBe(true);
    expect(matchApi).toBe(before);
    expect(metadata.status.phase).toBe("ready");
  });

  it("makes metadata errors independently retryable and treats null as loaded empty", () => {
    mount();
    act(() => fail("locations"));
    expect(screen.getByRole("alert")).toHaveTextContent("staðsetningar");
    expect(api.writeEligible).toBe(true);
    act(() => metadata.retry());
    expect(metadata.status.phase).toBe("ready");
    expect(api.listeners.venues).toEqual({});
  });
});
