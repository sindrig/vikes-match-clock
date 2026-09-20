import { describe, expect, it } from "vitest";
import type { PerimeterOverlayColumn } from "../types";
import {
  OverlayPlayback,
  PairSlots,
  PerimeterPower,
  pairedPlaybackPlan,
} from "./playback";

const column = (durationMs: number, id: string): PerimeterOverlayColumn => ({
  durationMs,
  files: {
    "2": { name: `${id}-2.png`, source: `gs://bucket/${id}-2.png` },
    "4": { name: `${id}-4.png`, source: `gs://bucket/${id}-4.png` },
  },
});

describe("perimeter playback primitives", () => {
  it("loops short videos and speeds up long ones", () => {
    expect(
      pairedPlaybackPlan(
        { kind: "video", durationMs: 10_000 },
        20_000,
        () => true,
      ),
    ).toEqual({
      rate: 1,
      loop: true,
      cutAtCueBoundary: false,
    });
    expect(
      pairedPlaybackPlan(
        { kind: "video", durationMs: 10_000 },
        20_000,
        () => false,
      ),
    ).toEqual({
      rate: 1,
      loop: true,
      cutAtCueBoundary: false,
    });
    expect(
      pairedPlaybackPlan(
        { kind: "video", durationMs: 30_000 },
        20_000,
        () => true,
      ),
    ).toEqual({
      rate: 1.5,
      loop: false,
      cutAtCueBoundary: false,
    });
    expect(
      pairedPlaybackPlan(
        { kind: "video", durationMs: 30_000 },
        20_000,
        () => false,
      ).cutAtCueBoundary,
    ).toBe(true);
    expect(
      pairedPlaybackPlan({ kind: "video", durationMs: 20_000 }, 20_000, () =>
        true,
      ),
    ).toEqual({
      rate: 1,
      loop: false,
      cutAtCueBoundary: false,
    });
  });

  it("swaps only complete pair slots", () => {
    const slots = new PairSlots<string>();
    slots.prepare("next");
    expect(slots.visible).toBeNull();
    slots.activate();
    expect(slots.visible).toBe("next");
    slots.prepare("following");
    expect(slots.visible).toBe("next");
    slots.activate();
    expect(slots.visible).toBe("following");
  });

  it("keeps intermediate overlay columns timed and final column looping", () => {
    const overlay = new OverlayPlayback();
    overlay.set("command", [column(1_000, "first"), column(2_000, "last")], 0);
    overlay.prepareFirstPair(column(1_000, "first"));
    overlay.activatePrepared("command", 0);
    expect(overlay.visibleColumn(500)?.files["2"]?.name).toBe("first-2.png");
    expect(overlay.visibleColumn(1_500)?.files["2"]?.name).toBe("last-2.png");
    expect(overlay.visibleColumn(100_000)?.files["2"]?.name).toBe("last-2.png");
    overlay.clear();
    expect(overlay.visibleColumn(100_000)).toBeNull();
  });

  it("renders black while powered off and resets cue origin on power on", () => {
    let now = 10;
    const power = new PerimeterPower(() => now);
    expect(power.isPowered).toBe(false);
    now = 20;
    expect(power.setPowered(true)).toBe(true);
    expect(power.cueOrigin).toBe(20);
    expect(power.setPowered(true)).toBe(false);
    expect(power.setPowered(false)).toBe(true);
  });
});
