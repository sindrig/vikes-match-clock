import { describe, it, expect } from "vitest";
import { Match, ControllerState } from "../types";
import {
  countdownCompletionPrecondition,
  countdownCompletionTransition,
  halfStopPrecondition,
  halfStopTransition,
  timeoutExpiryPrecondition,
  timeoutExpiryTransition,
  penaltyExpiryPrecondition,
  penaltyExpiryTransition,
  timedAssetCompletionPrecondition,
} from "./conditionalTransitions";

const baseMatch: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: [45, 90, 105, 120],
  homeTeam: "Víkingur R",
  awayTeam: "",
  homeTeamId: 103,
  awayTeamId: 0,
  injuryTime: 0,
  matchType: "football",
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false,
  countdown: false,
  halftimeCountdown: false,
  injuryTimeDisplayMode: "full",
};

const baseController: ControllerState = {
  queues: {},
  activeQueueId: null,
  playing: false,
  assetView: "assets",
  view: "match",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
};

describe("countdownCompletionPrecondition", () => {
  const observed = { started: 1000, countdown: true, halftimeCountdown: false };

  it("accepts a matching countdown generation", () => {
    const prev = {
      ...baseMatch,
      started: 1000,
      countdown: true,
      halftimeCountdown: false,
    };
    expect(countdownCompletionPrecondition(observed)(prev)).toBe(true);
  });

  it("rejects an obsolete generation (different started)", () => {
    const prev = {
      ...baseMatch,
      started: 5000,
      countdown: true,
      halftimeCountdown: false,
    };
    expect(countdownCompletionPrecondition(observed)(prev)).toBe(false);
  });

  it("rejects when countdown mode changed (e.g. live match started)", () => {
    const prev = {
      ...baseMatch,
      started: 1000,
      countdown: false,
      halftimeCountdown: false,
    };
    expect(countdownCompletionPrecondition(observed)(prev)).toBe(false);
  });

  it("rejects when a halftime countdown replaced the pre-match one", () => {
    const prev = {
      ...baseMatch,
      started: 1000,
      countdown: true,
      halftimeCountdown: true,
    };
    expect(countdownCompletionPrecondition(observed)(prev)).toBe(false);
  });

  it("a second duplicate attempt after the first completed fails", () => {
    // First attempt applies the transition...
    const before = {
      ...baseMatch,
      started: 1000,
      countdown: true,
      halftimeCountdown: false,
    };
    const after = countdownCompletionTransition({
      halftimeCountdown: false,
      halfStops: before.halfStops,
    })(before);
    // ...so a retry of the same observation is now obsolete.
    expect(countdownCompletionPrecondition(observed)(after)).toBe(false);
  });
});

describe("countdownCompletionTransition", () => {
  it("stops a pre-match countdown without advancing the period", () => {
    const before = {
      ...baseMatch,
      started: 1000,
      countdown: true,
      timeElapsed: 0,
    };
    const after = countdownCompletionTransition({
      halftimeCountdown: false,
      halfStops: before.halfStops,
    })(before);
    expect(after.started).toBe(0);
    expect(after.countdown).toBe(false);
    expect(after.halfStops).toEqual([45, 90, 105, 120]);
  });

  it("advances to the next period on halftime countdown completion", () => {
    const before = {
      ...baseMatch,
      started: 1000,
      countdown: true,
      halftimeCountdown: true,
      timeElapsed: 0,
    };
    const after = countdownCompletionTransition({
      halftimeCountdown: true,
      halfStops: before.halfStops,
    })(before);
    expect(after.started).toBe(0);
    expect(after.countdown).toBe(false);
    expect(after.halftimeCountdown).toBe(false);
    expect(after.timeElapsed).toBe(45 * 60 * 1000);
    expect(after.halfStops).toEqual([90, 105, 120]);
  });
});

describe("halfStopPrecondition", () => {
  it("accepts the exact running generation at the boundary", () => {
    const prev = {
      ...baseMatch,
      started: 5000,
      countdown: false,
      halfStops: [45, 90],
    };
    expect(
      halfStopPrecondition({ started: 5000, halfStopBoundaryMinutes: 45 })(
        prev,
      ),
    ).toBe(true);
  });

  it("rejects an obsolete running generation", () => {
    const prev = {
      ...baseMatch,
      started: 9000,
      countdown: false,
      halfStops: [45, 90],
    };
    expect(
      halfStopPrecondition({ started: 5000, halfStopBoundaryMinutes: 45 })(
        prev,
      ),
    ).toBe(false);
  });

  it("rejects during a countdown", () => {
    const prev = {
      ...baseMatch,
      started: 5000,
      countdown: true,
      halfStops: [45, 90],
    };
    expect(
      halfStopPrecondition({ started: 5000, halfStopBoundaryMinutes: 45 })(
        prev,
      ),
    ).toBe(false);
  });

  it("rejects after the boundary was consumed", () => {
    const prev = {
      ...baseMatch,
      started: 5000,
      countdown: false,
      halfStops: [90],
    };
    expect(
      halfStopPrecondition({ started: 5000, halfStopBoundaryMinutes: 45 })(
        prev,
      ),
    ).toBe(false);
  });
});

