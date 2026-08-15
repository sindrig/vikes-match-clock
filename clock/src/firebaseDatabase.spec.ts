import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveClubOverride,
  deleteClubOverride,
  generateClubOverrideId,
  writeAuditedState,
  AuditEventPayload,
} from "./firebaseDatabase";
import type { ClubOverride } from "./types";

// Mock Firebase database
vi.mock("firebase/database", () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  update: vi.fn() as Mock,
  remove: vi.fn() as Mock,
  set: vi.fn() as Mock,
  onValue: vi.fn(),
  off: vi.fn(),
  serverTimestamp: vi.fn(() => 1700000000000),
  DatabaseReference: {},
}));

// Mock Firebase storage helpers
vi.mock("./firebase", () => ({
  database: {},
  storageHelpers: {
    deleteObject: vi.fn(),
  },
  app: {},
  auth: {},
  functions: {},
  storage: {},
}));

const audit: AuditEventPayload = {
  uid: "uid-123",
  sessionId: "session-abc",
  action: "clubOverrides.save",
  stateArea: "clubOverrides",
};

const getUpdates = async (): Promise<Record<string, unknown>> => {
  const database = await import("firebase/database");
  const update = database.update as Mock;
  const call = update.mock.calls[0];
  return call[1] as Record<string, unknown>;
};

const getAuditPaths = (updates: Record<string, unknown>): string[] =>
  Object.keys(updates).filter((key) => key.startsWith("audit/"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("writeAuditedState", () => {
  it("writes state paths and an audit event in one root-level update", async () => {
    const database = await import("firebase/database");
    const update = database.update as Mock;

    await writeAuditedState(
      "vikuti",
      "match",
      { homeScore: 1 },
      {
        uid: "uid-1",
        sessionId: "session-1",
        action: "match.add-goal",
        stateArea: "match",
      },
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));

    const updates = update.mock.calls[0][1] as Record<string, unknown>;
    expect(updates["states/vikuti/match"]).toEqual({ homeScore: 1 });

    const auditPaths = Object.keys(updates).filter((key) =>
      key.startsWith("audit/vikuti/"),
    );
    expect(auditPaths).toHaveLength(1);
    expect(updates[auditPaths[0]]).toEqual({
      timestamp: 1700000000000,
      uid: "uid-1",
      sessionId: "session-1",
      action: "match.add-goal",
      stateArea: "match",
      changes: { homeScore: 1 },
    });
  });

  it("records null deletions in the changes map", async () => {
    const database = await import("firebase/database");
    const update = database.update as Mock;

    await writeAuditedState(
      "vikuti",
      "perimeter",
      { overlay: null },
      {
        uid: "uid-1",
        sessionId: "session-1",
        action: "perimeter.clear-overlay",
        stateArea: "perimeter",
      },
    );

    const updates = update.mock.calls[0][1] as Record<string, unknown>;
    expect(updates["states/vikuti/perimeter"]).toEqual({ overlay: null });
    const auditPaths = getAuditPaths(updates);
    const event = updates[auditPaths[0]] as Record<string, unknown>;
    expect(event.changes).toEqual({ overlay: null });
  });

  it("writes nested media-pair paths with deletions for removals", async () => {
    const database = await import("firebase/database");
    const update = database.update as Mock;

    await writeAuditedState(
      "vikuti",
      "perimeter",
      {
        "mediaPairs/11111111-1111-4111-8111-111111111111": null,
      },
      {
        uid: "uid-1",
        sessionId: "session-1",
        action: "perimeter.delete-media-pair",
        stateArea: "perimeter",
      },
    );

    const updates = update.mock.calls[0][1] as Record<string, unknown>;
    expect(updates["states/vikuti/perimeter"]).toEqual({
      "mediaPairs/11111111-1111-4111-8111-111111111111": null,
    });
  });
});

describe("saveClubOverride", () => {
  it("writes the override and audit event atomically", async () => {
    const prefix = "vikinni";
    const id = "test-uuid-123";
    const override: ClubOverride = {
      name: "Víkingur R",
      clubId: "2492",
      logoUrl: "https://example.com/logo.png",
      isOverride: true,
    };

    await saveClubOverride(prefix, id, override, audit);

    const updates = await getUpdates();
    expect(updates[`states/${prefix}/clubOverrides`]).toEqual({
      [id]: override,
    });

    const auditPaths = getAuditPaths(updates);
    expect(auditPaths).toHaveLength(1);
    expect(auditPaths[0]).toMatch(new RegExp(`^audit/${prefix}/`));
  });

  it("constructs correct path with different prefix", async () => {
    const prefix = "hasteinsvollur";
    const id = "another-uuid";
    const override: ClubOverride = {
      name: "Test Club",
      clubId: "999",
      logoUrl: "https://example.com/test.png",
      isOverride: false,
    };

    await saveClubOverride(prefix, id, override, audit);

    const updates = await getUpdates();
    expect(updates[`states/${prefix}/clubOverrides`]).toEqual({
      [id]: override,
    });
  });

  it("writes all override properties correctly", async () => {
    const override: ClubOverride = {
      name: "Custom Club",
      clubId: "-1",
      logoUrl: "https://storage.example.com/custom-logo.png",
      isOverride: false,
    };

    await saveClubOverride("test", "id1", override, audit);

    const updates = await getUpdates();
    expect(updates["states/test/clubOverrides"]).toEqual({
      id1: override,
    });
  });
});

describe("deleteClubOverride", () => {
  it("removes from both RTDB and Storage", async () => {
    const prefix = "vikinni";
    const id = "uuid-to-delete";

    await deleteClubOverride(prefix, id, {
      uid: "uid-123",
      sessionId: "session-abc",
      action: "clubOverrides.delete",
      stateArea: "clubOverrides",
    });

    const updates = await getUpdates();
    expect(updates[`states/${prefix}/clubOverrides`]).toEqual({
      [id]: null,
    });
    expect(getAuditPaths(updates)).toHaveLength(1);

    const { storageHelpers } = await import("./firebase");
    expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
      `${prefix}/club-logos/${id}`,
    );
  });

  it("constructs correct Storage path", async () => {
    await deleteClubOverride("production", "logo-xyz", audit);

    const { storageHelpers } = await import("./firebase");
    expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
      "production/club-logos/logo-xyz",
    );
  });
});

describe("generateClubOverrideId", () => {
  it("returns a string", () => {
    const id = generateClubOverrideId();
    expect(typeof id).toBe("string");
  });

  it("generates valid UUID v4 format", () => {
    const id = generateClubOverrideId();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it("generates unique IDs", () => {
    const id1 = generateClubOverrideId();
    const id2 = generateClubOverrideId();
    expect(id1).not.toBe(id2);
  });
});
