import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TimeoutClock from "./TimeoutClock";
import { useMatch } from "../contexts/FirebaseStateContext";
import { TIMEOUT_LENGTH } from "../constants";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
}));

const makeGetServerTime = () => () => Date.now();

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

  const mockMatch = (timeout: number) =>
    mockedUseMatch.mockReturnValue({
      match: { timeout },
      removeTimeout: vi.fn(),
      buzz: vi.fn(),
      getServerTime: makeGetServerTime(),
    } as unknown as ReturnType<typeof useMatch>);

  describe("rendering", () => {
    it("renders null when no timeout is active", () => {
      mockMatch(0);
      render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("null")).toBeInTheDocument();
    });

    it("renders with the provided className", () => {
      mockMatch(Date.now());

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

      mockMatch(now);
      render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("01:01")).toBeInTheDocument();
    });
  });

  describe("timer countdown", () => {
    it("counts down as time advances", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockMatch(startTime);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("01:01")).toBeInTheDocument();

      vi.advanceTimersByTime(10000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:51")).toBeInTheDocument();
    });

    it("shows decreasing time during countdown", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockMatch(startTime);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(30000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:31")).toBeInTheDocument();

      vi.advanceTimersByTime(20000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:11")).toBeInTheDocument();
    });
  });

  describe("time formatting", () => {
    it("formats time as MM:SS", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockMatch(startTime);

      render(<TimeoutClock className="timeout-clock" />);

      const timeDisplay = screen.getByText(/\d{2}:\d{2}/);
      expect(timeDisplay).toBeInTheDocument();
    });

    it("shows 00:00 when timer has expired (render-only, no mutation)", () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const removeTimeout = vi.fn();
      const buzz = vi.fn();
      mockedUseMatch.mockReturnValue({
        match: { timeout: startTime },
        removeTimeout,
        buzz,
        getServerTime: makeGetServerTime(),
      } as unknown as ReturnType<typeof useMatch>);

      const { rerender } = render(<TimeoutClock className="timeout-clock" />);

      vi.advanceTimersByTime(TIMEOUT_LENGTH + 5000);
      rerender(<TimeoutClock className="timeout-clock" />);

      expect(screen.getByText("00:00")).toBeInTheDocument();
      // Timeout expiry is handled by the MatchLifecycle coordinator through a
      // conditional, freshness-gated action — never by the renderer.
      expect(removeTimeout).not.toHaveBeenCalled();
      expect(buzz).not.toHaveBeenCalled();
    });
  });
});
