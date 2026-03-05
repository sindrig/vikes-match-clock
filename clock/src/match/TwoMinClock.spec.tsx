import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import TwoMinClock from "./TwoMinClock";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
}));

import { useMatch } from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);

const makeGetServerTime = () => () => Date.now();

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
        getServerTime: makeGetServerTime(),
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
        getServerTime: makeGetServerTime(),
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
        getServerTime: makeGetServerTime(),
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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      expect(screen.getByText("02:00")).toBeInTheDocument();

      act(() => {
        currentTime = 1030000;
        vi.advanceTimersByTime(30000);
      });

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={10000}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={10000}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("01:40")).toBeInTheDocument();

      act(() => {
        currentTime = 1010000;
        vi.advanceTimersByTime(10000);
      });
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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty-123"
        />,
      );

      act(() => {
        currentTime = 1011000;
        vi.advanceTimersByTime(11000);
      });

      expect(mockRemovePenalty).toHaveBeenCalledWith("test-penalty-123");
    });

    it("calls removePenalty immediately if penalty already expired", () => {
      const mockRemovePenalty = vi.fn();
      const currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      mockedUseMatch.mockReturnValue({
        match: {
          started: 1000000,
          timeElapsed: 150000,
        },
        removePenalty: mockRemovePenalty,
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="expired-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      const initialCallCount = setIntervalSpy.mock.calls.length;

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 5000,
        },
        removePenalty: mockRemovePenalty,
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("02:00")).toBeInTheDocument();

      currentTime = 1010000;
      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 10000,
        },
        removePenalty: mockRemovePenalty,
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText(/\d+:\d+/)).toBeInTheDocument();

      mockedUseMatch.mockReturnValue({
        match: {
          started: 0,
          timeElapsed: 0,
        },
        removePenalty: mockRemovePenalty,
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      rerender(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={1000}
          uniqueKey="short-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={75500}
          uniqueKey="precise-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

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
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      render(
        <TwoMinClock
          atTimeElapsed={0}
          penaltyLength={120000}
          uniqueKey="test-penalty"
        />,
      );

      act(() => {
        currentTime = 1060000;
        vi.advanceTimersByTime(60000);
      });

      expect(mockRemovePenalty).not.toHaveBeenCalled();
      expect(screen.getByText("01:00")).toBeInTheDocument();
    });
  });
});
