import { describe, it, expect } from "vitest";
import { parseAuditEvent, parseAuditEvents } from "./firebaseParsers";

const validEvent = {
  timestamp: 1700000000000,
  uid: "operator-1",
  sessionId: "session-abc",
  action: "match.reset",
  stateArea: "match",
  changes: { homeScore: 0, awayScore: 0, started: 0 },
};

describe("parseAuditEvent", () => {
  it("parses a valid audit event", () => {
    expect(parseAuditEvent(validEvent)).toEqual(validEvent);
  });

  it("returns null for non-object data", () => {
    expect(parseAuditEvent(null)).toBeNull();
    expect(parseAuditEvent("nope")).toBeNull();
    expect(parseAuditEvent(42)).toBeNull();
    expect(parseAuditEvent([])).toBeNull();
  });

  it("returns null when required fields are missing or mistyped", () => {
    const cases: unknown[] = [
      { ...validEvent, timestamp: "1700000000000" },
      { ...validEvent, uid: "" },
      { ...validEvent, uid: 123 },
      { ...validEvent, sessionId: undefined },
      { ...validEvent, action: 1 },
      { ...validEvent, changes: null },
      { ...validEvent, changes: [] },
    ];
    for (const data of cases) {
      expect(parseAuditEvent(data)).toBeNull();
    }
  });

  it("returns null for an unknown state area", () => {
    expect(parseAuditEvent({ ...validEvent, stateArea: "scores" })).toBeNull();
  });

  it("accepts every supported state area", () => {
    for (const stateArea of [
      "match",
      "controller",
      "view",
      "perimeter",
      "clubOverrides",
    ]) {
      expect(parseAuditEvent({ ...validEvent, stateArea })).toEqual({
        ...validEvent,
        stateArea,
      });
    }
  });

  it("accepts null deletions inside changes", () => {
    const event = {
      ...validEvent,
      changes: { overlay: null, adLayout: null },
    };
    expect(parseAuditEvent(event)).toEqual(event);
  });
});

describe("parseAuditEvents", () => {
  it("parses a collection and attaches event ids", () => {
    const raw = {
      event1: validEvent,
      event2: { ...validEvent, action: "match.start", uid: "operator-2" },
      garbage: "not-an-event",
    };
    const events = parseAuditEvents(raw);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ ...validEvent, id: "event1" });
    expect(events[1]).toEqual({
      ...validEvent,
      action: "match.start",
      uid: "operator-2",
      id: "event2",
    });
  });

  it("returns an empty array for missing or non-object data", () => {
    expect(parseAuditEvents(null)).toEqual([]);
    expect(parseAuditEvents(undefined)).toEqual([]);
    expect(parseAuditEvents("x")).toEqual([]);
  });
});
