import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

// --- Mock firebase-admin ---
const mockSet = vi.fn();
let currentPath = "";
let requestReadCount = 0;
let snapshotFor: (path: string, readCount: number) => unknown = () => null;

const mockSave = vi.fn();
const mockExists = vi.fn();
const mockDownload = vi.fn();

// The active storage bucket the module reads `bucket.name` from when building
// emitted source URLs. Mutated by tests to simulate a non-production
// deployment (e.g. staging).
const mockBucketState = { name: "vikes-match-clock-firebase.appspot.com" };

vi.mock("firebase-admin", () => {
  const mockDb = {
    ref: (...args: unknown[]) => {
      currentPath = String(args[0]);
      return {
        once: async () => {
          const isRequestPath = currentPath.startsWith("states/");
          if (isRequestPath) requestReadCount += 1;
          return { val: () => snapshotFor(currentPath, requestReadCount) };
        },
        set: (value: unknown) => mockSet(currentPath, value),
      };
    },
  };
  const mockDatabase = vi.fn(() => mockDb);
  Object.assign(mockDatabase, {
    ServerValue: {
      TIMESTAMP: { ".sv": "timestamp" },
    },
  });
  const bucketFile = vi.fn((path: string) => ({
    exists: async () => mockExists(path),
    download: async () => [mockDownload(path)],
    save: async (buffer: Buffer, opts?: unknown) =>
      mockSave(path, buffer, opts),
  }));
  const admin = {
    apps: [],
    initializeApp: vi.fn(),
    database: mockDatabase,
    storage: vi.fn(() => ({
      bucket: vi.fn(() => ({
        get name() {
          return mockBucketState.name;
        },
        file: bucketFile,
      })),
    })),
  };
  return {
    __esModule: true,
    default: admin,
    ...admin,
  };
});

// --- Shared handler storage for onCall ---
let sharedOnCallHandler:
  | ((request: {
      data: unknown;
      auth?: { uid: string; token?: { email?: string } };
    }) => Promise<unknown>)
  | undefined;

// --- Mock firebase-functions ---
vi.mock("firebase-functions", () => {
  const HttpsError = class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  };
  return {
    default: {},
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    https: { HttpsError },
  };
});

vi.mock("firebase-functions/v2/https", () => {
  return {
    onCall: (
      handler: (request: {
        data: unknown;
        auth?: { uid: string; token?: { email?: string } };
      }) => Promise<unknown>,
    ) => {
      const wrappedHandler = (
        dataOrRequest: unknown,
        context?: { auth?: { uid: string; token?: { email?: string } } },
      ) => {
        if (context !== undefined) {
          return handler({ data: dataOrRequest, auth: context.auth });
        }
        return handler(
          dataOrRequest as {
            data: unknown;
            auth?: { uid: string; token?: { email?: string } };
          },
        );
      };
      sharedOnCallHandler = wrappedHandler;
      return wrappedHandler;
    },
    get __onCallHandler() {
      return sharedOnCallHandler;
    },
  };
});

type CallableHandler = (
  data: unknown,
  context: { auth?: { uid: string; token?: { email?: string } } },
) => Promise<unknown>;

let handler: CallableHandler;

const GEOMETRY = {
  revision: "geom-rev-1",
  targets: [
    {
      layerId: "2",
      label: "48 skjáir",
      targetFolder: "48",
      width: 4608,
      height: 192,
    },
    {
      layerId: "4",
      label: "40 skjáir",
      targetFolder: "40",
      width: 3840,
      height: 192,
    },
  ],
};

const REQUEST = {
  jobId: "job-123",
  players: [{ id: "10", name: "Jón", number: 7 }],
};

function controllerContext(uid = "uid-1") {
  return { auth: { uid, token: { email: "op@example.com" } } };
}

