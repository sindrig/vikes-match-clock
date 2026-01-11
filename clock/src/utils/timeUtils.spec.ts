import { describe, it, expect } from "vitest";
import { formatTime, formatMillisAsTime } from "./timeUtils";

describe("timeUtils", () => {
  describe("formatTime", () => {
    it("formats 0:00 correctly", () => {
      expect(formatTime(0, 0)).toBe("00:00");
    });

    it("formats single-digit minutes and seconds with padding", () => {
      expect(formatTime(5, 9)).toBe("05:09");
    });

    it("formats double-digit minutes and seconds without extra padding", () => {
      expect(formatTime(45, 30)).toBe("45:30");
    });

    it("formats half-time (45:00)", () => {
      expect(formatTime(45, 0)).toBe("45:00");
    });

    it("formats full-time (90:00)", () => {
      expect(formatTime(90, 0)).toBe("90:00");
    });

    it("formats injury time (90+5 = 95:00)", () => {
      expect(formatTime(95, 30)).toBe("95:30");
    });

    it("handles large minute values (extra time)", () => {
      expect(formatTime(120, 0)).toBe("120:00");
    });

    it("pads string inputs correctly", () => {
      // The pad function accepts number | string
      expect(formatTime(1, 1)).toBe("01:01");
    });
  });

  describe("formatMillisAsTime", () => {
    it("formats 0ms as 00:00", () => {
      expect(formatMillisAsTime(0)).toBe("00:00");
    });

    it("formats 1000ms as 00:01", () => {
      expect(formatMillisAsTime(1000)).toBe("00:01");
    });

    it("formats 60000ms (1 minute) as 01:00", () => {
      expect(formatMillisAsTime(60000)).toBe("01:00");
    });

    it("formats 2700000ms (45 minutes) as 45:00", () => {
      expect(formatMillisAsTime(2700000)).toBe("45:00");
    });

    it("formats 5400000ms (90 minutes) as 90:00", () => {
      expect(formatMillisAsTime(5400000)).toBe("90:00");
    });

    it("formats partial seconds by flooring", () => {
      // 61500ms = 61.5 seconds = 1 minute 1.5 seconds -> floors to 1:01
      expect(formatMillisAsTime(61500)).toBe("01:01");
    });

    it("handles negative values by returning 00:00", () => {
      // Math.max ensures negative values become 0
      expect(formatMillisAsTime(-5000)).toBe("00:00");
    });

    it("handles very large values (>60 minutes)", () => {
      // 7200000ms = 120 minutes
      expect(formatMillisAsTime(7200000)).toBe("120:00");
    });

    it("correctly calculates minutes and seconds for arbitrary values", () => {
      // 3661000ms = 61 minutes and 1 second
      expect(formatMillisAsTime(3661000)).toBe("61:01");
    });

    it("handles edge case of 59 seconds", () => {
      expect(formatMillisAsTime(59000)).toBe("00:59");
    });

    it("handles milliseconds just under a minute", () => {
      expect(formatMillisAsTime(59999)).toBe("00:59");
    });

    it("handles milliseconds just over a minute", () => {
      expect(formatMillisAsTime(60001)).toBe("01:00");
    });
  });
});
