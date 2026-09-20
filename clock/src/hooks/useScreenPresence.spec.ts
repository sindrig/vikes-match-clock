import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useScreenPresence, {
  ScreenPresenceDiagnostics,
} from "./useScreenPresence";

const disconnectHandler = vi.hoisted(() => ({ remove: vi.fn() }));

vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  push: vi.fn((parent: { path: string }) => ({ ...parent, key: "conn-1" })),
  set: vi.fn(),
  update: vi.fn(),
  onDisconnect: vi.fn(() => disconnectHandler),
  onValue: vi.fn(),
  serverTimestamp: vi.fn(() => 1_700_000_000_000),
  off: vi.fn(),
}));

import {
  ref,
  push,
  set,
  update,
  onDisconnect,
  onValue,
  serverTimestamp,
} from "firebase/database";

const mockedOnValue = onValue as unknown as Mock;
const mockedPush = push as unknown as Mock;
const mockedSet = set as unknown as Mock;
const mockedUpdate = update as unknown as Mock;
const mockedOnDisconnect = onDisconnect as unknown as Mock;

// Captures the `.info/connected` callback so tests can simulate connect and
// disconnect transitions.
type ConnectedCallback = (snap: { val: () => unknown }) => void;
let connectedCallback: ConnectedCallback | null = null;

const connect = () => {
  connectedCallback?.({ val: () => true });
};
const disconnect = () => {
  connectedCallback?.({ val: () => false });
};

const diagnostics = (
  error: string | null,
  label = "Skjár ABCD",
  resolution = "1920x1080",
): ScreenPresenceDiagnostics => ({ error, label, resolution });

describe("useScreenPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    connectedCallback = null;
    mockedOnValue.mockImplementation(
      (_infoRef: unknown, callback: ConnectedCallback) => {
        connectedCallback = callback;
        return () => undefined;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing without a listenPrefix", () => {
    renderHook(() => useScreenPresence("", "perimeter"));
    expect(mockedOnValue).not.toHaveBeenCalled();
  });

  it("writes presence with displayKind and diagnostics on connect", () => {
    renderHook(() =>
      useScreenPresence("vikuti", "perimeter", diagnostics(null)),
    );

    connect();

    expect(mockedPush).toHaveBeenCalledTimes(1);
    expect(mockedOnDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ key: "conn-1" }),
    );
    expect(disconnectHandler.remove).toHaveBeenCalled();
    expect(mockedSet).toHaveBeenCalledWith(expect.anything(), {
      connectedAt: 1_700_000_000_000,
      displayKind: "perimeter",
      label: "Skjár ABCD",
      resolution: "1920x1080",
    });
  });

  it("omits empty label and resolution and includes the error with errorAt", () => {
    renderHook(() =>
      useScreenPresence(
        "vikuti",
        "perimeter",
        diagnostics("Deck failed", "", ""),
      ),
    );

    connect();

    expect(mockedSet).toHaveBeenCalledWith(expect.anything(), {
      connectedAt: 1_700_000_000_000,
      displayKind: "perimeter",
      error: "Deck failed",
      errorAt: 1_700_000_000_000,
    });
  });

  it("truncates over-long error messages", () => {
    renderHook(() =>
      useScreenPresence("vikuti", "perimeter", diagnostics("x".repeat(400))),
    );

    connect();

    const payload = mockedSet.mock.calls[0][1] as Record<string, unknown>;
    expect((payload.error as string).length).toBe(300);
  });

  it("merges an error into the live record when the error changes", () => {
    const { rerender } = renderHook(
      ({ error }: { error: string | null }) =>
        useScreenPresence("vikuti", "perimeter", diagnostics(error)),
      { initialProps: { error: null as string | null } },
    );

    connect();
    mockedUpdate.mockClear();

    rerender({ error: "Media missing" });

    expect(mockedUpdate).toHaveBeenCalledWith(expect.anything(), {
      error: "Media missing",
      errorAt: 1_700_000_000_000,
    });
  });

  it("clears the error fields when the error resolves to null", () => {
    const { rerender } = renderHook(
      ({ error }: { error: string | null }) =>
        useScreenPresence("vikuti", "perimeter", diagnostics(error)),
      { initialProps: { error: "Media missing" } },
    );

    connect();
    mockedUpdate.mockClear();

    rerender({ error: null });

    expect(mockedUpdate).toHaveBeenCalledWith(expect.anything(), {
      error: null,
      errorAt: null,
    });
  });

  it("does not write an error change while offline, and includes it on reconnect", () => {
    const { rerender } = renderHook(
      ({ error }: { error: string | null }) =>
        useScreenPresence("vikuti", "perimeter", diagnostics(error)),
      { initialProps: { error: null as string | null } },
    );

    connect();
    disconnect();
    mockedUpdate.mockClear();
    mockedSet.mockClear();

    rerender({ error: "Media missing" });
    expect(mockedUpdate).not.toHaveBeenCalled();

    connect();

    // Reconnect creates a fresh presence record carrying the current error.
    expect(mockedPush).toHaveBeenCalledTimes(2);
    expect(mockedSet).toHaveBeenCalledWith(expect.anything(), {
      connectedAt: 1_700_000_000_000,
      displayKind: "perimeter",
      label: "Skjár ABCD",
      resolution: "1920x1080",
      error: "Media missing",
      errorAt: 1_700_000_000_000,
    });
  });

  it("refreshes lastHeartbeat once per minute while connected", () => {
    renderHook(() =>
      useScreenPresence("vikuti", "perimeter", diagnostics(null)),
    );

    connect();
    mockedUpdate.mockClear();

    vi.advanceTimersByTime(59_999);
    expect(mockedUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockedUpdate).toHaveBeenCalledWith(expect.anything(), {
      lastHeartbeat: 1_700_000_000_000,
    });
  });

  it("stops the heartbeat and removes the record on unmount", () => {
    const { unmount } = renderHook(() =>
      useScreenPresence("vikuti", "perimeter", diagnostics(null)),
    );

    connect();
    unmount();

    expect(mockedSet).toHaveBeenLastCalledWith(expect.anything(), null);

    mockedUpdate.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("stops the heartbeat when the connection drops and resumes on reconnect", () => {
    renderHook(() =>
      useScreenPresence("vikuti", "perimeter", diagnostics(null)),
    );

    connect();
    disconnect();
    mockedUpdate.mockClear();

    vi.advanceTimersByTime(120_000);
    expect(mockedUpdate).not.toHaveBeenCalled();

    connect();
    vi.advanceTimersByTime(60_000);
    expect(mockedUpdate).toHaveBeenCalledWith(expect.anything(), {
      lastHeartbeat: 1_700_000_000_000,
    });
  });

  it("uses the scoreboard display kind by default", () => {
    renderHook(() => useScreenPresence("vikinni"));

    connect();

    expect(mockedSet).toHaveBeenCalledWith(expect.anything(), {
      connectedAt: 1_700_000_000_000,
      displayKind: "scoreboard",
    });
    expect(ref).toHaveBeenCalledWith(expect.anything(), "presence/vikinni");
    expect(serverTimestamp).toHaveBeenCalled();
  });
});
