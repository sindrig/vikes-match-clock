import { describe, it, expect } from "vitest";
import { parseYoutubePlaylistId, isYoutubeUrl } from "./urlUtils";

describe("urlUtils", () => {
  describe("parseYoutubePlaylistId", () => {
    it("extracts playlist ID from valid YouTube playlist URL", () => {
      const url =
        "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf";
      expect(parseYoutubePlaylistId(url)).toBe(
        "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
      );
    });

    it("handles URL with multiple query params", () => {
      const url =
        "https://www.youtube.com/playlist?list=PLtest123&feature=share";
      expect(parseYoutubePlaylistId(url)).toBe("PLtest123");
    });

    it("returns null for YouTube video URL (not playlist)", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(parseYoutubePlaylistId(url)).toBeNull();
    });

    it("returns null for YouTube channel URL", () => {
      const url = "https://www.youtube.com/channel/UCtest";
      expect(parseYoutubePlaylistId(url)).toBeNull();
    });

    it("returns null for non-YouTube URL", () => {
      const url = "https://vimeo.com/playlist/123";
      expect(parseYoutubePlaylistId(url)).toBeNull();
    });

    it("returns null for invalid URL", () => {
      expect(parseYoutubePlaylistId("not-a-url")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseYoutubePlaylistId("")).toBeNull();
    });

    it("returns null for playlist URL without list param", () => {
      const url = "https://www.youtube.com/playlist";
      expect(parseYoutubePlaylistId(url)).toBeNull();
    });

    it("handles youtu.be short URLs (returns null - not playlist)", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      expect(parseYoutubePlaylistId(url)).toBeNull();
    });

    it("handles music.youtube.com playlist URLs", () => {
      const url =
        "https://music.youtube.com/playlist?list=PLmusictest&feature=share";
      expect(parseYoutubePlaylistId(url)).toBe("PLmusictest");
    });
  });

  describe("isYoutubeUrl", () => {
    it("returns true for youtube.com URL", () => {
      expect(isYoutubeUrl("https://www.youtube.com/watch?v=test")).toBe(true);
    });

    it("returns true for youtu.be URL", () => {
      expect(isYoutubeUrl("https://youtu.be/test")).toBe(true);
    });

    it("returns true for music.youtube.com URL", () => {
      expect(isYoutubeUrl("https://music.youtube.com/watch?v=test")).toBe(true);
    });

    it("returns false for non-YouTube URL", () => {
      expect(isYoutubeUrl("https://vimeo.com/123")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isYoutubeUrl("")).toBe(false);
    });
  });
});
