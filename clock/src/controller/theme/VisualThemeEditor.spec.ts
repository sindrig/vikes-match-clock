import { describe, it, expect } from "vitest";
import { sanitizeCssUrl } from "./VisualThemeEditor";

describe("VisualThemeEditor helpers", () => {
  describe("sanitizeCssUrl", () => {
    it("returns a normal URL unchanged", () => {
      expect(sanitizeCssUrl("https://example.com/image.png")).toBe(
        "https://example.com/image.png",
      );
    });

    it("escapes parentheses", () => {
      expect(sanitizeCssUrl("https://example.com/img(1).png")).toBe(
        "https://example.com/img\\(1\\).png",
      );
    });

    it("escapes single quotes", () => {
      expect(sanitizeCssUrl("https://example.com/it's.png")).toBe(
        "https://example.com/it\\'s.png",
      );
    });

    it("escapes double quotes", () => {
      expect(sanitizeCssUrl('https://example.com/a"b.png')).toBe(
        'https://example.com/a\\"b.png',
      );
    });

    it("escapes backslashes", () => {
      expect(sanitizeCssUrl("https://example.com/a\\b.png")).toBe(
        "https://example.com/a\\\\b.png",
      );
    });

    it("escapes multiple special characters at once", () => {
      expect(sanitizeCssUrl("a(b)c'd\"e\\f")).toBe("a\\(b\\)c\\'d\\\"e\\\\f");
    });

    it("handles empty string", () => {
      expect(sanitizeCssUrl("")).toBe("");
    });
  });
});
