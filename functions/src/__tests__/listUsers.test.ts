import { describe, it, expect, vi, beforeEach } from "vitest";
import * as functions from "firebase-functions";

// --- Mock firebase-admin ---
const mockOnce = vi.fn();
const mockRef = vi.fn();
const mockListUsers = vi.fn();

vi.mock("firebase-admin", () => {
  const mockDb = { ref: (...args: unknown[]) => mockRef(...args) };
  const mockAuth = { listUsers: (...args: unknown[]) => mockListUsers(...args) };
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      database: vi.fn(() => mockDb),
      auth: vi.fn(() => mockAuth),
    },
    apps: [],
    initializeApp: vi.fn(),
    database: vi.fn(() => mockDb),
    auth: vi.fn(() => mockAuth),
  };
});

// --- Mock firebase-functions ---
vi.mock("firebase-functions", () => {
  const HttpsError = class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  };

  let onCallHandler:
    | ((data: unknown, context: unknown) => Promise<unknown>)
    | undefined;

  return {
    default: {},
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    https: {
      HttpsError,
      onCall: (
        handler: (data: unknown, context: unknown) => Promise<unknown>
      ) => {
        onCallHandler = handler;
        return handler;
      },
    },
    get __onCallHandler() {
      return onCallHandler;
    },
  };
});

type CallableHandler = (
  data: unknown,
  context: { auth?: { uid: string } }
) => Promise<unknown>;

function getHandler(): CallableHandler {
  const mod = functions as unknown as { __onCallHandler: CallableHandler };
  return mod.__onCallHandler;
}

let handler: CallableHandler;

beforeEach(async () => {
  vi.clearAllMocks();

  if (!handler) {
    await import("../listUsers");
    handler = getHandler();
  }

  mockRef.mockImplementation(() => ({
    once: mockOnce,
  }));
});

describe("listUsers", () => {
  it("returns user list when called by admin", async () => {
    // Admin check: admins/admin-uid -> true
    mockOnce.mockResolvedValueOnce({ val: () => true });

    // auth().listUsers returns a page of users
    mockListUsers.mockResolvedValueOnce({
      users: [
        {
          uid: "u1",
          email: "user1@example.com",
          displayName: "User One",
          metadata: {
            creationTime: "2024-01-01T00:00:00Z",
            lastSignInTime: "2024-06-01T00:00:00Z",
          },
        },
        {
          uid: "u2",
          email: "user2@example.com",
          displayName: undefined,
          metadata: {
            creationTime: "2024-02-01T00:00:00Z",
            lastSignInTime: undefined,
          },
        },
      ],
      pageToken: undefined,
    });

    const result = await handler(null, { auth: { uid: "admin-uid" } });

    expect(mockRef).toHaveBeenCalledWith("admins/admin-uid");
    expect(result).toEqual([
      {
        uid: "u1",
        email: "user1@example.com",
        displayName: "User One",
        createdAt: "2024-01-01T00:00:00Z",
        lastSignIn: "2024-06-01T00:00:00Z",
      },
      {
        uid: "u2",
        email: "user2@example.com",
        displayName: undefined,
        createdAt: "2024-02-01T00:00:00Z",
        lastSignIn: undefined,
      },
    ]);
  });

  it("throws permission-denied for non-admin caller", async () => {
    // Admin check: not admin
    mockOnce.mockResolvedValueOnce({ val: () => false });

    await expect(
      handler(null, { auth: { uid: "non-admin-uid" } })
    ).rejects.toMatchObject({
      code: "permission-denied",
    });

    // Should not call listUsers
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it("throws unauthenticated for caller with no auth", async () => {
    await expect(handler(null, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });

    // Should not query admin status or list users
    expect(mockRef).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it("paginates through multiple pages of users", async () => {
    mockOnce.mockResolvedValueOnce({ val: () => true });

    // First page
    mockListUsers.mockResolvedValueOnce({
      users: [
        {
          uid: "u1",
          email: "a@b.com",
          displayName: "A",
          metadata: { creationTime: "t1", lastSignInTime: "t2" },
        },
      ],
      pageToken: "nextPage",
    });

    // Second page (no more pages)
    mockListUsers.mockResolvedValueOnce({
      users: [
        {
          uid: "u2",
          email: "c@d.com",
          displayName: "B",
          metadata: { creationTime: "t3", lastSignInTime: "t4" },
        },
      ],
      pageToken: undefined,
    });

    const result = await handler(null, { auth: { uid: "admin-uid" } });

    expect(mockListUsers).toHaveBeenCalledTimes(2);
    expect(mockListUsers).toHaveBeenCalledWith(1000, undefined);
    expect(mockListUsers).toHaveBeenCalledWith(1000, "nextPage");
    expect(result).toHaveLength(2);
  });
});
