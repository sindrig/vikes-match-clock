import { describe, expect, it } from "vitest";
import { createBaseTimeline, cueIndexAt } from "./timeline";

describe("perimeter timeline", () => {
  it("derives ordered cues from elapsed monotonic time", () => {
    expect(cueIndexAt(0, 0, 20_000, 3)).toBe(0);
    expect(cueIndexAt(20_000, 0, 20_000, 3)).toBe(1);
    expect(cueIndexAt(60_000, 0, 20_000, 3)).toBe(0);
    expect(cueIndexAt(95_000, 0, 20_000, 3)).toBe(1);
  });

  it("handles delayed callbacks, empty playlists, and restarts", () => {
    const timeline = createBaseTimeline(20_000, 2);
    expect(timeline.cueIndex(1)).toBeNull();
    timeline.start(100);
    expect(timeline.cueIndex(100)).toBe(0);
    expect(timeline.cueIndex(45_100)).toBe(0);
    timeline.stop();
    expect(timeline.cueIndex(45_100)).toBeNull();
    expect(createBaseTimeline(20_000, 0).cueIndex(0)).toBeNull();
  });

  it("skipForward ends the current cue immediately", () => {
    const timeline = createBaseTimeline(20_000, 3);
    timeline.start(0);
    // 10s into cue 0
    expect(timeline.skipForward(10_000)).toBe(true);
    expect(timeline.cueIndex(10_000)).toBe(1);
    // The next boundary is one full cue duration after the skip.
    expect(timeline.cueIndex(29_999)).toBe(1);
    expect(timeline.cueIndex(30_000)).toBe(2);
    // Repeated skips wrap around through the cue count.
    expect(timeline.skipForward(30_000)).toBe(true);
    expect(timeline.cueIndex(30_000)).toBe(0);
    expect(timeline.skipForward(35_000)).toBe(true);
    expect(timeline.cueIndex(35_000)).toBe(1);
  });

  it("skipForward is a no-op before start, with one cue, or a zero duration", () => {
    const unstarted = createBaseTimeline(20_000, 2);
    expect(unstarted.skipForward(100)).toBe(false);

    const singleCue = createBaseTimeline(20_000, 1);
    singleCue.start(0);
    expect(singleCue.skipForward(1_000)).toBe(false);
    expect(singleCue.cueIndex(1_000)).toBe(0);

    const zeroDuration = createBaseTimeline(0, 2);
    zeroDuration.start(0);
    expect(zeroDuration.skipForward(1_000)).toBe(false);
  });
});
