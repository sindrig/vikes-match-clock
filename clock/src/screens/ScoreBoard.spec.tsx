import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import ScoreBoard from "./ScoreBoard";
import { LocalStateProvider } from "../contexts/LocalStateContext";
import { FirebaseStateProvider } from "../contexts/FirebaseStateContext";

vi.mock("../sounds/buzzersound.mp3", () => ({ default: "" }));

const renderWithProviders = () => {
  return render(
    <LocalStateProvider>
      <FirebaseStateProvider
        sync={false}
        listenPrefix=""
        isAuthenticated={false}
      >
        <ScoreBoard />
      </FirebaseStateProvider>
    </LocalStateProvider>,
  );
};

describe("ScoreBoard component", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = renderWithProviders();
      expect(container.querySelector(".scoreboard")).toBeInTheDocument();
    });

    it("renders with football match type class by default", () => {
      const { container } = renderWithProviders();

      expect(
        container.querySelector(".scoreboard-football"),
      ).toBeInTheDocument();
    });

    it("renders with viken viewport class by default", () => {
      const { container } = renderWithProviders();

      expect(container.querySelector(".scoreboard-viken")).toBeInTheDocument();
    });
  });

  describe("score display", () => {
    it("displays home team score element", () => {
      const { container } = renderWithProviders();

      const homeTeam = container.querySelector(".team.home");
      const score = homeTeam?.querySelector(".score");
      expect(score).toBeInTheDocument();
      expect(score).toHaveTextContent("0");
    });

    it("displays away team score element", () => {
      const { container } = renderWithProviders();

      const awayTeam = container.querySelector(".team.away");
      const score = awayTeam?.querySelector(".score");
      expect(score).toBeInTheDocument();
      expect(score).toHaveTextContent("0");
    });

    it("displays both score elements with value 0", () => {
      const { container } = renderWithProviders();

      const scores = container.querySelectorAll(".score");
      expect(scores).toHaveLength(2);
      scores.forEach((score) => {
        expect(score).toHaveTextContent("0");
      });
    });
  });

  describe("injury time indicator", () => {
    it("does not show injury time indicator when injuryTime is 0", () => {
      renderWithProviders();

      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });
  });

  describe("red cards display", () => {
    it("does not display red cards when count is 0", () => {
      const { container } = renderWithProviders();

      const redCards = container.querySelectorAll(".red-card");
      expect(redCards.length).toBe(0);
    });
  });

  describe("penalties display", () => {
    it("has empty penalties containers with default state", () => {
      const { container } = renderWithProviders();

      const homePenalties = container.querySelectorAll(".home .penalties > *");
      const awayPenalties = container.querySelectorAll(".away .penalties > *");
      expect(homePenalties.length).toBe(0);
      expect(awayPenalties.length).toBe(0);
    });
  });

  describe("timeout display", () => {
    it("does not render timeout clock when no timeout (default state)", () => {
      const { container } = renderWithProviders();

      expect(container.querySelector(".timeoutclock")).not.toBeInTheDocument();
    });
  });

  describe("team timeouts indicator", () => {
    it("has empty team timeouts containers with default state", () => {
      const { container } = renderWithProviders();

      const homeTimeouts = container.querySelectorAll(
        ".team-timeouts-home .team-timeout",
      );
      const awayTimeouts = container.querySelectorAll(
        ".team-timeouts-away .team-timeout",
      );
      expect(homeTimeouts.length).toBe(0);
      expect(awayTimeouts.length).toBe(0);
    });
  });

  describe("team structure", () => {
    it("renders home and away team containers", () => {
      const { container } = renderWithProviders();

      expect(container.querySelector(".team.home")).toBeInTheDocument();
      expect(container.querySelector(".team.away")).toBeInTheDocument();
    });

    it("renders clock element", () => {
      const { container } = renderWithProviders();

      expect(container.querySelector(".matchclock")).toBeInTheDocument();
    });
  });

  describe("buzzer sound", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not render audio element with default state (no buzzer)", () => {
      const { container } = renderWithProviders();

      const audio = container.querySelector("audio");
      expect(audio).not.toBeInTheDocument();
    });

    it("no audio element after time advances with default state", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { container } = renderWithProviders();

      act(() => {
        vi.advanceTimersByTime(3001);
      });

      expect(container.querySelector("audio")).not.toBeInTheDocument();
    });

    it("maintains no audio on rerender with default state", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { container, rerender } = renderWithProviders();

      expect(container.querySelector("audio")).not.toBeInTheDocument();

      rerender(
        <LocalStateProvider>
          <FirebaseStateProvider
            sync={false}
            listenPrefix=""
            isAuthenticated={false}
          >
            <ScoreBoard />
          </FirebaseStateProvider>
        </LocalStateProvider>,
      );

      expect(container.querySelector("audio")).not.toBeInTheDocument();
    });
  });
});
