import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveClubOverride,
  deleteClubOverride,
  generateClubOverrideId,
} from "./firebaseDatabase";
import type { ClubOverride } from "./types";

// Mock Firebase database
vi.mock("firebase/database", () => ({
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn(),
  off: vi.fn(),
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

describe("firebaseDatabase write helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveClubOverride", () => {
    it("saves club override to correct Firebase path", async () => {
      const { update } = await import("firebase/database");
      const prefix = "vikinni";
      const id = "test-uuid-123";
      const override: ClubOverride = {
        name: "Víkingur R",
        clubId: "2492",
        logoUrl: "https://example.com/logo.png",
        isOverride: true,
      };

      await saveClubOverride(prefix, id, override);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "states/vikinni/clubOverrides/test-uuid-123",
        }),
        override,
      );
    });

    it("constructs correct path with different prefix", async () => {
      const { update } = await import("firebase/database");
      const prefix = "hasteinsvollur";
      const id = "another-uuid";
      const override: ClubOverride = {
        name: "Test Club",
        clubId: "999",
        logoUrl: "https://example.com/test.png",
        isOverride: false,
      };

      await saveClubOverride(prefix, id, override);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "states/hasteinsvollur/clubOverrides/another-uuid",
        }),
        override,
      );
    });

    it("writes all override properties correctly", async () => {
      const { update } = await import("firebase/database");
      const override: ClubOverride = {
        name: "Custom Club",
        clubId: "-1",
        logoUrl: "https://storage.example.com/custom-logo.png",
        isOverride: false,
      };

      await saveClubOverride("test", "id1", override);

      const callArgs = (update as any).mock.calls[0];
      expect(callArgs[1]).toEqual(override);
    });
  });

  describe("deleteClubOverride", () => {
    it("removes from both RTDB and Storage", async () => {
      const { remove } = await import("firebase/database");
      const { storageHelpers } = await import("./firebase");

      const prefix = "vikinni";
      const id = "uuid-to-delete";

      await deleteClubOverride(prefix, id);

      // Check RTDB deletion
      expect(remove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "states/vikinni/clubOverrides/uuid-to-delete",
        }),
      );

      // Check Storage deletion
      expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
        "vikinni/club-logos/uuid-to-delete",
      );
    });

    it("constructs correct RTDB path", async () => {
      const { remove } = await import("firebase/database");

      await deleteClubOverride("staging", "test-id-456");

      expect(remove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "states/staging/clubOverrides/test-id-456",
        }),
      );
    });

    it("constructs correct Storage path", async () => {
      const { storageHelpers } = await import("./firebase");

      await deleteClubOverride("production", "logo-xyz");

      expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
        "production/club-logos/logo-xyz",
      );
    });

    it("handles deletion with special characters in ID", async () => {
      const { remove } = await import("firebase/database");
      const { storageHelpers } = await import("./firebase");

      await deleteClubOverride("test", "uuid-with-dashes-123");

      expect(remove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "states/test/clubOverrides/uuid-with-dashes-123",
        }),
      );

      expect(storageHelpers.deleteObject).toHaveBeenCalledWith(
        "test/club-logos/uuid-with-dashes-123",
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

    it("generates multiple valid UUIDs", () => {
      const ids = Array.from({ length: 10 }, () => generateClubOverrideId());
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      ids.forEach((id) => {
        expect(id).toMatch(uuidRegex);
      });
    });
  });
});
