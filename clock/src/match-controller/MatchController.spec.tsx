import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import MatchController from "./MatchController";
import { initialState as matchInitialState } from "../reducers/match";
import type { RootState, Match } from "../types";
import ActionTypes from "../ActionTypes";

const mockStore = configureStore([]);

const createMockState = (matchOverrides: Partial<Match> = {}): Partial<RootState> => ({
  match: {
    ...matchInitialState,
    ...matchOverrides,
  },
});

describe("MatchController component", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const store = mockStore(createMockState());
      const { container } = render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(container.querySelector(".match-controller")).toBeInTheDocument();
    });

    it("renders Start button when match is not started", () => {
      const store = mockStore(createMockState({ started: 0 }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(screen.getByText("Start")).toBeInTheDocument();
    });

    it("renders Stop button when match is started", () => {
      const store = mockStore(createMockState({ started: Date.now() }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(screen.getByText("Stop")).toBeInTheDocument();
    });

    it("renders Leiðrétta button", () => {
      const store = mockStore(createMockState());
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(screen.getByText("Leiðrétta")).toBeInTheDocument();
    });
  });

  describe("button interactions", () => {
    it("dispatches startMatch when Start is clicked", () => {
      const store = mockStore(createMockState({ started: 0 }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      fireEvent.click(screen.getByText("Start"));

      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({ type: ActionTypes.startMatch }),
      );
    });

    it("dispatches pauseMatch when Stop is clicked", () => {
      const store = mockStore(createMockState({ started: Date.now() }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      fireEvent.click(screen.getByText("Stop"));

      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({ type: ActionTypes.pauseMatch }),
      );
    });

    it("dispatches selectView when Leiðrétta is clicked", () => {
      const store = mockStore(createMockState());
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      fireEvent.click(screen.getByText("Leiðrétta"));

      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({
          type: ActionTypes.selectView,
          payload: "match",
        }),
      );
    });
  });

  describe("button states", () => {
    it("disables Start/Stop button when timeout is active", () => {
      const store = mockStore(createMockState({ timeout: Date.now() }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      const startButton = screen.getByText("Start");
      expect(startButton).toBeDisabled();
    });

    it("enables Start button when no timeout", () => {
      const store = mockStore(createMockState({ timeout: 0 }));
      render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      const startButton = screen.getByText("Start");
      expect(startButton).not.toBeDisabled();
    });
  });

  describe("team controllers", () => {
    it("renders home team controller", () => {
      const store = mockStore(createMockState());
      const { container } = render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(
        container.querySelector(".match-controller-box-home"),
      ).toBeInTheDocument();
    });

    it("renders away team controller", () => {
      const store = mockStore(createMockState());
      const { container } = render(
        <Provider store={store}>
          <MatchController />
        </Provider>,
      );

      expect(
        container.querySelector(".match-controller-box-away"),
      ).toBeInTheDocument();
    });
  });
});
