import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TimeoutClock from "./TimeoutClock";
import { useMatch } from "../contexts/FirebaseStateContext";
import { TIMEOUT_LENGTH } from "../constants";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
}));

vi.mock("./ClockBase", () => ({
  default: ({
    updateTime,
    className,
  }: {
    updateTime: () => string | null;
    className: string;
  }) => {
    const time = updateTime();
    return <div className={className}>{time ?? "null"}</div>;
  },
}));

const mockedUseMatch = vi.mocked(useMatch);

describe("TimeoutClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("renders null when no timeout is active", () => {
      mockedUseMatch.mockReturnValue({
        match: { timeout: 0 },
        removeTimeout: vi.fn(),
        buzz: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("null")).toBeInTheDocument();
    });

    it("renders with the provided className", () => {
      mockedUseMatch.mockReturnValue({
        match: { timeout: Date.now() },
        removeTimeout: vi.fn(),
        buzz: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      const { container } = render(
        <TimeoutClock className="custom-timeout-clock" />,
      );

      expect(
        container.querySelector(".custom-timeout-clock"),
      ).toBeInTheDocument();
    });

    it("renders initial time when timeout starts", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockedUseMatch.mockReturnValue({
        match: { timeout: now },
        removeTimeout: vi.fn(),
        buzz: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("01:01")).toBeInTheDocument();
    });
  });

  describe("timer countdown", () => {
    it("counts down as time advances", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("01:01")).toBeInTheDocument();

      vi.advanceTimersByTime(10000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:51")).toBeInTheDocument();
    });

    it("shows decreasing time during countdown", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(30000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:31")).toBeInTheDocument();

      vi.advanceTimersByTime(20000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:11")).toBeInTheDocument();
    });
  });

  describe("buzzer trigger", () => {
    it("triggers buzz when 10 seconds remain (warning)", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      expect(buzz).not.toHaveBeenCalled();

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(buzz).toHaveBeenCalledWith(true);
      expect(buzz).toHaveBeenCalledTimes(1);
    });

    it("does not trigger warning buzz multiple times", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);
      expect(buzz).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      rerender(<TimeoutClock className="timeout-clock" />);
      expect(buzz).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      rerender(<TimeoutClock className="timeout-clock" />);
      expect(buzz).toHaveBeenCalledTimes(1);
    });

    it("triggers buzz when timer expires", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(TIMEOUT_LENGTH + 1000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(buzz).toHaveBeenCalledWith(true);
    });
  });

  describe("timer expiry", () => {
    it("calls removeTimeout when timer reaches zero", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      expect(removeTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(TIMEOUT_LENGTH + 1000);
      rerender(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(10);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(removeTimeout).toHaveBeenCalledTimes(1);
    });

    it("delays removeTimeout by 10ms to allow state update", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(TIMEOUT_LENGTH + 1000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(removeTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5);
      expect(removeTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5);
      rerender(<TimeoutClock className="timeout-clock" />);
      expect(removeTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout change detection", () => {
    it("resets warningPlayed when timeout changes", () => {
      const startTime1 = Date.now();
      vi.setSystemTime(startTime1);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime1 },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(buzz).toHaveBeenCalledTimes(1);

      const startTime2 = Date.now();
      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime2 },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(buzz).toHaveBeenCalledTimes(2);
    });

    it("resets warningPlayed when timeout is removed and restarted", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);
      expect(buzz).toHaveBeenCalledTimes(1);

      mockedUseMatch.mockReturnValue({
        match: { timeout: 0 },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(<TimeoutClock className="timeout-clock" />);

      const newStartTime = Date.now();
      mockedUseMatch.mockReturnValue({
        match: { timeout: newStartTime },
        removeTimeout,
        buzz,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(51000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(buzz).toHaveBeenCalledTimes(2);
    });
  });

  describe("time formatting", () => {
    it("formats time as MM:SS", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout: vi.fn(),
        buzz: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      render(<TimeoutClock className="timeout-clock" />);

      const timeDisplay = screen.getByText(/\d{2}:\d{2}/);
      expect(timeDisplay).toBeInTheDocument();
    });

    it("shows 00:00 when timer has expired", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout: vi.fn(),
        buzz: vi.fn(),
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(TIMEOUT_LENGTH + 5000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });
  });
});
