import { describe, it, expect, vi, beforeEach } from "vitest";
import * as functions from "firebase-functions";

// --- Mock firebase-admin ---
const mockOnce = vi.fn();
const mockSet = vi.fn();
const mockRemove = vi.fn();
const mockPush = vi.fn();
const mockRef = vi.fn();
const mockGetUser = vi.fn();

vi.mock("firebase-admin", () => {
  const mockDb = {
    ref: (...args: unknown[]) => mockRef(...args),
  };
  const mockDatabase = vi.fn(() => mockDb);
  Object.assign(mockDatabase, {
    ServerValue: {
      TIMESTAMP: { ".sv": "timestamp" },
    },
  });
  const admin = {
    apps: [],
    initializeApp: vi.fn(),
    database: mockDatabase,
    auth: vi.fn(() => ({ getUser: mockGetUser })),
  };
  return {
    __esModule: true,
    default: admin,
    ...admin,
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
    await import("../adminWrite");
    handler = getHandler();
  }

  // Default mockRef: returns object with once, set, remove, push
  mockRef.mockImplementation(() => ({
    once: mockOnce,
    set: mockSet,
    remove: mockRemove,
    push: mockPush,
  }));
});

/** Helper to make an admin-authenticated context */
function adminContext(uid = "admin-uid"): { auth: { uid: string } } {
  return { auth: { uid } };
}

/** Set the admin check to pass */
function stubAdminCheck(isAdmin: boolean): void {
  mockOnce.mockResolvedValueOnce({ val: () => (isAdmin ? true : false) });
}

describe("adminWrite", () => {
  // ---------- setUserLocations ----------

  describe("setUserLocations", () => {
    it("updates auth/{uid} when called by admin", async () => {
      stubAdminCheck(true);
      mockSet.mockResolvedValueOnce(undefined);

      const result = await handler(
        {
          action: "setUserLocations",
          targetUid: "target-uid",
          locations: { stadium1: true, stadium2: false },
        },
        adminContext()
      );

      expect(mockRef).toHaveBeenCalledWith("admins/admin-uid");
      expect(mockRef).toHaveBeenCalledWith("auth/target-uid");
      expect(mockSet).toHaveBeenCalledWith({
        stadium1: true,
        stadium2: false,
      });
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin with permission-denied", async () => {
      stubAdminCheck(false);

      await expect(
        handler(
          {
            action: "setUserLocations",
            targetUid: "target-uid",
            locations: { stadium1: true },
          },
          adminContext("non-admin-uid")
        )
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Should not write auth
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  // ---------- createInvitation ----------

  describe("createInvitation", () => {
    it("creates invitation with normalized email and admin email", async () => {
      stubAdminCheck(true);

      mockGetUser.mockResolvedValueOnce({
        email: "admin@example.com",
      });

      const pushKey = "generated-push-key";
      mockPush.mockReturnValueOnce({
        key: pushKey,
        set: mockSet,
      });
      mockSet.mockResolvedValueOnce(undefined);

      const result = await handler(
        {
          action: "createInvitation",
          email: "Alice@Example.COM",
          locations: { stadium1: true },
        },
        adminContext()
      );

      expect(mockRef).toHaveBeenCalledWith("invitations");
      expect(mockSet).toHaveBeenCalledWith({
        email: "alice@example.com",
        locations: { stadium1: true },
        createdBy: "admin@example.com",
        createdAt: expect.anything(),
      });
      expect(result).toEqual({
        success: true,
        invitationId: pushKey,
      });
    });

    it("rejects invalid email", async () => {
      stubAdminCheck(true);
      mockGetUser.mockResolvedValueOnce({
        email: "admin@example.com",
      });

      await expect(
        handler(
          {
            action: "createInvitation",
            email: "not-an-email",
            locations: { stadium1: true },
          },
          adminContext()
        )
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("rejects empty email", async () => {
      stubAdminCheck(true);
      mockGetUser.mockResolvedValueOnce({
        email: "admin@example.com",
      });

      await expect(
        handler(
          {
            action: "createInvitation",
            email: "",
            locations: { stadium1: true },
          },
          adminContext()
        )
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });
  });

  // ---------- deleteInvitation ----------

  describe("deleteInvitation", () => {
    it("removes invitation by ID", async () => {
      stubAdminCheck(true);
      mockRemove.mockResolvedValueOnce(undefined);

      const result = await handler(
        {
          action: "deleteInvitation",
          invitationId: "inv-123",
        },
        adminContext()
      );

      expect(mockRef).toHaveBeenCalledWith("invitations/inv-123");
      expect(mockRemove).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  // ---------- updateInvitation ----------

  describe("updateInvitation", () => {
    it("updates invitation locations by ID", async () => {
      stubAdminCheck(true);
      mockSet.mockResolvedValueOnce(undefined);

      const result = await handler(
        {
          action: "updateInvitation",
          invitationId: "inv-456",
          locations: { stadium2: true },
        },
        adminContext()
      );

      expect(mockRef).toHaveBeenCalledWith("invitations/inv-456/locations");
      expect(mockSet).toHaveBeenCalledWith({ stadium2: true });
      expect(result).toEqual({ success: true });
    });
  });

  // ---------- Unauthenticated ----------

  describe("unauthenticated caller", () => {
    it("rejects setUserLocations", async () => {
      await expect(
        handler(
          {
            action: "setUserLocations",
            targetUid: "t",
            locations: { a: true },
          },
          {}
        )
      ).rejects.toMatchObject({ code: "unauthenticated" });
    });

    it("rejects createInvitation", async () => {
      await expect(
        handler(
          {
            action: "createInvitation",
            email: "a@b.com",
            locations: { a: true },
          },
          {}
        )
      ).rejects.toMatchObject({ code: "unauthenticated" });
    });

    it("rejects deleteInvitation", async () => {
      await expect(
        handler(
          { action: "deleteInvitation", invitationId: "inv-1" },
          {}
        )
      ).rejects.toMatchObject({ code: "unauthenticated" });
    });

    it("rejects updateInvitation", async () => {
      await expect(
        handler(
          {
            action: "updateInvitation",
            invitationId: "inv-1",
            locations: { a: true },
          },
          {}
        )
      ).rejects.toMatchObject({ code: "unauthenticated" });
    });
  });
});
