import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreateDisplayLabel,
  getDisplayResolution,
} from "./displayIdentity";

describe("getOrCreateDisplayLabel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and persists a label on first use", () => {
    const label = getOrCreateDisplayLabel();
    expect(label).toMatch(/^Skjár [0-9A-F]{4}$/);
    expect(localStorage.getItem("clock_displayLabel")).toBe(label);
  });

  it("returns the same label on subsequent calls", () => {
    const first = getOrCreateDisplayLabel();
    const second = getOrCreateDisplayLabel();
    expect(second).toBe(first);
  });

  it("returns the stored label when one exists", () => {
    localStorage.setItem("clock_displayLabel", "Skjár BEEF");
    expect(getOrCreateDisplayLabel()).toBe("Skjár BEEF");
  });
});

describe("getDisplayResolution", () => {
  it("returns a WxH string from window.screen", () => {
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: { width: 1920, height: 1080 },
    });
    expect(getDisplayResolution()).toBe("1920x1080");
  });

  it("returns an empty string when dimensions are missing", () => {
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: {},
    });
    expect(getDisplayResolution()).toBe("");
  });
});
