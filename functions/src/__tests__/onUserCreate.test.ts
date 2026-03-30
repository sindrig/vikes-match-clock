import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock firebase-admin ---
const mockOnce = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockRef = vi.fn();

vi.mock("firebase-admin", () => {
  const mockDb = { ref: (...args: unknown[]) => mockRef(...args) };
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      database: vi.fn(() => mockDb),
      auth: vi.fn(),
    },
    apps: [],
    initializeApp: vi.fn(),
    database: vi.fn(() => mockDb),
  };
});

// --- Mock firebase-functions ---
vi.mock("firebase-functions", () => {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  // Capture the handler passed to onCreate
  let onCreateHandler: ((user: unknown) => Promise<void>) | undefined;
  return {
    default: {},
    logger,
    auth: {
      user: () => ({
        onCreate: (handler: (user: unknown) => Promise<void>) => {
          onCreateHandler = handler;
          return handler;
        },
      }),
    },
    // Expose getter so tests can invoke the handler
    get __onCreateHandler() {
      return onCreateHandler;
    },
  };
});

// Import after mocks are set up
import * as functionsModule from "firebase-functions";

// Helper to get the onCreate handler
function getHandler(): (user: {
  uid: string;
  email?: string;
}) => Promise<void> {
  // Force module re-evaluation to register the handler
  const mod = functionsModule as unknown as {
    __onCreateHandler: (user: {
      uid: string;
      email?: string;
    }) => Promise<void>;
  };
  return mod.__onCreateHandler;
}

// Trigger the module import so the handler registers
// eslint-disable-next-line @typescript-eslint/no-require-imports
let handler: ReturnType<typeof getHandler>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Re-import onUserCreate to register handler fresh each time
  // (it was already registered on first import, so just grab the reference)
  if (!handler) {
    await import("../onUserCreate");
    handler = getHandler();
  }

  // Default: mockRef returns an object with once/set/update
  mockRef.mockImplementation(() => ({
    once: mockOnce,
    set: mockSet,
    update: mockUpdate,
  }));
});

describe("onUserCreate", () => {
  it("copies locations from matching invitation and deletes invitation", async () => {
    const invitation = {
      inv1: {
        email: "alice@example.com",
        locations: { stadium1: true },
      },
    };

    // db.ref("invitations").once("value")
    mockOnce.mockResolvedValueOnce({
      exists: () => true,
      val: () => invitation,
    });

    // db.ref("auth/uid123").set(...)
    mockSet.mockResolvedValueOnce(undefined);

    // db.ref().update(...)
    mockUpdate.mockResolvedValueOnce(undefined);

    await handler({ uid: "uid123", email: "alice@example.com" });

    // Should read invitations
    expect(mockRef).toHaveBeenCalledWith("invitations");

    // Should write merged locations to auth/{uid}
    expect(mockRef).toHaveBeenCalledWith("auth/uid123");
    expect(mockSet).toHaveBeenCalledWith({ stadium1: true });

    // Should delete the matched invitation
    expect(mockRef).toHaveBeenCalledWith();
    expect(mockUpdate).toHaveBeenCalledWith({
      "invitations/inv1": null,
    });
  });

  it("merges locations from multiple matching invitations", async () => {
    const invitations = {
      inv1: {
        email: "bob@example.com",
        locations: { stadium1: true },
      },
      inv2: {
        email: "bob@example.com",
        locations: { stadium2: true, stadium3: true },
      },
      inv3: {
        email: "other@example.com",
        locations: { stadium4: true },
      },
    };

    mockOnce.mockResolvedValueOnce({
      exists: () => true,
      val: () => invitations,
    });
    mockSet.mockResolvedValueOnce(undefined);
    mockUpdate.mockResolvedValueOnce(undefined);

    await handler({ uid: "uid456", email: "bob@example.com" });

    // Should set merged locations
    expect(mockSet).toHaveBeenCalledWith({
      stadium1: true,
      stadium2: true,
      stadium3: true,
    });

    // Should delete both matching invitations, not the third
    expect(mockUpdate).toHaveBeenCalledWith({
      "invitations/inv1": null,
      "invitations/inv2": null,
    });
  });

  it("does nothing when no matching invitation exists", async () => {
    const invitations = {
      inv1: {
        email: "other@example.com",
        locations: { stadium1: true },
      },
    };

    mockOnce.mockResolvedValueOnce({
      exists: () => true,
      val: () => invitations,
    });

    await handler({ uid: "uid789", email: "nomatch@example.com" });

    // Should not write auth or delete invitations
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("normalizes email case when matching invitations", async () => {
    const invitations = {
      inv1: {
        email: "alice@example.com",
        locations: { stadium1: true },
      },
    };

    mockOnce.mockResolvedValueOnce({
      exists: () => true,
      val: () => invitations,
    });
    mockSet.mockResolvedValueOnce(undefined);
    mockUpdate.mockResolvedValueOnce(undefined);

    // User signs up with uppercase email
    await handler({ uid: "uidCase", email: "ALICE@EXAMPLE.COM" });

    expect(mockSet).toHaveBeenCalledWith({ stadium1: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      "invitations/inv1": null,
    });
  });

  it("does nothing when invitations snapshot does not exist", async () => {
    mockOnce.mockResolvedValueOnce({
      exists: () => false,
      val: () => null,
    });

    await handler({ uid: "uid000", email: "test@example.com" });

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips user with no email", async () => {
    await handler({ uid: "noEmailUid" });

    // Should not even query invitations
    expect(mockRef).not.toHaveBeenCalledWith("invitations");
    expect(mockOnce).not.toHaveBeenCalled();
  });
});
