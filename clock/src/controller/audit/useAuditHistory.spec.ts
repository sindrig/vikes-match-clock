import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { get, onValue } from "firebase/database";
import type { DataSnapshot } from "firebase/database";
import { useAuditHistory, RECENT_EVENT_LIMIT } from "./useAuditHistory";

vi.mock("firebase/database", () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  query: vi.fn((...constraints: unknown[]) => ({ constraints })),
  limitToLast: vi.fn((n: number) => ({ kind: "limitToLast", value: n })),
  orderByChild: vi.fn((key: string) => ({ kind: "orderByChild", value: key })),
  endAt: vi.fn((value: number) => ({ kind: "endAt", value })),
  onValue: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../../firebase", () => ({
  database: {},
}));

const onValueMock = vi.mocked(onValue);
const getMock = vi.mocked(get);

interface MockSnapshot {
  val: () => Record<string, unknown> | null;
}

const makeSnapshot = (data: Record<string, unknown> | null): MockSnapshot => ({
  val: () => data,
});

const makeEventRecord = (
  timestamp: number,
  uid: string,
  id: string,
): Record<string, unknown> => ({
  timestamp,
  uid,
  sessionId: `session-${id}`,
  action: "match.update",
  stateArea: "match",
  changes: { started: timestamp },
});

const makeEvents = (
  count: number,
  startTimestamp: number,
  idPrefix: string,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    const id = `${idPrefix}${i}`;
    data[id] = makeEventRecord(startTimestamp + i, `operator-${i}`, id);
  }
  return data;
};

const deliverLive = (data: Record<string, unknown> | null): void => {
  onValueMock.mockImplementation((_historyRef, callback) => {
    callback(makeSnapshot(data) as unknown as DataSnapshot);
    return () => undefined;
  });
};

describe("useAuditHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliverLive(null);
    getMock.mockResolvedValue(makeSnapshot({}) as unknown as DataSnapshot);
  });

  it("removes the timestamp-cursor overlap and appends older events newest first", async () => {
    const live = makeEvents(RECENT_EVENT_LIMIT, 100, "e");
    deliverLive(live);

    const { result } = renderHook(() => useAuditHistory("venue-a", true));

    expect(result.current.hasOlder).toBe(true);
    expect(result.current.events[0].id).toBe("e49");
    expect(result.current.events[result.current.events.length - 1].id).toBe(
      "e0",
    );

    // The older query echoes the cursor record (inclusive endAt), a duplicate
    // of a live event, a same-timestamp peer, and genuinely older events.
    getMock.mockResolvedValue(
      makeSnapshot({
        e0: live.e0,
        e5: live.e5,
        peer: makeEventRecord(100, "operator-peer", "peer"),
        o1: makeEventRecord(90, "operator-o1", "o1"),
        o0: makeEventRecord(80, "operator-o0", "o0"),
      }) as unknown as DataSnapshot,
    );

    await act(async () => {
      result.current.loadOlder();
      await Promise.resolve();
    });

    // The older query used the oldest visible timestamp as an inclusive
    // cursor.
    const olderQuery = getMock.mock.calls[0][0] as unknown as {
      constraints: unknown[];
    };
    const endAtConstraint = olderQuery.constraints[2] as {
      value: number;
    };
    expect(endAtConstraint.value).toBe(100);

    // The cursor overlap in the fetched batch is removed by id, duplicates
    // are dropped, and the same-timestamp peer plus older events are appended
    // newest first. The cursor itself stays exactly once (from the live batch).
    const ids = result.current.events.map((event) => event.id);
    expect(ids.filter((id) => id === "e0")).toHaveLength(1);
    expect(ids.filter((id) => id === "e5")).toHaveLength(1);
    expect(ids).toEqual([
      ...Array.from(
        { length: RECENT_EVENT_LIMIT - 1 },
        (_, i) => `e${RECENT_EVENT_LIMIT - 1 - i}`,
      ),
      "e0",
      "peer",
      "o1",
      "o0",
    ]);
  });

  it("marks history exhausted when an older batch does not reach the limit", async () => {
    deliverLive(makeEvents(RECENT_EVENT_LIMIT, 100, "e"));

    const { result } = renderHook(() => useAuditHistory("venue-a", true));
    expect(result.current.hasOlder).toBe(true);

    // Only the cursor record remains below it: history is exhausted.
    getMock.mockResolvedValue(
      makeSnapshot({
        e0: makeEventRecord(100, "operator-0", "e0"),
      }) as unknown as DataSnapshot,
    );

    await act(async () => {
      result.current.loadOlder();
      await Promise.resolve();
    });

    expect(result.current.hasOlder).toBe(false);
    expect(result.current.events).toHaveLength(RECENT_EVENT_LIMIT);
  });

  it("does not fetch older events once history is exhausted", async () => {
    deliverLive(makeEvents(3, 100, "e"));

    const { result } = renderHook(() => useAuditHistory("venue-a", true));
    expect(result.current.hasOlder).toBe(false);

    await act(async () => {
      result.current.loadOlder();
      await Promise.resolve();
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it("resets pagination when the active venue changes", async () => {
    let liveData: Record<string, unknown> | null = makeEvents(
      RECENT_EVENT_LIMIT,
      100,
      "A",
    );
    onValueMock.mockImplementation((_historyRef, callback) => {
      callback(makeSnapshot(liveData) as unknown as DataSnapshot);
      return () => undefined;
    });
    getMock.mockResolvedValue(
      makeSnapshot({
        Aolder: makeEventRecord(50, "operator-older", "Aolder"),
      }) as unknown as DataSnapshot,
    );

    const { result, rerender } = renderHook(
      ({ location, enabled }: { location: string; enabled: boolean }) =>
        useAuditHistory(location, enabled),
      { initialProps: { location: "venue-a", enabled: true } },
    );

    expect(result.current.hasOlder).toBe(true);

    await act(async () => {
      result.current.loadOlder();
      await Promise.resolve();
    });

    // Loaded older events are retained for the current venue.
    expect(result.current.events[result.current.events.length - 1].id).toBe(
      "Aolder",
    );

    // Switching venue drops the previous newest and loaded older batches.
    liveData = makeEvents(3, 100, "B");
    rerender({ location: "venue-b", enabled: true });

    expect(result.current.events).toHaveLength(3);
    expect(
      result.current.events.every((event) => event.id?.startsWith("B")),
    ).toBe(true);
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.loadingOlder).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns an empty state and does not subscribe while closed", () => {
    onValueMock.mockClear();

    const { result } = renderHook(() => useAuditHistory("venue-a", false));

    expect(result.current.events).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.loadingOlder).toBe(false);
    expect(onValueMock).not.toHaveBeenCalled();
  });
});
