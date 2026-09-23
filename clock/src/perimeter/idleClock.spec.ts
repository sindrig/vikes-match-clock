import { describe, expect, it } from "vitest";
import { formatIdleTime, idleClockPosition } from "./idleClock";
import { parsePerimeterState } from "../contexts/firebaseParsers";

describe("perimeter idle clock", () => {
  it("uses Icelandic 24-hour time across minute and midnight boundaries", () => {
    expect(formatIdleTime(new Date("2026-09-23T23:59:59Z"))).toBe("23:59");
    expect(formatIdleTime(new Date("2026-09-24T00:00:00Z"))).toBe("00:00");
    expect(formatIdleTime(new Date("2026-09-24T13:07:00+02:00"))).toBe("11:07");
  });

  it("moves right once per minute independently of strip width and wraps", () => {
    expect(idleClockPosition(0, 3648)).toBe(0);
    expect(idleClockPosition(30_000, 3648)).toBe(1824);
    expect(idleClockPosition(30_000, 3264)).toBe(1632);
    expect(idleClockPosition(60_000, 3648)).toBe(0);
    expect(idleClockPosition(90_000, 3648)).toBe(1824);
  });

  it("only enables the presentation for an explicit boolean true", () => {
    for (const idleClock of [undefined, null, "true", 1, false]) {
      expect(parsePerimeterState({ idleClock })?.idleClock === true).toBe(
        false,
      );
    }
    expect(parsePerimeterState({ idleClock: true })?.idleClock).toBe(true);
  });
});
