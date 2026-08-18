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

const getAuditPaths = (
  updates: Record<string, unknown>,
  prefix: string,
): string[] => Object.keys(updates).filter((key) => key.startsWith(prefix));

// Rebuilds an audit event object from the flattened leaf paths written by
// writeAuditedState, e.g. audit/vikuti/<eventId>/changes -> event. The
// `changes` leaf is a JSON string and is decoded back to an object.
const getAuditEvent = (
  updates: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> => {
  const event: Record<string, unknown> = {};
  for (const key of getAuditPaths(updates, prefix)) {
    const suffix = key.slice(prefix.length + 1);
    const slash = suffix.indexOf("/");
    const field = slash < 0 ? suffix : suffix.slice(slash + 1);
    const firstSlash = field.indexOf("/");
    if (firstSlash < 0) {
      const value = updates[key];
      event[field] =
        field === "changes" && typeof value === "string"
          ? (JSON.parse(value) as Record<string, unknown>)
          : value;
      continue;
    }
    const group = field.slice(0, firstSlash);
    const sub = field.slice(firstSlash + 1);
    const node = (event[group] as Record<string, unknown> | undefined) ?? {};
    node[sub] = updates[key];
    event[group] = node;
  }
  return event;
};

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
    expect(updates["states/vikuti/match/homeScore"]).toEqual(1);

    const event = getAuditEvent(updates, "audit/vikuti");
    expect(event).toEqual({
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
    expect(updates["states/vikuti/perimeter/overlay"]).toEqual(null);
    const event = getAuditEvent(updates, "audit/vikuti");
    expect(event).toEqual({
      timestamp: 1700000000000,
      uid: "uid-1",
      sessionId: "session-1",
      action: "perimeter.clear-overlay",
      stateArea: "perimeter",
      changes: { overlay: null },
    });
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
    expect(
      updates[
        "states/vikuti/perimeter/mediaPairs/11111111-1111-4111-8111-111111111111"
      ],
    ).toEqual(null);
    const event = getAuditEvent(updates, "audit/vikuti");
    expect(event).toEqual({
      timestamp: 1700000000000,
      uid: "uid-1",
      sessionId: "session-1",
      action: "perimeter.delete-media-pair",
      stateArea: "perimeter",
      changes: {
        "mediaPairs/11111111-1111-4111-8111-111111111111": null,
      },
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
    expect(updates[`states/${prefix}/clubOverrides/${id}`]).toEqual(override);
    expect(getAuditPaths(updates, `audit/${prefix}`)).toHaveLength(6);
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
    expect(updates[`states/${prefix}/clubOverrides/${id}`]).toEqual(override);
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
    expect(updates["states/test/clubOverrides/id1"]).toEqual(override);
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
    expect(updates[`states/${prefix}/clubOverrides/${id}`]).toEqual(null);
    expect(getAuditPaths(updates, `audit/${prefix}`)).toHaveLength(6);

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
