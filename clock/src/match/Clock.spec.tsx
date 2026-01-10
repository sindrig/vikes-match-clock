import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import Clock from "./Clock";
import { initialState as matchInitialState } from "../reducers/match";
import { Sports } from "../constants";
import type { RootState } from "../types";

const mockStore = configureStore([]);

const createMockState = (matchOverrides = {}): Partial<RootState> => ({
  match: {
    ...matchInitialState,
    ...matchOverrides,
  },
});

const renderWithStore = (
  component: React.ReactElement,
  state: Partial<RootState>,
) => {
  const store = mockStore(state);
  return render(<Provider store={store}>{component}</Provider>);
};

describe("Clock component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("renders with initial time 00:00 when not started", () => {
      renderWithStore(<Clock className="matchclock" />, createMockState());

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });

    it("renders with the provided className", () => {
      const { container } = renderWithStore(
        <Clock className="matchclock" />,
        createMockState(),
      );

      expect(container.querySelector(".matchclock")).toBeInTheDocument();
    });

    it("displays elapsed time when match is paused with timeElapsed", () => {
      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: 0,
          timeElapsed: 2700000,
        }),
      );

      expect(screen.getByText("45:00")).toBeInTheDocument();
    });
  });

  describe("running clock", () => {
    it("updates time when match is started", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: now - 60000,
          timeElapsed: 0,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText("01:00")).toBeInTheDocument();
    });

    it("combines timeElapsed with running time", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: now - 30000,
          timeElapsed: 30000,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText("01:00")).toBeInTheDocument();
    });
  });

  describe("half-stop behavior", () => {
    it("displays time approaching halfStop", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: now - 2640000,
          timeElapsed: 0,
          halfStops: [45, 90],
          showInjuryTime: true,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText("44:00")).toBeInTheDocument();
    });
  });

  describe("injury time display", () => {
    it("shows time beyond halfStop when showInjuryTime is true", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: now - 2760000,
          timeElapsed: 0,
          halfStops: [45, 90],
          showInjuryTime: true,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText("46:00")).toBeInTheDocument();
    });
  });

  describe("countdown mode", () => {
    it("displays countdown time format", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          started: now + 120000,
          timeElapsed: 0,
          countdown: true,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      const clockElement = screen.getByText(/\d+:\d+/);
      expect(clockElement).toBeInTheDocument();
    });
  });

  describe("match type", () => {
    it("renders for football match type", () => {
      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          matchType: Sports.Football,
        }),
      );

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });

    it("renders for handball match type", () => {
      renderWithStore(
        <Clock className="matchclock" />,
        createMockState({
          matchType: Sports.Handball,
        }),
      );

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });
  });
});
