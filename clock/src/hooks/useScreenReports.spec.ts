import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useScreenReports from "./useScreenReports";

type ValueCallback = (snap: {
  exists: () => boolean;
  val: () => unknown;
}) => void;

vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  onValue: vi.fn(),
}));

import { ref, onValue } from "firebase/database";

const mockedOnValue = onValue as unknown as Mock;
let reportCallback: ValueCallback | null = null;

const deliver = (value: unknown) => {
  reportCallback?.({
    exists: () => value != null,
    val: () => value,
  });
};

describe("useScreenReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportCallback = null;
    mockedOnValue.mockImplementation(
      (_ref: unknown, callback: ValueCallback) => {
        reportCallback = callback;
        return () => undefined;
      },
    );
  });

  it("returns no entries without a listenPrefix", () => {
    const { result } = renderHook(() => useScreenReports(""));
    expect(result.current).toEqual([]);
    expect(mockedOnValue).not.toHaveBeenCalled();
  });

  it("subscribes to the presence path for the venue", () => {
    renderHook(() => useScreenReports("vikuti"));
    expect(ref).toHaveBeenCalledWith(expect.anything(), "presence/vikuti");
    expect(mockedOnValue).toHaveBeenCalledTimes(1);
  });

  it("returns parsed entries sorted by label", async () => {
    const { result } = renderHook(() => useScreenReports("vikuti"));

    deliver({
      "conn-b": {
        connectedAt: 100,
        displayKind: "perimeter",
        label: "Skjár ZZZZ",
        error: "Deck failed",
        errorAt: 150,
      },
      "conn-a": {
        connectedAt: 200,
        displayKind: "perimeter",
        label: "Skjár AAAA",
        resolution: "3840x1080",
        lastHeartbeat: 260,
      },
    });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((entry) => entry.label)).toEqual([
      "Skjár AAAA",
      "Skjár ZZZZ",
    ]);
    expect(result.current[1]).toMatchObject({
      connectionId: "conn-b",
      displayKind: "perimeter",
      label: "Skjár ZZZZ",
      error: "Deck failed",
      errorAt: 150,
      connectedAt: 100,
      lastHeartbeat: 0,
    });
    expect(result.current[0]).toMatchObject({
      connectionId: "conn-a",
      resolution: "3840x1080",
      lastHeartbeat: 260,
    });
  });

  it("defaults missing displayKind to scoreboard and drops malformed records", async () => {
    const { result } = renderHook(() => useScreenReports("vikuti"));

    deliver({
      legacy: { connectedAt: 100 },
      broken: { label: "no timestamp" },
      junk: "not-an-object",
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      connectionId: "legacy",
      displayKind: "scoreboard",
      label: "",
      error: "",
    });
  });

  it("clears entries when the presence node is removed", async () => {
    const { result } = renderHook(() => useScreenReports("vikuti"));

    deliver({
      "conn-1": { connectedAt: 100, displayKind: "perimeter" },
    });
    await waitFor(() => expect(result.current).toHaveLength(1));

    deliver(null);
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("clears entries when the venue is unset after having one", async () => {
    const { result, rerender } = renderHook(
      ({ prefix }: { prefix: string }) => useScreenReports(prefix),
      { initialProps: { prefix: "vikuti" } },
    );

    deliver({
      "conn-1": { connectedAt: 100, displayKind: "perimeter" },
    });
    await waitFor(() => expect(result.current).toHaveLength(1));

    rerender({ prefix: "" });
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
