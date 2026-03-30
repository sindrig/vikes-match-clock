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

// --- Shared handler storage ---
let sharedOnCallHandler: ((request: { data: unknown; auth?: { uid: string } }) => Promise<unknown>) | undefined;

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
    https: {
      HttpsError,
    },
    get __onCallHandler() {
      return sharedOnCallHandler;
    },
  };
});

vi.mock("firebase-functions/v2/https", () => {
  return {
    onCall: (
      optionsOrHandler:
        | Record<string, unknown>
        | ((request: {
            data: unknown;
            auth?: { uid: string };
          }) => Promise<unknown>),
      maybeHandler?: (request: {
        data: unknown;
        auth?: { uid: string };
      }) => Promise<unknown>
    ) => {
      // Support both onCall(handler) and onCall(options, handler)
      const handler =
        typeof optionsOrHandler === "function"
          ? optionsOrHandler
          : maybeHandler!;
      const wrappedHandler = (
        dataOrRequest: unknown,
        context?: { auth?: { uid: string } }
      ) => {
        if (context !== undefined) {
          return handler({ data: dataOrRequest, auth: context.auth });
        }
        return handler(dataOrRequest as { data: unknown; auth?: { uid: string } });
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
          disabled: false,
          metadata: {
            creationTime: "2024-01-01T00:00:00Z",
            lastSignInTime: "2024-06-01T00:00:00Z",
          },
        },
        {
          uid: "u2",
          email: "user2@example.com",
          displayName: undefined,
          disabled: true,
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
    expect(result).toEqual({
      users: [
        {
          uid: "u1",
          email: "user1@example.com",
          displayName: "User One",
          createdAt: "2024-01-01T00:00:00Z",
          lastSignIn: "2024-06-01T00:00:00Z",
          disabled: false,
        },
        {
          uid: "u2",
          email: "user2@example.com",
          displayName: undefined,
          createdAt: "2024-02-01T00:00:00Z",
          lastSignIn: undefined,
          disabled: true,
        },
      ],
    });
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
          disabled: false,
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
          disabled: false,
          metadata: { creationTime: "t3", lastSignInTime: "t4" },
        },
      ],
      pageToken: undefined,
    });

    const result = await handler(null, { auth: { uid: "admin-uid" } });

    expect(mockListUsers).toHaveBeenCalledTimes(2);
    expect(mockListUsers).toHaveBeenCalledWith(1000, undefined);
    expect(mockListUsers).toHaveBeenCalledWith(1000, "nextPage");
    expect(result).toHaveProperty("users");
    expect((result as { users: unknown[] }).users).toHaveLength(2);
  });
});
