import moment from "moment";
import { Action, handleActions } from "redux-actions";
import ActionTypes from "../ActionTypes";
import clubIds from "../club-ids";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import { Match, TwoMinPenalty } from "../types";

export const initialState: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: DEFAULT_HALFSTOPS[Sports.Football],
  homeTeam: "Víkingur R",
  awayTeam: "",
  homeTeamId: 103,
  awayTeamId: 0,
  injuryTime: 0,
  matchType: Sports.Football,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false,
  countdown: false,
  showInjuryTime: true,
};

const actions = {
  [ActionTypes.updateMatch]: {
    next(state: Match, { payload, error }: Action<Partial<Match>>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const newState: Match = { ...state, ...payload };
      newState.homeTeamId = newState.homeTeam
        ? (clubIds as Record<string, number>)[newState.homeTeam] || 0
        : 0;
      newState.awayTeamId = newState.awayTeam
        ? (clubIds as Record<string, number>)[newState.awayTeam] || 0
        : 0;
      if (Number.isNaN(newState.injuryTime)) {
        newState.injuryTime = 0;
      }
      if (!(SPORTS as any)[newState.matchType]) {
        newState.matchType = Sports.Football;
      }
      if (newState.matchType !== state.matchType) {
        newState.halfStops = DEFAULT_HALFSTOPS[newState.matchType];
      }
      if (newState.started && !state.started) {
        newState.buzzer = false;
      }
      return newState;
    },
  },
  [ActionTypes.addPenalty]: {
    next(
      state: Match,
      {
        payload,
        error,
      }: Action<{ team: "home" | "away"; key: string; penaltyLength: number }>
    ) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { team, key, penaltyLength } = payload;
      const stateKey = `${team}2min` as "home2min" | "away2min";
      const collection = [...state[stateKey]];
      collection.push({ atTimeElapsed: state.timeElapsed, key, penaltyLength });
      return {
        ...state,
        [stateKey]: collection,
      };
    },
  },
  [ActionTypes.removePenalty]: {
    next(state: Match, { payload, error }: Action<{ key: string }>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { key } = payload;
      return {
        ...state,
        home2min: state.home2min.filter((t) => t.key !== key),
        away2min: state.away2min.filter((t) => t.key !== key),
      };
    },
  },
  [ActionTypes.addToPenalty]: {
    next(state: Match, { payload, error }: Action<{ key: string; toAdd: number }>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { key, toAdd } = payload;
      return {
        ...state,
        home2min: state.home2min.map((t) =>
          t.key === key ? { ...t, penaltyLength: t.penaltyLength + toAdd } : t
        ),
        away2min: state.away2min.map((t) =>
          t.key === key ? { ...t, penaltyLength: t.penaltyLength + toAdd } : t
        ),
      };
    },
  },
  [ActionTypes.pauseMatch]: {
    next(state: Match, { error, payload }: Action<{ isHalfEnd: boolean }>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { isHalfEnd } = payload;
      const newState: Match = {
        ...state,
        started: 0,
      };
      if (isHalfEnd) {
        newState.timeElapsed = newState.halfStops[0] * 60 * 1000;
        if (newState.halfStops.length > 1) {
          newState.halfStops = newState.halfStops.slice(1);
        }
      } else if (state.started && !state.countdown) {
        newState.timeElapsed =
          state.timeElapsed + Math.floor(Date.now() - state.started);
      }
      return newState;
    },
  },
  [ActionTypes.startMatch]: {
    next(state: Match) {
      return {
        ...state,
        started: Date.now(),
        countdown: false,
      };
    },
  },
  [ActionTypes.updateHalfLength]: {
    next(
      state: Match,
      { error, payload }: Action<{ currentValue: string; newValue: string }>
    ) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { currentValue, newValue } = payload;
      const currentValueParsed = parseInt(currentValue, 10);
      const newValueParsed = newValue === "" ? 0 : parseInt(newValue, 10);
      if (Number.isNaN(newValueParsed) || newValueParsed < 0) {
        return state;
      }
      return {
        ...state,
        halfStops: state.halfStops.map((v) =>
          v === currentValueParsed ? newValueParsed : v
        ),
      };
    },
  },
  [ActionTypes.setHalfStops]: {
    next(
      state: Match,
      { error, payload }: Action<{ halfStops: number[]; showInjuryTime: boolean }>
    ) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { halfStops, showInjuryTime } = payload;
      return {
        ...state,
        halfStops,
        showInjuryTime: showInjuryTime || false,
      };
    },
  },
  [ActionTypes.matchTimeout]: {
    next(state: Match, { error, payload }: Action<{ team: "home" | "away" }>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { team } = payload;
      const stateKey = `${team}Timeouts` as "homeTimeouts" | "awayTimeouts";
      return {
        ...state,
        timeout: Date.now(),
        [stateKey]: Math.min(state[stateKey] + 1, 4),
      };
    },
  },
  [ActionTypes.removeTimeout]: {
    next(state: Match, { error }: Action<void>) {
      if (error) {
        return { ...state, error };
      }
      return {
        ...state,
        timeout: 0,
      };
    },
  },

  [ActionTypes.buzz]: {
    next(state: Match, { payload, error }: Action<{ on: boolean }>) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { on } = payload;
      return {
        ...state,
        buzzer: on ? Date.now() : false,
      };
    },
  },

  [ActionTypes.addGoal]: {
    next(state: Match, { payload: { team } }: Action<{ team: "home" | "away" }>) {
      const key = `${team}Score` as "homeScore" | "awayScore";
      return {
        ...state,
        [key]: state[key] + 1,
      };
    },
  },
  [ActionTypes.countdown]: {
    next(state: Match, { error }: Action<void>) {
      if (error) {
        return { ...state, error };
      }
      const momentTime = moment(state.matchStartTime, "HH:mm");
      if (momentTime < moment()) {
        momentTime.add(1, "days");
      }
      const timestamp = momentTime.valueOf();
      return {
        ...state,
        started: timestamp,
        countdown: true,
      };
    },
  },
  [ActionTypes.updateRedCards]: {
    next(state: Match, { payload: { home, away } }: Action<{ home: number; away: number }>) {
      return {
        ...state,
        homeRedCards: home,
        awayRedCards: away,
      };
    },
  },
  [ActionTypes.receiveRemoteData]: {
    next(state: Match, action: any) {
      const { data, path } = action;
      if (path === "match" && data) {
        const results: Match = { ...state, ...data };
        if (results.started > 0) {
          if (!results.countdown) {
            if (state.started === 0) {
              // We just pressed start clock. Trust our own time.
              // Compensate for some small lag
              results.started = Date.now() - 150;
            } else {
              results.started = state.started;
            }
          }
        }
        if (results.timeout > 0) {
          if (state.timeout === 0) {
            // We just pressed start timeout. Trust our own time.
            // Compensate for some small lag
            results.timeout = Date.now() - 150;
          } else {
            results.timeout = state.timeout;
          }
        }
        if (results.buzzer) {
          if (!state.buzzer) {
            results.buzzer = Date.now();
          } else {
            results.buzzer = state.buzzer;
          }
        }
        if (!data.home2min) {
          results.home2min = [];
        }
        if (!data.away2min) {
          results.away2min = [];
        }
        return results;
      }
      return state;
    },
  },
};

export default handleActions(actions, initialState);
