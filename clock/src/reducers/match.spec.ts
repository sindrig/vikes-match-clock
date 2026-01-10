import { describe, it, expect, vi } from "vitest";
import matchReducer, { initialState } from "./match";
import ActionTypes from "../ActionTypes";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import type { Match } from "../types";

const createAction = (type: string, payload?: unknown) => ({
  type,
  payload,
});

describe("match reducer", () => {
  describe("initial state", () => {
    it("returns the initial state", () => {
      const state = matchReducer(undefined, { type: "@@INIT" });
      expect(state).toEqual(initialState);
    });

    it("has correct default values", () => {
      expect(initialState.homeScore).toBe(0);
      expect(initialState.awayScore).toBe(0);
      expect(initialState.started).toBe(0);
      expect(initialState.timeElapsed).toBe(0);
      expect(initialState.injuryTime).toBe(0);
      expect(initialState.matchType).toBe(Sports.Football);
      expect(initialState.home2min).toEqual([]);
      expect(initialState.away2min).toEqual([]);
      expect(initialState.timeout).toBe(0);
      expect(initialState.buzzer).toBe(false);
      expect(initialState.countdown).toBe(false);
      expect(initialState.showInjuryTime).toBe(true);
    });
  });

  describe("clock state transitions", () => {
    describe("startMatch", () => {
      it("sets started to current timestamp", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const state = matchReducer(
          initialState,
          createAction(ActionTypes.startMatch),
        );

        expect(state.started).toBe(now);
        expect(state.countdown).toBe(false);

        vi.useRealTimers();
      });

      it("preserves other state when starting", () => {
        const stateWithScore: Match = { ...initialState, homeScore: 2 };
        const state = matchReducer(
          stateWithScore,
          createAction(ActionTypes.startMatch),
        );

        expect(state.homeScore).toBe(2);
        expect(state.started).toBeGreaterThan(0);
      });
    });

    describe("pauseMatch", () => {
      it("sets started to 0 when pausing", () => {
        const runningState: Match = {
          ...initialState,
          started: Date.now() - 60000,
          timeElapsed: 0,
        };

        const state = matchReducer(
          runningState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: false }),
        );

        expect(state.started).toBe(0);
      });

      it("accumulates elapsed time when pausing", () => {
        const startTime = Date.now() - 60000;
        const runningState: Match = {
          ...initialState,
          started: startTime,
          timeElapsed: 30000,
        };

        const state = matchReducer(
          runningState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: false }),
        );

        expect(state.timeElapsed).toBeGreaterThanOrEqual(90000);
      });

      it("does not accumulate time if not started", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: false }),
        );

        expect(state.timeElapsed).toBe(0);
      });

      it("does not accumulate time in countdown mode", () => {
        const countdownState: Match = {
          ...initialState,
          started: Date.now() + 60000,
          countdown: true,
          timeElapsed: 0,
        };

        const state = matchReducer(
          countdownState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: false }),
        );

        expect(state.timeElapsed).toBe(0);
      });
    });

    describe("pauseMatch with isHalfEnd", () => {
      it("sets timeElapsed to first halfStop when isHalfEnd is true", () => {
        const runningState: Match = {
          ...initialState,
          started: Date.now() - 60000,
          halfStops: [45, 90, 105, 120],
        };

        const state = matchReducer(
          runningState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: true }),
        );

        expect(state.timeElapsed).toBe(45 * 60 * 1000);
      });

      it("removes the first halfStop when isHalfEnd is true", () => {
        const runningState: Match = {
          ...initialState,
          started: Date.now() - 60000,
          halfStops: [45, 90, 105, 120],
        };

        const state = matchReducer(
          runningState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: true }),
        );

        expect(state.halfStops).toEqual([90, 105, 120]);
      });

      it("keeps last halfStop if only one remains", () => {
        const runningState: Match = {
          ...initialState,
          started: Date.now() - 60000,
          halfStops: [90],
        };

        const state = matchReducer(
          runningState,
          createAction(ActionTypes.pauseMatch, { isHalfEnd: true }),
        );

        expect(state.halfStops).toEqual([90]);
      });
    });
  });

  describe("period management", () => {
    describe("updateHalfLength", () => {
      it("updates a specific half length value", () => {
        const state = matchReducer(
          { ...initialState, halfStops: [45, 90, 105, 120] },
          createAction(ActionTypes.updateHalfLength, {
            currentValue: "45",
            newValue: "40",
          }),
        );

        expect(state.halfStops).toEqual([40, 90, 105, 120]);
      });

      it("handles empty string as 0", () => {
        const state = matchReducer(
          { ...initialState, halfStops: [45, 90] },
          createAction(ActionTypes.updateHalfLength, {
            currentValue: "45",
            newValue: "",
          }),
        );

        expect(state.halfStops).toEqual([0, 90]);
      });

      it("ignores negative values", () => {
        const originalHalfStops = [45, 90];
        const state = matchReducer(
          { ...initialState, halfStops: originalHalfStops },
          createAction(ActionTypes.updateHalfLength, {
            currentValue: "45",
            newValue: "-10",
          }),
        );

        expect(state.halfStops).toEqual([45, 90]);
      });

      it("ignores NaN values", () => {
        const state = matchReducer(
          { ...initialState, halfStops: [45, 90] },
          createAction(ActionTypes.updateHalfLength, {
            currentValue: "45",
            newValue: "abc",
          }),
        );

        expect(state.halfStops).toEqual([45, 90]);
      });
    });

    describe("setHalfStops", () => {
      it("sets half stops and showInjuryTime", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.setHalfStops, {
            halfStops: [30, 60],
            showInjuryTime: false,
          }),
        );

        expect(state.halfStops).toEqual([30, 60]);
        expect(state.showInjuryTime).toBe(false);
      });

      it("defaults showInjuryTime to false if not provided", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.setHalfStops, {
            halfStops: [30, 60],
          }),
        );

        expect(state.showInjuryTime).toBe(false);
      });
    });
  });

  describe("scoring", () => {
    describe("addGoal", () => {
      it("increments home score", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.addGoal, { team: "home" }),
        );

        expect(state.homeScore).toBe(1);
        expect(state.awayScore).toBe(0);
      });

      it("increments away score", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.addGoal, { team: "away" }),
        );

        expect(state.homeScore).toBe(0);
        expect(state.awayScore).toBe(1);
      });

      it("accumulates multiple goals", () => {
        let state = matchReducer(
          initialState,
          createAction(ActionTypes.addGoal, { team: "home" }),
        );
        state = matchReducer(
          state,
          createAction(ActionTypes.addGoal, { team: "home" }),
        );
        state = matchReducer(
          state,
          createAction(ActionTypes.addGoal, { team: "away" }),
        );

        expect(state.homeScore).toBe(2);
        expect(state.awayScore).toBe(1);
      });
    });

    describe("updateMatch for score changes", () => {
      it("can set scores directly via updateMatch", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.updateMatch, {
            homeScore: 3,
            awayScore: 2,
          }),
        );

        expect(state.homeScore).toBe(3);
        expect(state.awayScore).toBe(2);
      });
    });
  });

  describe("injury time", () => {
    it("sets injury time via updateMatch", () => {
      const state = matchReducer(
        initialState,
        createAction(ActionTypes.updateMatch, { injuryTime: 5 }),
      );

      expect(state.injuryTime).toBe(5);
    });

    it("resets NaN injury time to 0", () => {
      const state = matchReducer(
        initialState,
        createAction(ActionTypes.updateMatch, { injuryTime: NaN }),
      );

      expect(state.injuryTime).toBe(0);
    });
  });

  describe("penalties (2-minute suspensions)", () => {
    describe("addPenalty", () => {
      it("adds a penalty to home team", () => {
        const state = matchReducer(
          { ...initialState, timeElapsed: 120000 },
          createAction(ActionTypes.addPenalty, {
            team: "home",
            key: "pen-1",
            penaltyLength: 120000,
          }),
        );

        expect(state.home2min).toHaveLength(1);
        expect(state.home2min[0]).toEqual({
          atTimeElapsed: 120000,
          key: "pen-1",
          penaltyLength: 120000,
        });
      });

      it("adds a penalty to away team", () => {
        const state = matchReducer(
          { ...initialState, timeElapsed: 60000 },
          createAction(ActionTypes.addPenalty, {
            team: "away",
            key: "pen-2",
            penaltyLength: 120000,
          }),
        );

        expect(state.away2min).toHaveLength(1);
        expect(state.away2min[0].team).toBeUndefined();
        expect(state.away2min[0].key).toBe("pen-2");
      });

      it("allows multiple concurrent penalties", () => {
        let state = matchReducer(
          { ...initialState, timeElapsed: 60000 },
          createAction(ActionTypes.addPenalty, {
            team: "home",
            key: "pen-1",
            penaltyLength: 120000,
          }),
        );
        state = matchReducer(
          { ...state, timeElapsed: 90000 },
          createAction(ActionTypes.addPenalty, {
            team: "home",
            key: "pen-2",
            penaltyLength: 120000,
          }),
        );

        expect(state.home2min).toHaveLength(2);
      });
    });

    describe("removePenalty", () => {
      it("removes a penalty by key from home team", () => {
        const stateWithPenalty: Match = {
          ...initialState,
          home2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
          ],
        };

        const state = matchReducer(
          stateWithPenalty,
          createAction(ActionTypes.removePenalty, { key: "pen-1" }),
        );

        expect(state.home2min).toHaveLength(0);
      });

      it("removes a penalty by key from away team", () => {
        const stateWithPenalty: Match = {
          ...initialState,
          away2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
          ],
        };

        const state = matchReducer(
          stateWithPenalty,
          createAction(ActionTypes.removePenalty, { key: "pen-1" }),
        );

        expect(state.away2min).toHaveLength(0);
      });

      it("only removes the matching penalty", () => {
        const stateWithPenalties: Match = {
          ...initialState,
          home2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
            { atTimeElapsed: 90000, key: "pen-2", penaltyLength: 120000 },
          ],
        };

        const state = matchReducer(
          stateWithPenalties,
          createAction(ActionTypes.removePenalty, { key: "pen-1" }),
        );

        expect(state.home2min).toHaveLength(1);
        expect(state.home2min[0].key).toBe("pen-2");
      });
    });

    describe("addToPenalty", () => {
      it("adds time to an existing penalty", () => {
        const stateWithPenalty: Match = {
          ...initialState,
          home2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
          ],
        };

        const state = matchReducer(
          stateWithPenalty,
          createAction(ActionTypes.addToPenalty, {
            key: "pen-1",
            toAdd: 60000,
          }),
        );

        expect(state.home2min[0].penaltyLength).toBe(180000);
      });

      it("works for away team penalties", () => {
        const stateWithPenalty: Match = {
          ...initialState,
          away2min: [
            { atTimeElapsed: 60000, key: "pen-1", penaltyLength: 120000 },
          ],
        };

        const state = matchReducer(
          stateWithPenalty,
          createAction(ActionTypes.addToPenalty, {
            key: "pen-1",
            toAdd: 60000,
          }),
        );

        expect(state.away2min[0].penaltyLength).toBe(180000);
      });
    });
  });

  describe("timeouts", () => {
    describe("matchTimeout", () => {
      it("sets timeout timestamp and increments home timeouts", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const state = matchReducer(
          initialState,
          createAction(ActionTypes.matchTimeout, { team: "home" }),
        );

        expect(state.timeout).toBe(now);
        expect(state.homeTimeouts).toBe(1);

        vi.useRealTimers();
      });

      it("increments away timeouts", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.matchTimeout, { team: "away" }),
        );

        expect(state.awayTimeouts).toBe(1);
      });

      it("caps timeouts at 4", () => {
        const stateWith4Timeouts: Match = { ...initialState, homeTimeouts: 4 };

        const state = matchReducer(
          stateWith4Timeouts,
          createAction(ActionTypes.matchTimeout, { team: "home" }),
        );

        expect(state.homeTimeouts).toBe(4);
      });
    });

    describe("removeTimeout", () => {
      it("clears the timeout", () => {
        const stateWithTimeout: Match = {
          ...initialState,
          timeout: Date.now(),
        };

        const state = matchReducer(
          stateWithTimeout,
          createAction(ActionTypes.removeTimeout),
        );

        expect(state.timeout).toBe(0);
      });
    });
  });

  describe("red cards", () => {
    describe("updateRedCards", () => {
      it("sets red card counts for both teams", () => {
        const state = matchReducer(
          initialState,
          createAction(ActionTypes.updateRedCards, { home: 1, away: 2 }),
        );

        expect(state.homeRedCards).toBe(1);
        expect(state.awayRedCards).toBe(2);
      });

      it("can set red cards to 0", () => {
        const stateWithRedCards: Match = {
          ...initialState,
          homeRedCards: 2,
          awayRedCards: 1,
        };

        const state = matchReducer(
          stateWithRedCards,
          createAction(ActionTypes.updateRedCards, { home: 0, away: 0 }),
        );

        expect(state.homeRedCards).toBe(0);
        expect(state.awayRedCards).toBe(0);
      });
    });
  });

  describe("buzzer", () => {
    describe("buzz", () => {
      it("sets buzzer to timestamp when on is true", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const state = matchReducer(
          initialState,
          createAction(ActionTypes.buzz, { on: true }),
        );

        expect(state.buzzer).toBe(now);

        vi.useRealTimers();
      });

      it("sets buzzer to false when on is false", () => {
        const stateWithBuzzer: Match = { ...initialState, buzzer: Date.now() };

        const state = matchReducer(
          stateWithBuzzer,
          createAction(ActionTypes.buzz, { on: false }),
        );

        expect(state.buzzer).toBe(false);
      });
    });
  });

  describe("updateMatch", () => {
    it("updates multiple fields at once", () => {
      const state = matchReducer(
        initialState,
        createAction(ActionTypes.updateMatch, {
          homeTeam: "Breiðablik",
          awayTeam: "FH",
          homeScore: 1,
          awayScore: 0,
        }),
      );

      expect(state.homeTeam).toBe("Breiðablik");
      expect(state.awayTeam).toBe("FH");
      expect(state.homeScore).toBe(1);
      expect(state.awayScore).toBe(0);
    });

    it("clears buzzer when match starts", () => {
      const stateWithBuzzer: Match = { ...initialState, buzzer: Date.now() };

      const state = matchReducer(
        stateWithBuzzer,
        createAction(ActionTypes.updateMatch, { started: Date.now() }),
      );

      expect(state.buzzer).toBe(false);
    });

    it("updates halfStops when matchType changes", () => {
      const state = matchReducer(
        initialState,
        createAction(ActionTypes.updateMatch, { matchType: Sports.Handball }),
      );

      expect(state.matchType).toBe(Sports.Handball);
      expect(state.halfStops).toEqual(DEFAULT_HALFSTOPS[Sports.Handball]);
    });

    it("validates matchType and defaults to Football if invalid", () => {
      const state = matchReducer(
        initialState,
        createAction(ActionTypes.updateMatch, { matchType: "invalid" }),
      );

      expect(state.matchType).toBe(Sports.Football);
    });

    it("handles error actions gracefully", () => {
      const state = matchReducer(initialState, {
        type: ActionTypes.updateMatch,
        payload: { homeScore: 5 },
        error: true,
      });

      expect(state).toEqual(initialState);
    });
  });

  describe("countdown", () => {
    it("sets countdown mode with future timestamp", () => {
      const state = matchReducer(
        { ...initialState, matchStartTime: "20:00" },
        createAction(ActionTypes.countdown),
      );

      expect(state.countdown).toBe(true);
      expect(state.started).toBeGreaterThan(0);
    });
  });

  describe("receiveRemoteData", () => {
    it("merges remote match data", () => {
      const remoteData = {
        homeScore: 2,
        awayScore: 1,
        homeTeam: "KR",
      };

      const state = matchReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: remoteData,
        storeAs: "match",
      });

      expect(state.homeScore).toBe(2);
      expect(state.awayScore).toBe(1);
      expect(state.homeTeam).toBe("KR");
    });

    it("ignores remote data for other store keys", () => {
      const state = matchReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: { homeScore: 5 },
        storeAs: "controller",
      });

      expect(state.homeScore).toBe(0);
    });

    it("initializes empty penalty arrays from remote data", () => {
      const remoteData = {
        homeScore: 1,
      };

      const state = matchReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: remoteData,
        storeAs: "match",
      });

      expect(state.home2min).toEqual([]);
      expect(state.away2min).toEqual([]);
    });
  });
});