async function makeSourcePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 150,
      channels: 3,
      background: { r: 30, g: 120, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

function lastStatusWrite(): { path: string; doc: Record<string, unknown> } {
  const statusWrites = mockSet.mock.calls.filter(
    ([path]) => String(path) === "perimeter/vikuti/goalScorerPreparation",
  );
  expect(statusWrites.length).toBeGreaterThan(0);
  const last = statusWrites[statusWrites.length - 1];
  return { path: String(last[0]), doc: last[1] as Record<string, unknown> };
}

beforeEach(async () => {
  vi.clearAllMocks();
  requestReadCount = 0;
  mockBucketState.name = "vikes-match-clock-firebase.appspot.com";

  if (!handler) {
    await import("../goalScorerPreparation");
    const mod = await import("firebase-functions/v2/https");
    handler = (mod as unknown as { __onCallHandler: CallableHandler })
      .__onCallHandler;
  }

  // Default: geometry published, current request, no celebration/crest assets,
  // caller has location access.
  snapshotFor = (path: string) => {
    if (path === "admins/uid-1") return false;
    if (path === "auth/uid-1/vikuti") return true;
    if (path === "states/vikuti/perimeter/goalScorerPreparation")
      return REQUEST;
    if (path === "perimeter/vikuti/overlayGeometry") return GEOMETRY;
    if (path === "perimeter/vikuti/goalScorerPreparation") return null;
    return null;
  };

  mockSet.mockResolvedValue(undefined);
  mockExists.mockImplementation((path: string) =>
    path.endsWith("-fagn.png") ? [true] : [false],
  );
  mockDownload.mockResolvedValue(await makeSourcePng());
  mockSave.mockResolvedValue(undefined);
});

describe("prepareGoalScorerMedia", () => {
  it("rejects an unauthenticated caller", async () => {
    await expect(
      handler({ location: "vikuti", jobId: "job-1", players: [] }, {}),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects a caller without location access", async () => {
    snapshotFor = (path: string) => {
      if (path === "admins/uid-1") return false;
      if (path === "auth/uid-1/vikuti") return false;
      return null;
    };
    await expect(
      handler(
        { location: "vikuti", jobId: "job-1", players: [] },
        controllerContext(),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("accepts an admin caller without a location record", async () => {
    snapshotFor = (path: string) => {
      if (path === "admins/uid-admin") return true;
      if (path === "states/vikuti/perimeter/goalScorerPreparation")
        return REQUEST;
      if (path === "perimeter/vikuti/overlayGeometry") return GEOMETRY;
      return null;
    };
    const result = await handler(
      { location: "vikuti", jobId: "job-123", players: [] },
      { auth: { uid: "uid-admin", token: {} } },
    );
    expect(result).toEqual({ started: true });
  });

  it("rejects an invalid location", async () => {
    await expect(
      handler(
        { location: "bad/location!", jobId: "job-1", players: [] },
        controllerContext(),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an invalid jobId", async () => {
    await expect(
      handler(
        { location: "vikuti", jobId: "has/slash", players: [] },
        controllerContext(),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects players that are not an array", async () => {
    await expect(
      handler(
        { location: "vikuti", jobId: "job-1", players: "nope" },
        controllerContext(),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("fails safely when no geometry is published", async () => {
    snapshotFor = (path: string) => {
      if (path === "admins/uid-1") return false;
      if (path === "auth/uid-1/vikuti") return true;
      if (path === "states/vikuti/perimeter/goalScorerPreparation")
        return REQUEST;
      if (path === "perimeter/vikuti/overlayGeometry") return null;
      return null;
    };
    const result = await handler(
      { location: "vikuti", jobId: "job-123", players: [] },
      controllerContext(),
    );
    expect(result).toEqual({ started: false, reason: "no-geometry" });
    const statusWrite = lastStatusWrite();
    expect(statusWrite.path).toBe("perimeter/vikuti/goalScorerPreparation");
    expect(statusWrite.doc.phase).toBe("failed");
    expect(statusWrite.doc.error).toContain("No valid overlay target geometry");
  });

  it("fails with failed-precondition when the stored request is superseded", async () => {
    snapshotFor = (path: string) => {
      if (path === "admins/uid-1") return false;
      if (path === "auth/uid-1/vikuti") return true;
      if (path === "states/vikuti/perimeter/goalScorerPreparation") {
        return { jobId: "job-999", players: [] };
      }
      return null;
    };
    await expect(
      handler(
        { location: "vikuti", jobId: "job-123", players: [] },
        controllerContext(),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("renders personalized media per target and publishes ready results", async () => {
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [{ id: "10", name: "Jón", number: 7 }],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: true });

    // Two target uploads (48 + 40) under the job folder.
    const saves = mockSave.mock.calls.map(([path]) => String(path));
    expect(saves).toHaveLength(2);
    expect(saves[0]).toContain("vikuti/perimeter-overlays/job-123/48/");
    expect(saves[1]).toContain("vikuti/perimeter-overlays/job-123/40/");

    // Final status: ready per player with two files keyed by layer.
    const { doc } = lastStatusWrite();
    expect(doc.phase).toBe("ready");
    expect(doc.readyCount).toBe(1);
    expect(doc.total).toBe(1);
    const player = (doc.players as Record<string, Record<string, unknown>>)[
      "10"
    ];
    expect(player.status).toBe("ready");
    const files = player.files as Record<string, { source: string }>;
    expect(Object.keys(files).sort()).toEqual(["2", "4"]);
    expect(files["2"].source).toContain("/perimeter-overlays/job-123/48/");
    expect(files["4"].source).toContain("/perimeter-overlays/job-123/40/");
    expect(files["2"].source).toContain(
      "gs://vikes-match-clock-firebase.appspot.com/",
    );
  });

  it("emits sources from the active storage bucket", async () => {
    mockBucketState.name = "vikes-match-clock-staging.appspot.com";
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [{ id: "10", name: "Jón", number: 7 }],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: true });

    // Objects were uploaded to the active bucket...
    const saves = mockSave.mock.calls.map(([path]) => String(path));
    expect(saves).toHaveLength(2);
    expect(saves[0]).toContain("vikuti/perimeter-overlays/job-123/48/");
    expect(saves[1]).toContain("vikuti/perimeter-overlays/job-123/40/");

    // ...and the returned source URLs reference that same bucket.
    const { doc } = lastStatusWrite();
    const player = (doc.players as Record<string, Record<string, unknown>>)[
      "10"
    ];
    expect(player.status).toBe("ready");
    const files = player.files as Record<string, { source: string }>;
    expect(files["2"].source).toContain(
      "gs://vikes-match-clock-staging.appspot.com/",
    );
    expect(files["4"].source).toContain(
      "gs://vikes-match-clock-staging.appspot.com/",
    );
    expect(files["2"].source).toContain("/perimeter-overlays/job-123/48/");
  });

  it("uses the crest fallback when the celebration image is absent", async () => {
    mockExists.mockImplementation((path: string) =>
      path.endsWith("crest.png") ? [true] : [false],
    );
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [{ id: "10", name: "Jón", number: 7 }],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: true });
    const { doc } = lastStatusWrite();
    expect(doc.phase).toBe("ready");
    expect(doc.fallbackCount).toBe(1);
    expect(
      (doc.players as Record<string, { status: string }>)["10"].status,
    ).toBe("fallback");
  });

  it("reports a player as unavailable when it has no valid identifier", async () => {
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [{ id: "", name: "Nemandi", number: 99 }],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: true });
    const { doc } = lastStatusWrite();
    expect(doc.phase).toBe("ready");
    expect(doc.unavailableCount).toBe(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("continues processing other players when one fails", async () => {
    // Player 10 has no celebration and no crest -> failed; player 20 succeeds.
    mockExists.mockImplementation((path: string) =>
      path.includes("20") && path.endsWith("-fagn.png") ? [true] : [false],
    );
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [
          { id: "10", name: "Jón", number: 7 },
          { id: "20", name: "Anna", number: 8 },
        ],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: true });
    const { doc } = lastStatusWrite();
    expect(doc.phase).toBe("ready");
    expect(doc.failedCount).toBe(1);
    expect(doc.readyCount).toBe(1);
    const players = doc.players as Record<string, { status: string }>;
    expect(players["10"].status).toBe("failed");
    expect(players["20"].status).toBe("ready");
    // Only the successful player produced uploads.
    expect(mockSave.mock.calls.map(([p]) => String(p))).toHaveLength(2);
  });

  it("does not publish when a stale job is superseded mid-run", async () => {
    // The stored request matches at the start (read 1) but differs on later
    // status-publish checks, simulating a newer request arriving mid-run.
    snapshotFor = (path: string, readCount: number) => {
      if (path === "admins/uid-1") return false;
      if (path === "auth/uid-1/vikuti") return true;
      if (path === "states/vikuti/perimeter/goalScorerPreparation") {
        return readCount <= 1 ? REQUEST : { jobId: "job-999", players: [] };
      }
      if (path === "perimeter/vikuti/overlayGeometry") return GEOMETRY;
      return null;
    };
    mockExists.mockImplementation((path: string) =>
      path.endsWith("-fagn.png") ? [true] : [false],
    );
    const result = await handler(
      {
        location: "vikuti",
        jobId: "job-123",
        players: [{ id: "10", name: "Jón", number: 7 }],
      },
      controllerContext(),
    );
    expect(result).toEqual({ started: false, reason: "superseded" });
    // No final status write happened on the status path.
    const statusWrites = mockSet.mock.calls.filter(
      ([path]) => String(path) === "perimeter/vikuti/goalScorerPreparation",
    );
    expect(statusWrites).toHaveLength(0);
  });
});
