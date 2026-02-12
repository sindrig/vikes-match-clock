import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import TwoMinClock from "./TwoMinClock";

// Mock the context hooks
vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
}));

import { useMatch } from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);

describe("TwoMinClock component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial render", () => {
    it("renders with penalty length when match not started", () => {
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      expect(screen.getByText("02:00")).toBeInTheDocument();
    });

    it("renders with className 'penalty'", () => {
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      const { container } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      expect(container.querySelector(".penalty")).toBeInTheDocument();
    });

    it("displays formatted time from penaltyLength", () => {
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={65000}
          uniqueKey="test-penalty"
        />,
      );

      expect(screen.getByText("01:05")).toBeInTheDocument();
    });
  });

  describe("timer countdown", () => {
    it("updates countdown when match is running", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Initial: 120s remaining (timeElapsed - atTimeElapsed = 0, Date.now() - started = 0)
      expect(screen.getByText("02:00")).toBeInTheDocument();

      // Advance by 30 seconds
      act(() => {
        currentTime = 1030000;
        vi.advanceTimersByTime(30000);
      });

      // Now: 90s remaining (Date.now() - started = 30000, total elapsed = 30000)
      expect(screen.getByText("01:30")).toBeInTheDocument();
    });

    it("calculates remaining time from timeElapsed when paused", () => {
      const mockRemovePenalty = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 50000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={10000}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // timeElapsed (50000) - atTimeElapsed (10000) = 40000ms elapsed
      // 120000 - 40000 = 80000ms remaining = 01:20
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("01:20")).toBeInTheDocument();
    });

    it("combines timeElapsed and Date.now() when running", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 30000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={10000}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // timeElapsed - atTimeElapsed = 30000 - 10000 = 20000ms
      // Date.now() - started = 0ms (not advanced yet)
      // Total elapsed: 20000ms
      // Remaining: 120000 - 20000 = 100000ms = 01:40
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("01:40")).toBeInTheDocument();

      // Advance by 10 seconds
      act(() => {
        currentTime = 1010000;
        vi.advanceTimersByTime(10000);
      });
      // Total elapsed: 20000 + 10000 = 30000ms
      // Remaining: 120000 - 30000 = 90000ms = 01:30
      expect(screen.getByText("01:30")).toBeInTheDocument();
    });
  });

  describe("penalty expiry", () => {
    it("calls removePenalty when time expires", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 110000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty-123"
        />,
      );

      // Already 110s elapsed from timeElapsed
      // Remaining: 120000 - 110000 = 10000ms = 10s

      // Advance by 11 seconds to trigger expiry
      act(() => {
        currentTime = 1011000;
        vi.advanceTimersByTime(11000);
      });

      expect(mockRemovePenalty).toHaveBeenCalledWith("test-penalty-123");
    });

    it("calls removePenalty immediately if penalty already expired", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 150000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="expired-penalty"
        />,
      );

      // timeElapsed (150000) > penaltyLength (120000)
      // Should call removePenalty on first update (100ms interval)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockRemovePenalty).toHaveBeenCalledWith("expired-penalty");
    });
  });

  describe("interval cleanup", () => {
    it("clears interval on unmount", () => {
      const mockRemovePenalty = vi.fn();
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      const { unmount } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("updates interval when updateTime callback changes", () => {
      const mockRemovePenalty = vi.fn();
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      const initialCallCount = setIntervalSpy.mock.calls.length;

      // Change a dependency to trigger updateTime callback change
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 5000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Should have created a new interval
      expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(
        initialCallCount,
      );
      setIntervalSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("handles transition from started to stopped", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Initial render with timer running (timeElapsed - atTimeElapsed = 0)
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("02:00")).toBeInTheDocument();

      // Advance time and stop the match
      currentTime = 1010000;
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 10000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Now using timeElapsed only: 10000 - 0 = 10000ms elapsed
      // Remaining: 120000 - 10000 = 110000ms = 01:50
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("01:50")).toBeInTheDocument();
    });

    it("resets to null when both started and timeElapsed are 0", () => {
      const mockRemovePenalty = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: {
          started: Date.now(),
          timeElapsed: 10000,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Initial with timer running
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText(/\d+:\d+/)).toBeInTheDocument();

      // Reset match to initial state
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Should display penaltyLength fallback
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("02:00")).toBeInTheDocument();
    });

    it("handles very short penalty durations", () => {
      const mockRemovePenalty = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={1000}
          uniqueKey="short-penalty"
        />,
      );

      // 1 second penalty
      expect(screen.getByText("00:01")).toBeInTheDocument();
    });

    it("handles penalties with millisecond precision", () => {
      const mockRemovePenalty = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={75500}
          uniqueKey="precise-penalty"
        />,
      );

      // 75.5 seconds = 01:15 (formatMillisAsTime rounds down)
      expect(screen.getByText("01:15")).toBeInTheDocument();
    });
  });

  describe("updateTime behavior", () => {
    it("calls updateTime on 100ms interval", () => {
      const mockRemovePenalty = vi.fn();
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Verify setInterval was called with 100ms
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      setIntervalSpy.mockRestore();
    });

    it("does not remove penalty when time is positive", () => {
      const mockRemovePenalty = vi.fn();
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      // Advance by 1 minute (half the penalty)
      act(() => {
        currentTime = 1060000;
        vi.advanceTimersByTime(60000);
      });

      // Should still have time remaining, not removed
      expect(mockRemovePenalty).not.toHaveBeenCalled();
      expect(screen.getByText("01:00")).toBeInTheDocument();
    });
  });
});
