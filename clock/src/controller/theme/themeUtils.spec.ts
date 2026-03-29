import { describe, it, expect } from "vitest";
import {
  parseStroke,
  composeStroke,
  toHex,
  parseFontSize,
  composeFontSize,
} from "./themeUtils";

describe("themeUtils", () => {
  // ---- parseStroke ----
  describe("parseStroke", () => {
    it('parses "2px red" into width and color', () => {
      expect(parseStroke("2px red")).toEqual({ width: 2, color: "red" });
    });

    it('parses "3.5px #ff0000"', () => {
      expect(parseStroke("3.5px #ff0000")).toEqual({
        width: 3.5,
        color: "#ff0000",
      });
    });

    it('parses "1px rgba(255,0,0,0.5)"', () => {
      expect(parseStroke("1px rgba(255,0,0,0.5)")).toEqual({
        width: 1,
        color: "rgba(255,0,0,0.5)",
      });
    });

    it('returns zero stroke for "none"', () => {
      expect(parseStroke("none")).toEqual({ width: 0, color: "#000000" });
    });

    it("returns zero stroke for empty string", () => {
      expect(parseStroke("")).toEqual({ width: 0, color: "#000000" });
    });

    it("returns zero stroke for whitespace-only input", () => {
      expect(parseStroke("   ")).toEqual({ width: 0, color: "#000000" });
    });

    it("handles bare number (no unit, no color)", () => {
      expect(parseStroke("5")).toEqual({ width: 5, color: "#000000" });
    });

    it("handles bare decimal number", () => {
      expect(parseStroke("1.5")).toEqual({ width: 1.5, color: "#000000" });
    });

    it("returns zero stroke for garbage input", () => {
      expect(parseStroke("hello world")).toEqual({
        width: 0,
        color: "#000000",
      });
    });

    it("is case-insensitive for 'none'", () => {
      expect(parseStroke("NONE")).toEqual({ width: 0, color: "#000000" });
      expect(parseStroke("None")).toEqual({ width: 0, color: "#000000" });
    });

    it("trims leading/trailing whitespace", () => {
      expect(parseStroke("  2px blue  ")).toEqual({
        width: 2,
        color: "blue",
      });
    });

    it("handles zero width with a color", () => {
      expect(parseStroke("0px white")).toEqual({ width: 0, color: "white" });
    });
  });

  // ---- composeStroke ----
  describe("composeStroke", () => {
    it('composes width and color into "Npx color"', () => {
      expect(composeStroke(2, "red")).toBe("2px red");
    });

    it('composes fractional width into "N.Npx color"', () => {
      expect(composeStroke(1.5, "#ff0000")).toBe("1.5px #ff0000");
    });

    it('returns "none" for zero width', () => {
      expect(composeStroke(0, "red")).toBe("none");
    });

    it('returns "none" for negative width', () => {
      expect(composeStroke(-1, "red")).toBe("none");
    });
  });

  // ---- parseStroke / composeStroke round-trip ----
  describe("parseStroke + composeStroke round-trip", () => {
    it("round-trips a normal stroke value", () => {
      const original = "2px #ff0000";
      const parsed = parseStroke(original);
      expect(composeStroke(parsed.width, parsed.color)).toBe(original);
    });

    it('round-trips "none"', () => {
      const parsed = parseStroke("none");
      expect(composeStroke(parsed.width, parsed.color)).toBe("none");
    });
  });

  // ---- toHex ----
  describe("toHex", () => {
    it("passes through 6-digit hex unchanged", () => {
      expect(toHex("#ff0000")).toBe("#ff0000");
      expect(toHex("#abcdef")).toBe("#abcdef");
    });

    it("expands 3-digit hex to 6-digit", () => {
      expect(toHex("#f00")).toBe("#ff0000");
      expect(toHex("#abc")).toBe("#aabbcc");
    });

    it("converts named color 'black'", () => {
      expect(toHex("black")).toBe("#000000");
    });

    it("converts named color 'white'", () => {
      expect(toHex("white")).toBe("#ffffff");
    });

    it("converts named color 'red'", () => {
      expect(toHex("red")).toBe("#ff0000");
    });

    it('converts named color "transparent" to #000000', () => {
      expect(toHex("transparent")).toBe("#000000");
    });

    it("converts rgb() notation", () => {
      expect(toHex("rgb(255, 128, 0)")).toBe("#ff8000");
    });

    it("converts rgba() notation (ignores alpha)", () => {
      expect(toHex("rgba(0, 255, 0, 0.5)")).toBe("#00ff00");
    });

    it("converts rgb with no spaces", () => {
      expect(toHex("rgb(0,0,0)")).toBe("#000000");
    });

    it("returns #000000 for unknown/unrecognized input", () => {
      expect(toHex("cornflowerblue")).toBe("#000000");
      expect(toHex("not-a-color")).toBe("#000000");
    });

    it("is case-insensitive for hex", () => {
      expect(toHex("#FF0000")).toBe("#FF0000");
    });

    it("is case-insensitive for named colors", () => {
      expect(toHex("BLACK")).toBe("#000000");
      expect(toHex("White")).toBe("#ffffff");
    });

    it("trims whitespace around named colors", () => {
      expect(toHex("  red  ")).toBe("#ff0000");
    });
  });

  // ---- parseFontSize ----
  describe("parseFontSize", () => {
    it('parses "2.5rem"', () => {
      expect(parseFontSize("2.5rem")).toEqual({ size: 2.5, unit: "rem" });
    });

    it('parses "16px"', () => {
      expect(parseFontSize("16px")).toEqual({ size: 16, unit: "px" });
    });

    it('parses "1.85rem" (clock default)', () => {
      expect(parseFontSize("1.85rem")).toEqual({ size: 1.85, unit: "rem" });
    });

    it("defaults unit to rem when omitted", () => {
      expect(parseFontSize("1.5")).toEqual({ size: 1.5, unit: "rem" });
    });

    it("returns default for empty string", () => {
      expect(parseFontSize("")).toEqual({ size: 1, unit: "rem" });
    });

    it("trims whitespace", () => {
      expect(parseFontSize("  3rem  ")).toEqual({ size: 3, unit: "rem" });
    });

    it('parses "0rem"', () => {
      expect(parseFontSize("0rem")).toEqual({ size: 0, unit: "rem" });
    });

    it('parses "100%"', () => {
      expect(parseFontSize("100%")).toEqual({ size: 100, unit: "%" });
    });
  });

  // ---- composeFontSize ----
  describe("composeFontSize", () => {
    it("composes size and unit", () => {
      expect(composeFontSize(2.5, "rem")).toBe("2.5rem");
    });

    it("composes px unit", () => {
      expect(composeFontSize(16, "px")).toBe("16px");
    });

    it("composes zero", () => {
      expect(composeFontSize(0, "rem")).toBe("0rem");
    });
  });

  // ---- parseFontSize / composeFontSize round-trip ----
  describe("parseFontSize + composeFontSize round-trip", () => {
    it("round-trips a rem value", () => {
      const original = "2.5rem";
      const { size, unit } = parseFontSize(original);
      expect(composeFontSize(size, unit)).toBe(original);
    });

    it("round-trips a px value", () => {
      const original = "16px";
      const { size, unit } = parseFontSize(original);
      expect(composeFontSize(size, unit)).toBe(original);
    });
  });
});
