import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLocationsOnce = vi.fn();
const mockUpdate = vi.fn();
const mockRef = vi.fn();
let pagesByLocation: Record<string, Array<unknown>> = {};

vi.mock("firebase-admin", () => {
  const db = { ref: (...args: unknown[]) => mockRef(...args) };
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      database: vi.fn(() => db),
      auth: vi.fn(),
    },
    apps: [],
    initializeApp: vi.fn(),
    database: vi.fn(() => db),
  };
});

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_schedule: string, handler: unknown) => handler,
}));

vi.mock("firebase-functions", () => {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return { default: {}, logger };
});

// Import after mocks are set up
import {
  cleanupExpiredAuditEvents,
  AUDIT_CLEANUP_BATCH_SIZE,
} from "../cleanupAuditLog";

const RETENTION = 90 * 24 * 60 * 60 * 1000;

function makeEvent(timestamp: number): Record<string, unknown> {
  return {
    timestamp,
    uid: "uid-1",
    sessionId: "session-1",
    action: "match.start",
    stateArea: "match",
    changes: { started: timestamp },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pagesByLocation = {};

  mockLocationsOnce.mockResolvedValue({ val: () => null });

  mockRef.mockImplementation((path?: string) => {
    if (path === "audit") {
      return { once: mockLocationsOnce };
    }
    if (path === undefined) {
      return { update: mockUpdate };
    }
    const location = (path as string).replace(/^audit\//, "");
    return {
      orderByChild: () => ({
        endAt: () => ({
          limitToFirst: () => ({
            once: () =>
              Promise.resolve({
                val: () => (pagesByLocation[location] ?? []).shift(),
              }),
          }),
        }),
      }),
    };
  });
});

describe("cleanupExpiredAuditEvents", () => {
  it("deletes records older than the cutoff and retains the boundary record", async () => {
    mockLocationsOnce.mockResolvedValueOnce({
      val: () => ({ vikuti: {} }),
    });
    const cutoff = Date.now() - RETENTION;
    pagesByLocation.vikuti = [
      {
        old1: makeEvent(cutoff - 1000),
        old2: makeEvent(cutoff - 5000),
        boundary: makeEvent(cutoff),
      },
      { boundary: makeEvent(cutoff) },
    ];

    const deleted = await cleanupExpiredAuditEvents(cutoff);

    expect(deleted).toBe(2);
    expect(mockUpdate).toHaveBeenCalledWith({
      "audit/vikuti/old1": null,
      "audit/vikuti/old2": null,
    });
  });

  it("retains records that are exactly 90 days old (not strictly older)", async () => {
    mockLocationsOnce.mockResolvedValueOnce({
      val: () => ({ vikuti: {} }),
    });
    const cutoff = Date.now() - RETENTION;
    pagesByLocation.vikuti = [
      {
        justOldEnough: makeEvent(cutoff),
        newer: makeEvent(cutoff + 1),
      },
    ];

    const deleted = await cleanupExpiredAuditEvents(cutoff);

    expect(deleted).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("paginates through large backlogs in bounded batches", async () => {
    mockLocationsOnce.mockResolvedValueOnce({
      val: () => ({ vikuti: {} }),
    });
    const cutoff = Date.now() - RETENTION;

    const page1: Record<string, unknown> = {};
    for (let i = 0; i < AUDIT_CLEANUP_BATCH_SIZE; i++) {
      page1[`e-${i}`] = makeEvent(cutoff - 1 - i);
    }
    const page2: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      page2[`f-${i}`] = makeEvent(cutoff - 1 - i);
    }
    pagesByLocation.vikuti = [page1, page2, undefined];

    const deleted = await cleanupExpiredAuditEvents(cutoff);

    expect(deleted).toBe(AUDIT_CLEANUP_BATCH_SIZE + 50);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there is no audit data", async () => {
    const deleted = await cleanupExpiredAuditEvents(Date.now());

    expect(deleted).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("processes every venue and retries safely (re-deleting is harmless)", async () => {
    mockLocationsOnce.mockResolvedValueOnce({
      val: () => ({ vikuti: {}, krvollur: {} }),
    });
    const cutoff = Date.now() - RETENTION;
    pagesByLocation.vikuti = [{ gone: makeEvent(cutoff - 10) }];
    pagesByLocation.krvollur = [{ goneToo: makeEvent(cutoff - 20) }];

    const deleted = await cleanupExpiredAuditEvents(cutoff);

    expect(deleted).toBe(2);
    expect(mockUpdate).toHaveBeenCalledWith({ "audit/vikuti/gone": null });
    expect(mockUpdate).toHaveBeenCalledWith({ "audit/krvollur/goneToo": null });

    // A second run finds nothing left — no throw, no extra writes.
    vi.clearAllMocks();
    mockLocationsOnce.mockResolvedValueOnce({ val: () => null });
    const secondRun = await cleanupExpiredAuditEvents(cutoff);
    expect(secondRun).toBe(0);
  });
});