describe("halfStopTransition", () => {
  it("pauses at the boundary and advances the half list", () => {
    const before = {
      ...baseMatch,
      started: 5000,
      timeElapsed: 45 * 60 * 1000,
      halfStops: [45, 90, 105, 120],
    };
    const after = halfStopTransition({ halfStopBoundaryMinutes: 45 })(before);
    expect(after.started).toBe(0);
    expect(after.timeElapsed).toBe(45 * 60 * 1000);
    expect(after.halfStops).toEqual([90, 105, 120]);
  });
});

describe("timeoutExpiryPrecondition", () => {
  it("accepts the exact active timeout", () => {
    const prev = { ...baseMatch, timeout: 1234 };
    expect(timeoutExpiryPrecondition({ timeout: 1234 })(prev)).toBe(true);
  });

  it("rejects an obsolete timeout (a newer one started)", () => {
    const prev = { ...baseMatch, timeout: 9999 };
    expect(timeoutExpiryPrecondition({ timeout: 1234 })(prev)).toBe(false);
  });

  it("rejects when the timeout was already cleared", () => {
    const prev = { ...baseMatch, timeout: 0 };
    expect(timeoutExpiryPrecondition({ timeout: 1234 })(prev)).toBe(false);
  });
});

describe("timeoutExpiryTransition", () => {
  it("clears the timeout", () => {
    const before = { ...baseMatch, timeout: 1234 };
    const after = timeoutExpiryTransition()(before);
    expect(after.timeout).toBe(0);
  });
});

describe("penaltyExpiryPrecondition", () => {
  const observed = {
    key: "pen-1",
    atTimeElapsed: 100,
    penaltyLength: 120000,
  };

  it("accepts a matching penalty in home2min", () => {
    const prev = {
      ...baseMatch,
      home2min: [{ key: "pen-1", atTimeElapsed: 100, penaltyLength: 120000 }],
    };
    expect(penaltyExpiryPrecondition(observed)(prev)).toBe(true);
  });

  it("accepts a matching penalty in away2min", () => {
    const prev = {
      ...baseMatch,
      away2min: [{ key: "pen-1", atTimeElapsed: 100, penaltyLength: 120000 }],
    };
    expect(penaltyExpiryPrecondition(observed)(prev)).toBe(true);
  });

  it("rejects when the penalty was already removed", () => {
    expect(penaltyExpiryPrecondition(observed)(baseMatch)).toBe(false);
  });

  it("rejects when the penalty record changed", () => {
    const prev = {
      ...baseMatch,
      home2min: [{ key: "pen-1", atTimeElapsed: 100, penaltyLength: 180000 }],
    };
    expect(penaltyExpiryPrecondition(observed)(prev)).toBe(false);
  });
});

describe("penaltyExpiryTransition", () => {
  it("removes the matching penalty from the correct side", () => {
    const before = {
      ...baseMatch,
      home2min: [
        { key: "keep", atTimeElapsed: 0, penaltyLength: 120000 },
        { key: "pen-1", atTimeElapsed: 100, penaltyLength: 120000 },
      ],
      away2min: [{ key: "pen-1", atTimeElapsed: 100, penaltyLength: 120000 }],
    };
    const after = penaltyExpiryTransition({ key: "pen-1" })(before);
    expect(after.home2min.map((p) => p.key)).toEqual(["keep"]);
    expect(after.away2min.map((p) => p.key)).toEqual([]);
  });
});

describe("timedAssetCompletionPrecondition", () => {
  const observed = {
    assetKey: "img-1",
    time: 3,
    activeQueueId: "q-1",
    playing: true,
  };

  it("accepts the exact current asset and queue", () => {
    const prev = {
      ...baseController,
      currentAsset: { asset: { key: "img-1", type: "image" }, time: 3 },
      activeQueueId: "q-1",
      playing: true,
    };
    expect(timedAssetCompletionPrecondition(observed)(prev)).toBe(true);
  });

  it("rejects when the current asset changed (a newer one is showing)", () => {
    const prev = {
      ...baseController,
      currentAsset: { asset: { key: "img-2", type: "image" }, time: 3 },
      activeQueueId: "q-1",
      playing: true,
    };
    expect(timedAssetCompletionPrecondition(observed)(prev)).toBe(false);
  });

  it("rejects when the queue was consumed or changed", () => {
    const prev = {
      ...baseController,
      currentAsset: { asset: { key: "img-1", type: "image" }, time: 3 },
      activeQueueId: null,
      playing: false,
    };
    expect(timedAssetCompletionPrecondition(observed)(prev)).toBe(false);
  });

  it("rejects when there is no current asset", () => {
    expect(timedAssetCompletionPrecondition(observed)(baseController)).toBe(
      false,
    );
  });
});
