import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import ScoreBoard from "./ScoreBoard";
import { initialState as matchInitialState } from "../reducers/match";
import { initialState as viewInitialState } from "../reducers/view";
import { initialState as controllerInitialState } from "../reducers/controller";
import { initialState as remoteInitialState } from "../reducers/remote";
import { Sports } from "../constants";
import type { RootState } from "../types";

vi.mock("../sounds/buzzersound.mp3", () => ({ default: "" }));

const mockStore = configureStore([]);

const createMockState = (
  matchOverrides = {},
  viewOverrides = {},
): Partial<RootState> => ({
  match: {
    ...matchInitialState,
    ...matchOverrides,
  },
  view: {
    ...viewInitialState,
    vp: {
      ...viewInitialState.vp,
      key: "default",
    },
    ...viewOverrides,
  },
  controller: controllerInitialState,
  remote: remoteInitialState,
});

const renderWithStore = (state: Partial<RootState>) => {
  const store = mockStore(state);
  return render(
    <Provider store={store}>
      <ScoreBoard />
    </Provider>,
  );
};

describe("ScoreBoard component", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = renderWithStore(createMockState());
      expect(container.querySelector(".scoreboard")).toBeInTheDocument();
    });

    it("renders with correct match type class", () => {
      const { container } = renderWithStore(
        createMockState({ matchType: Sports.Football }),
      );

      expect(
        container.querySelector(".scoreboard-football"),
      ).toBeInTheDocument();
    });

    it("renders handball scoreboard class", () => {
      const { container } = renderWithStore(
        createMockState({ matchType: Sports.Handball }),
      );

      expect(
        container.querySelector(".scoreboard-handball"),
      ).toBeInTheDocument();
    });
  });

  describe("score display", () => {
    it("displays home team score", () => {
      renderWithStore(createMockState({ homeScore: 3 }));

      const scores = screen.getAllByText("3");
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it("displays away team score", () => {
      renderWithStore(createMockState({ awayScore: 2 }));

      const scores = screen.getAllByText("2");
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it("displays both scores correctly", () => {
      renderWithStore(createMockState({ homeScore: 1, awayScore: 4 }));

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  describe("injury time indicator", () => {
    it("shows injury time when greater than 0", () => {
      renderWithStore(createMockState({ injuryTime: 3 }));

      expect(screen.getByText("+3")).toBeInTheDocument();
    });

    it("does not show injury time indicator when 0", () => {
      renderWithStore(createMockState({ injuryTime: 0 }));

      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("shows large injury time values", () => {
      renderWithStore(createMockState({ injuryTime: 10 }));

      expect(screen.getByText("+10")).toBeInTheDocument();
    });
  });

  describe("red cards display", () => {
    it("displays home team red cards", () => {
      const { container } = renderWithStore(
        createMockState({ homeRedCards: 1 }),
      );

      const redCards = container.querySelectorAll(".home .red-card");
      expect(redCards.length).toBe(1);
    });

    it("displays multiple red cards for away team", () => {
      const { container } = renderWithStore(
        createMockState({ awayRedCards: 2 }),
      );

      const redCards = container.querySelectorAll(".away .red-card");
      expect(redCards.length).toBe(2);
    });

    it("does not display red cards when count is 0", () => {
      const { container } = renderWithStore(
        createMockState({ homeRedCards: 0, awayRedCards: 0 }),
      );

      const redCards = container.querySelectorAll(".red-card");
      expect(redCards.length).toBe(0);
    });
  });

  describe("penalties display", () => {
    it("renders home team penalties", () => {
      const { container } = renderWithStore(
        createMockState({
          home2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
          ],
        }),
      );

      const homePenalties = container.querySelectorAll(".home .penalties > *");
      expect(homePenalties.length).toBe(1);
    });

    it("renders multiple penalties for away team", () => {
      const { container } = renderWithStore(
        createMockState({
          away2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
            { atTimeElapsed: 90000, key: "pen-2", penaltyLength: 120000 },
          ],
        }),
      );

      const awayPenalties = container.querySelectorAll(".away .penalties > *");
      expect(awayPenalties.length).toBe(2);
    });
  });

  describe("timeout display", () => {
    it("renders timeout clock when timeout is active", () => {
      const { container } = renderWithStore(
        createMockState({ timeout: Date.now() }),
      );

      expect(container.querySelector(".timeoutclock")).toBeInTheDocument();
    });

    it("does not render timeout clock when no timeout", () => {
      const { container } = renderWithStore(createMockState({ timeout: 0 }));

      expect(container.querySelector(".timeoutclock")).not.toBeInTheDocument();
    });
  });

  describe("team timeouts indicator", () => {
    it("displays home team timeouts", () => {
      const { container } = renderWithStore(
        createMockState({ homeTimeouts: 2 }),
      );

      const homeTimeouts = container.querySelectorAll(
        ".team-timeouts-home .team-timeout",
      );
      expect(homeTimeouts.length).toBe(2);
    });

    it("displays away team timeouts", () => {
      const { container } = renderWithStore(
        createMockState({ awayTimeouts: 3 }),
      );

      const awayTimeouts = container.querySelectorAll(
        ".team-timeouts-away .team-timeout",
      );
      expect(awayTimeouts.length).toBe(3);
    });
  });

  describe("viewport styling", () => {
    it("applies viewport key as class", () => {
      const { container } = renderWithStore(
        createMockState(
          {},
          {
            vp: {
              ...viewInitialState.vp,
              key: "large-display",
            },
          },
        ),
      );

      expect(
        container.querySelector(".scoreboard-large-display"),
      ).toBeInTheDocument();
    });
  });

  describe("buzzer sound", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("plays buzzer sound when buzzer is active in handball match", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: now,
        }),
      );

      const audio = container.querySelector("audio");
      expect(audio).toBeInTheDocument();
    });

    it("does not play buzzer for football matches", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Football,
          buzzer: now,
        }),
      );

      const audio = container.querySelector("audio");
      expect(audio).not.toBeInTheDocument();
    });

    it("does not play buzzer when buzzer timestamp is false", () => {
      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: false,
        }),
      );

      const audio = container.querySelector("audio");
      expect(audio).not.toBeInTheDocument();
    });

    it("stops playing buzzer after 3 seconds", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: now,
        }),
      );

      expect(container.querySelector("audio")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3001);
      });

      expect(container.querySelector("audio")).not.toBeInTheDocument();
    });

    it("does not play buzzer if timestamp is more than 3 seconds in the past", () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const fourSecondsAgo = now - 4000;

      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: fourSecondsAgo,
        }),
      );

      const audio = container.querySelector("audio");
      expect(audio).not.toBeInTheDocument();
    });

    it("plays buzzer for remaining duration when timestamp started 1 second ago", () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const oneSecondAgo = now - 1000;

      const { container } = renderWithStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: oneSecondAgo,
        }),
      );

      expect(container.querySelector("audio")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2001);
      });

      expect(container.querySelector("audio")).not.toBeInTheDocument();
    });

    it("stops buzzer when buzzer timestamp becomes false", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const store = mockStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: now,
        }),
      );

      const { container, rerender } = render(
        <Provider store={store}>
          <ScoreBoard />
        </Provider>,
      );

      expect(container.querySelector("audio")).toBeInTheDocument();

      const storeWithBuzzerOff = mockStore(
        createMockState({
          matchType: Sports.Handball,
          buzzer: false,
        }),
      );

      rerender(
        <Provider store={storeWithBuzzerOff}>
          <ScoreBoard />
        </Provider>,
      );

      expect(container.querySelector("audio")).not.toBeInTheDocument();
    });
  });
});
