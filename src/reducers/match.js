import { handleActions } from "redux-actions";
import ActionTypes from "../ActionTypes";
import clubIds from "../club-ids";
import { SPORTS, DEFAULT_HALFSTOPS } from "../constants";

export const initialState = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: DEFAULT_HALFSTOPS[SPORTS.football],
  homeTeam: "Víkingur R",
  awayTeam: "",
  homeTeamId: 103,
  awayTeamId: 0,
  injuryTime: 0,
  matchType: SPORTS.football,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false,
};

const actions = {
  [ActionTypes.updateMatch]: {
    next(state, { payload, error }) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const newState = { ...state, ...payload };
      newState.homeTeamId = newState.homeTeam
        ? clubIds[newState.homeTeam] || 0
        : 0;
      newState.awayTeamId = newState.awayTeam
        ? clubIds[newState.awayTeam] || 0
        : 0;
      if (Number.isNaN(newState.injuryTime)) {
        newState.injuryTime = 0;
      }
      if (!SPORTS[newState.matchType]) {
        newState.matchType = SPORTS.football;
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
    next(state, { payload, error }) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { team, key, penaltyLength } = payload;
      const stateKey = `${team}2min`;
      const collection = [...state[stateKey]];
      collection.push({ atTimeElapsed: state.timeElapsed, key, penaltyLength });
      return {
        ...state,
        [stateKey]: collection,
      };
    },
  },
  [ActionTypes.removePenalty]: {
    next(state, { payload, error }) {
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
  [ActionTypes.pauseMatch]: {
    next(state, { error, payload }) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { isHalfEnd } = payload;
      const newState = {
        ...state,
        started: 0,
      };
      if (isHalfEnd) {
        newState.timeElapsed = newState.halfStops[0] * 60 * 1000;
        if (newState.halfStops.length > 1) {
          newState.halfStops = newState.halfStops.slice(1);
        }
      } else if (state.started) {
        newState.timeElapsed =
          state.timeElapsed + Math.floor(Date.now() - state.started);
      }
      return newState;
    },
  },
  [ActionTypes.startMatch]: {
    next(state) {
      return {
        ...state,
        started: Date.now(),
      };
    },
  },
  [ActionTypes.updateHalfLength]: {
    next(state, { error, payload }) {
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
    next(state, { error, payload }) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { halfStops } = payload;
      return {
        ...state,
        halfStops,
      };
    },
  },
  [ActionTypes.matchTimeout]: {
    next(state, { error, payload }) {
      if (error) {
        return { ...state, error };
      }
      if (!payload) {
        return { ...state, pending: true };
      }
      const { team } = payload;
      const stateKey = `${team}Timeouts`;
      return {
        ...state,
        timeout: Date.now(),
        [stateKey]: Math.min(state[stateKey] + 1, 4),
      };
    },
  },
  [ActionTypes.removeTimeout]: {
    next(state, { error }) {
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
    next(state, { payload, error }) {
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
    next(state, { payload: { team } }) {
      const key = `${team}Score`;
      return {
        ...state,
        [key]: state[key] + 1,
      };
    },
  },
  [ActionTypes.receiveRemoteData]: {
    next(state, { data, path }) {
      if (path === "match" && data) {
        const results = { ...state, ...data };
        if (results.started > 0) {
          if (state.started === 0) {
            // We just pressed start clock. Trust our own time.
            // Compensate for some small lag
            results.started = Date.now() - 150;
          } else {
            results.started = state.started;
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
