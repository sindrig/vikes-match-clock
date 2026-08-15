import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreateSessionId } from "./sessionId";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("getOrCreateSessionId", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("returns the same ID on repeated calls within a session", () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(first).toBe(second);
    expect(first).toMatch(UUID_RE);
  });

  it("persists the ID in sessionStorage", () => {
    const id = getOrCreateSessionId();
    expect(window.sessionStorage.getItem("clock_sessionId")).toBe(id);
  });

  it("reuses an ID stored in sessionStorage", () => {
    const stored = crypto.randomUUID();
    window.sessionStorage.setItem("clock_sessionId", stored);
    expect(getOrCreateSessionId()).toBe(stored);
  });

  it("regenerates the ID when a new session starts (storage cleared)", () => {
    const first = getOrCreateSessionId();
    window.sessionStorage.clear();
    const second = getOrCreateSessionId();
    expect(second).not.toBe(first);
    expect(second).toMatch(UUID_RE);
  });
});
