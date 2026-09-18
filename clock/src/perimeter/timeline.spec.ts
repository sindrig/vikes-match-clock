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
});
