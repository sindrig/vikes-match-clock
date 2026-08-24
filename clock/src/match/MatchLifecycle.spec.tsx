import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import MatchLifecycle from "./MatchLifecycle";
import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { TIMEOUT_LENGTH } from "../constants";

// MatchLifecycle renders nothing and drives transitions purely through the
// context actions it observes. These tests mock the context hooks and verify
// the commit-aware, freshness-gated coordinator behavior: ineligible attempts
// are deferred (never latched), committed transitions latch exactly once,
// concurrent submissions for the same generation are deduplicated, and the
// timeout thresholds align with TimeoutClock's displayed time.

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
}));

const mockedUseMatch = vi.mocked(useMatch);
const mockedUseController = vi.mocked(useController);

const makeMatch = (overrides: Record<string, unknown> = {}) => ({
  started: 0,
  timeElapsed: 0,
  halfStops: [45, 90, 105, 120],
  injuryTimeDisplayMode: "stop",
  countdown: false,
  halftimeCountdown: false,
  timeout: 0,
  home2min: [],
  away2min: [],
  ...overrides,
});

const flushPromises = () =>
  act(async () => {
    await Promise.resolve();
  });

const advanceTicks = (count = 1) =>
  act(() => {
    vi.advanceTimersByTime(count * 100);
  });

const setup = ({
  match = makeMatch(),
  writeEligible = true,
  getServerTime = () => Date.now(),
  currentAsset = null,
  activeQueueId = null,
  playing = false,
  completeCountdownIfCurrent,
  applyHalfStopIfCurrent,
  removeTimeoutIfCurrent,
  removePenaltyIfCurrent,
  completeAssetIfCurrent,
}: {
  match?: ReturnType<typeof makeMatch>;
  writeEligible?: boolean;
  getServerTime?: () => number;
  currentAsset?: unknown;
  activeQueueId?: string | null;
  playing?: boolean;
  completeCountdownIfCurrent?: ReturnType<typeof vi.fn>;
  applyHalfStopIfCurrent?: ReturnType<typeof vi.fn>;
  removeTimeoutIfCurrent?: ReturnType<typeof vi.fn>;
  removePenaltyIfCurrent?: ReturnType<typeof vi.fn>;
  completeAssetIfCurrent?: ReturnType<typeof vi.fn>;
} = {}) => {
  const fns = {
    completeCountdownIfCurrent:
      completeCountdownIfCurrent ?? vi.fn().mockResolvedValue(true),
    applyHalfStopIfCurrent:
      applyHalfStopIfCurrent ?? vi.fn().mockResolvedValue(true),
    removeTimeoutIfCurrent:
      removeTimeoutIfCurrent ?? vi.fn().mockResolvedValue(true),
    removePenaltyIfCurrent:
      removePenaltyIfCurrent ?? vi.fn().mockResolvedValue(true),
    completeAssetIfCurrent:
      completeAssetIfCurrent ?? vi.fn().mockResolvedValue(true),
    buzz: vi.fn(),
  };
  const state = {
    match,
    getServerTime,
    writeEligible,
    currentAsset,
    activeQueueId,
    playing,
  };
  const apply = () => {
    mockedUseMatch.mockReturnValue({
      match: state.match,
      getServerTime: state.getServerTime,
      completeCountdownIfCurrent: fns.completeCountdownIfCurrent,
      applyHalfStopIfCurrent: fns.applyHalfStopIfCurrent,
      removeTimeoutIfCurrent: fns.removeTimeoutIfCurrent,
      removePenaltyIfCurrent: fns.removePenaltyIfCurrent,
      buzz: fns.buzz,
      writeEligible: state.writeEligible,
    } as unknown as ReturnType<typeof useMatch>);
    mockedUseController.mockReturnValue({
      controller: {
        currentAsset: state.currentAsset,
        activeQueueId: state.activeQueueId,
        playing: state.playing,
      },
      completeAssetIfCurrent: fns.completeAssetIfCurrent,
    } as unknown as ReturnType<typeof useController>);
  };
  apply();
  const { rerender } = render(<MatchLifecycle />);
  return {
    fns,
    set: (patch: Partial<typeof state>) => Object.assign(state, patch),
    rerender: () => {
      apply();
      rerender(<MatchLifecycle />);
    },
  };
};

