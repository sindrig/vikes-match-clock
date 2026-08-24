import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import Clock from "./Clock";
import { InjuryTimeDisplayMode } from "../types";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
}));

import { useMatch } from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);

const NOW = 5_000_000_000_000;

const renderClock = ({
  started,
  halfStops,
  injuryTimeDisplayMode,
  timeElapsed = 0,
}: {
  started: number;
  halfStops: number[];
  injuryTimeDisplayMode: InjuryTimeDisplayMode;
  timeElapsed?: number;
}) => {
  const pauseMatch = vi.fn();
  const buzz = vi.fn();
  mockedUseMatch.mockReturnValue({
    match: {
      started,
      halfStops,
      timeElapsed,
      injuryTimeDisplayMode,
      countdown: false,
    } as ReturnType<typeof useMatch>["match"],
    pauseMatch,
    buzz,
    getServerTime: () => NOW,
  } as unknown as ReturnType<typeof useMatch>);

  const { container } = render(<Clock className="matchclock" />);
  return { container, pauseMatch, buzz };
};

describe("Clock injuryTimeDisplayMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("stop mode", () => {
    it("clamps the display at the half-stop boundary without mutating state", () => {
      const started = NOW - (46 * 60 + 10) * 1000;
      const { container, pauseMatch, buzz } = renderClock({
        started,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "stop",
      });

      expect(container.textContent).toContain("45:00");
      // Clock is render-only: the half-stop transition is handled by the
      // MatchLifecycle coordinator, never by the renderer.
      expect(pauseMatch).not.toHaveBeenCalled();
      expect(buzz).not.toHaveBeenCalled();
    });

    it("shows normal mm:ss before the half-stop", () => {
      const started = NOW - (44 * 60 + 30) * 1000;
      const { container, pauseMatch, buzz } = renderClock({
        started,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "stop",
      });

      expect(container.textContent).toContain("44:30");
      expect(pauseMatch).not.toHaveBeenCalled();
      expect(buzz).not.toHaveBeenCalled();
    });
  });

  describe("full mode", () => {
    it("continues showing elapsed minutes and seconds past the half-stop", () => {
      const started = NOW - (46 * 60 + 10) * 1000;
      const { container, pauseMatch } = renderClock({
        started,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "full",
      });

      expect(container.textContent).toContain("46:10");
      expect(pauseMatch).not.toHaveBeenCalled();
    });
  });

  describe("minutes mode", () => {
    it("shows normal mm:ss before the half-stop", () => {
      const started = NOW - (44 * 60 + 30) * 1000;
      const { container, pauseMatch } = renderClock({
        started,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "minutes",
      });

      expect(container.textContent).toContain("44:30");
      expect(pauseMatch).not.toHaveBeenCalled();
    });

    it("renders whole minutes with :00 seconds past the half-stop", () => {
      const started = NOW - (46 * 60 + 10) * 1000;
      const { container, pauseMatch, buzz } = renderClock({
        started,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "minutes",
      });

      expect(container.textContent).toContain("46:00");
      expect(pauseMatch).not.toHaveBeenCalled();
      expect(buzz).not.toHaveBeenCalled();
    });

    it("keeps whole-minute rendering while paused past the half-stop", () => {
      const { container } = renderClock({
        started: 0,
        halfStops: [45, 90],
        injuryTimeDisplayMode: "minutes",
        timeElapsed: (47 * 60 + 42) * 1000,
      });

      expect(container.textContent).toContain("47:00");
    });
  });
});
