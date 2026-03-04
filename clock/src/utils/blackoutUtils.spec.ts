import { describe, it, expect } from "vitest";
import { isInBlackoutWindow } from "./blackoutUtils";

describe("blackoutUtils", () => {
  describe("isInBlackoutWindow", () => {
    it("returns false when start is undefined (feature disabled)", () => {
      const now = new Date("2025-03-04T21:00:00");
      expect(isInBlackoutWindow(now, undefined, "08:00")).toBe(false);
    });

    it("returns false when end is undefined (feature disabled)", () => {
      const now = new Date("2025-03-04T21:00:00");
      expect(isInBlackoutWindow(now, "20:00", undefined)).toBe(false);
    });

    it("returns false when start is empty string (feature disabled)", () => {
      const now = new Date("2025-03-04T21:00:00");
      expect(isInBlackoutWindow(now, "", "08:00")).toBe(false);
    });

    it("returns false when end is empty string (feature disabled)", () => {
      const now = new Date("2025-03-04T21:00:00");
      expect(isInBlackoutWindow(now, "20:00", "")).toBe(false);
    });

    it("returns true at 21:00 within overnight blackout window 20:00-08:00", () => {
      const now = new Date("2025-03-04T21:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("returns true at 03:00 within overnight blackout window 20:00-08:00", () => {
      const now = new Date("2025-03-04T03:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("returns false at 12:00 outside overnight blackout window 20:00-08:00", () => {
      const now = new Date("2025-03-04T12:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(false);
    });

    it("returns true at 20:00 exactly (start boundary is inclusive)", () => {
      const now = new Date("2025-03-04T20:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("returns false at 08:00 exactly (end boundary is exclusive)", () => {
      const now = new Date("2025-03-04T08:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(false);
    });

    it("returns true at 14:00 within non-wrapping daytime window 09:00-17:00", () => {
      const now = new Date("2025-03-04T14:00:00");
      expect(isInBlackoutWindow(now, "09:00", "17:00")).toBe(true);
    });

    it("returns false at 20:00 outside non-wrapping window 09:00-17:00", () => {
      const now = new Date("2025-03-04T20:00:00");
      expect(isInBlackoutWindow(now, "09:00", "17:00")).toBe(false);
    });

    it("returns true at 09:00 exactly (start boundary is inclusive in non-wrapping window)", () => {
      const now = new Date("2025-03-04T09:00:00");
      expect(isInBlackoutWindow(now, "09:00", "17:00")).toBe(true);
    });

    it("returns false at 17:00 exactly (end boundary is exclusive in non-wrapping window)", () => {
      const now = new Date("2025-03-04T17:00:00");
      expect(isInBlackoutWindow(now, "09:00", "17:00")).toBe(false);
    });

    it("returns false when start and end are the same (empty window)", () => {
      const now = new Date("2025-03-04T12:00:00");
      expect(isInBlackoutWindow(now, "12:00", "12:00")).toBe(false);
    });

    it("handles midnight edge case at 23:59:59 within overnight window", () => {
      const now = new Date("2025-03-04T23:59:59");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("handles midnight edge case at 00:00:00 within overnight window", () => {
      const now = new Date("2025-03-04T00:00:00");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("handles edge case at 00:00:01 within overnight window", () => {
      const now = new Date("2025-03-04T00:00:01");
      expect(isInBlackoutWindow(now, "20:00", "08:00")).toBe(true);
    });

    it("ignores seconds and milliseconds in time comparison", () => {
      const now1 = new Date("2025-03-04T21:00:00");
      const now2 = new Date("2025-03-04T21:00:59");
      const now3 = new Date("2025-03-04T21:00:30.500");
      expect(isInBlackoutWindow(now1, "20:00", "08:00")).toBe(true);
      expect(isInBlackoutWindow(now2, "20:00", "08:00")).toBe(true);
      expect(isInBlackoutWindow(now3, "20:00", "08:00")).toBe(true);
    });
  });
});