describe("MatchLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("countdown completion", () => {
    it("defers a due countdown while ineligible and retries once eligible", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({ started: now - 1000, countdown: true }),
        writeEligible: false,
      });
      advanceTicks();
      expect(h.fns.completeCountdownIfCurrent).not.toHaveBeenCalled();

      h.set({ writeEligible: true });
      h.rerender();
      expect(h.fns.completeCountdownIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.completeCountdownIfCurrent).toHaveBeenCalledWith({
        started: now - 1000,
        countdown: true,
        halftimeCountdown: false,
      });

      await flushPromises();
      advanceTicks();
      expect(h.fns.completeCountdownIfCurrent).toHaveBeenCalledTimes(1);
    });

    it("latches a countdown only after a committed transition", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({ started: now - 1000, countdown: true }),
      });
      expect(h.fns.completeCountdownIfCurrent).toHaveBeenCalledTimes(1);

      await flushPromises();
      advanceTicks(3);
      expect(h.fns.completeCountdownIfCurrent).toHaveBeenCalledTimes(1);
    });

    it("does not latch an uncommitted countdown and retries on the next tick", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      let committed = false;
      const completeCountdownIfCurrent = vi.fn(() =>
        Promise.resolve(committed),
      );
      setup({
        match: makeMatch({ started: now - 1000, countdown: true }),
        completeCountdownIfCurrent,
      });
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(1);

      // The first attempt aborts (uncommitted): it must NOT latch.
      await flushPromises();
      advanceTicks();
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(2);
      await flushPromises();

      // The next attempt succeeds: the transition latches and stops retrying.
      committed = true;
      advanceTicks();
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(3);
      await flushPromises();
      advanceTicks();
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(3);
    });

    it("deduplicates concurrent in-flight attempts for the same generation", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      let resolve!: (v: boolean) => void;
      const deferred = new Promise<boolean>((res) => {
        resolve = res;
      });
      const completeCountdownIfCurrent = vi.fn(() => deferred);
      const h = setup({
        match: makeMatch({ started: now - 1000, countdown: true }),
        completeCountdownIfCurrent,
      });
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(1);

      // While the transaction is still in flight, subsequent ticks must not
      // submit a duplicate attempt.
      advanceTicks(3);
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(1);

      resolve(true);
      await flushPromises();
      advanceTicks(3);
      expect(completeCountdownIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.buzz).not.toHaveBeenCalled();
    });
  });

  describe("penalty expiry", () => {
    it("defers a due penalty while ineligible and removes it once eligible", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({
          started: now - 5000,
          home2min: [{ key: "p1", atTimeElapsed: 1000, penaltyLength: 2000 }],
        }),
        writeEligible: false,
      });
      advanceTicks();
      expect(h.fns.removePenaltyIfCurrent).not.toHaveBeenCalled();

      h.set({ writeEligible: true });
      h.rerender();
      expect(h.fns.removePenaltyIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.removePenaltyIfCurrent).toHaveBeenCalledWith({
        key: "p1",
        atTimeElapsed: 1000,
        penaltyLength: 2000,
      });

      await flushPromises();
      advanceTicks();
      expect(h.fns.removePenaltyIfCurrent).toHaveBeenCalledTimes(1);
    });

    it("removes a penalty the moment its remaining time reaches zero", () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({
          started: now,
          home2min: [{ key: "p1", atTimeElapsed: 0, penaltyLength: 1000 }],
        }),
      });
      // Mount: 0ms elapsed → remaining 1000ms. Still shown, not removed.
      expect(h.fns.removePenaltyIfCurrent).not.toHaveBeenCalled();

      // 900ms elapsed: remaining 100ms > 0 → still shown.
      advanceTicks(9);
      expect(h.fns.removePenaltyIfCurrent).not.toHaveBeenCalled();

      // Exactly at penaltyLength elapsed: remaining = 0 → removed (aligned
      // with TwoMinClock clamping its display to 00:00 at this boundary).
      advanceTicks(1);
      expect(h.fns.removePenaltyIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.removePenaltyIfCurrent).toHaveBeenCalledWith({
        key: "p1",
        atTimeElapsed: 0,
        penaltyLength: 1000,
      });
    });
  });

  describe("timeout expiry alignment", () => {
    it("warns at displayed 00:10 and clears/buzzes at displayed 00:00", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({ timeout: now }),
      });
      expect(h.fns.buzz).not.toHaveBeenCalled();
      expect(h.fns.removeTimeoutIfCurrent).not.toHaveBeenCalled();

      // 50s elapsed: remaining = TIMEOUT_LENGTH - 50000 + 1000 = 11000 →
      // displayed 00:11. No warning yet.
      act(() => {
        vi.advanceTimersByTime(50000);
      });
      expect(h.fns.buzz).not.toHaveBeenCalled();

      // 51s elapsed: remaining = 10000 → displayed 00:10. Warning fires once.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(h.fns.buzz).toHaveBeenCalledTimes(1);
      expect(h.fns.buzz).toHaveBeenCalledWith(true);
      expect(h.fns.removeTimeoutIfCurrent).not.toHaveBeenCalled();

      // 60s elapsed: remaining = 1000 → displayed 00:01. Still shown, not
      // cleared (the old off-by-one cleared here).
      act(() => {
        vi.advanceTimersByTime(9000);
      });
      expect(h.fns.removeTimeoutIfCurrent).not.toHaveBeenCalled();

      // 61s elapsed: remaining = 0 → displayed 00:00. Clear + commit buzz.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(h.fns.removeTimeoutIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.removeTimeoutIfCurrent).toHaveBeenCalledWith({
        timeout: now,
      });

      await flushPromises();
      expect(h.fns.buzz).toHaveBeenCalledTimes(2);
    });

    it("defers timeout expiry while ineligible and retries once eligible", () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({ timeout: now }),
        writeEligible: false,
      });
      act(() => {
        vi.advanceTimersByTime(TIMEOUT_LENGTH + 1000);
      });
      expect(h.fns.removeTimeoutIfCurrent).not.toHaveBeenCalled();

      h.set({ writeEligible: true });
      h.rerender();
      expect(h.fns.removeTimeoutIfCurrent).toHaveBeenCalledTimes(1);
    });

    it("does not warn after the timeout has already expired while ineligible", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const h = setup({
        match: makeMatch({ timeout: now }),
        writeEligible: false,
      });

      // The timeout runs all the way out while the client is ineligible, so
      // no warning or expiry is fired yet.
      act(() => {
        vi.advanceTimersByTime(TIMEOUT_LENGTH + 5000);
      });
      expect(h.fns.buzz).not.toHaveBeenCalled();
      expect(h.fns.removeTimeoutIfCurrent).not.toHaveBeenCalled();

      // Once eligible, the already-expired timeout is cleared and buzzed, but
      // the 10s warning must NOT also fire (the timeout is past 00:10).
      h.set({ writeEligible: true });
      h.rerender();
      expect(h.fns.removeTimeoutIfCurrent).toHaveBeenCalledTimes(1);

      await flushPromises();
      expect(h.fns.buzz).toHaveBeenCalledTimes(1);
      expect(h.fns.buzz).toHaveBeenCalledWith(true);
    });
  });

  describe("timed asset completion", () => {
    it("completes a due asset after eligibility returns without restarting its timer", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const currentAsset = {
        asset: { key: "a1", type: "image", url: "https://example.com/a.png" },
        time: 5,
      };
      const h = setup({
        match: makeMatch(),
        writeEligible: false,
        currentAsset,
        activeQueueId: "q1",
        playing: true,
      });
      expect(h.fns.completeAssetIfCurrent).not.toHaveBeenCalled();

      // Advance well past the 5s due time while ineligible: no attempt.
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(h.fns.completeAssetIfCurrent).not.toHaveBeenCalled();

      // Eligibility returns: the already-due asset completes immediately
      // (anchored to the original due time, not restarted).
      h.set({ writeEligible: true });
      h.rerender();
      expect(h.fns.completeAssetIfCurrent).toHaveBeenCalledTimes(1);
      expect(h.fns.completeAssetIfCurrent).toHaveBeenCalledWith({
        assetKey: "a1",
        time: 5,
        activeQueueId: "q1",
        playing: true,
      });

      await flushPromises();
      advanceTicks();
      expect(h.fns.completeAssetIfCurrent).toHaveBeenCalledTimes(1);
    });
  });
});
