import moment from "moment";
import { Action, handleActions, ReducerMap } from "redux-actions";
import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;
import clubIds from "../club-ids";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import { Match } from "../types";

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

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- AT is intentionally 'any' due to redux-actions limitations */
const actions = {
  [AT.updateMatch]: {
    next(state: Match, { payload, error }: Action<Partial<Match>>) {
      if (error || !payload) {
        return state;
      }
      const newState: Match = { ...state, ...payload };
      const clubIdsMap = clubIds as Record<string, string>;
      newState.homeTeamId = newState.homeTeam
        ? parseInt(clubIdsMap[newState.homeTeam] || "0", 10)
        : 0;
      newState.awayTeamId = newState.awayTeam
        ? parseInt(clubIdsMap[newState.awayTeam] || "0", 10)
        : 0;
      if (Number.isNaN(newState.injuryTime)) {
        newState.injuryTime = 0;
      }
      if (!Object.values(Sports).includes(newState.matchType)) {
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
  [AT.addPenalty]: {
    next(
      state: Match,
      {
        payload,
        error,
      }: Action<{ team: "home" | "away"; key: string; penaltyLength: number }>,
    ) {
      if (error || !payload) {
        return state;
      }
      const { team, key, penaltyLength } = payload;
      const stateKey = `${String(team)}2min` as "home2min" | "away2min";
      const collection = [...state[stateKey]];
      collection.push({ atTimeElapsed: state.timeElapsed, key, penaltyLength });
      return {
        ...state,
        [stateKey]: collection,
      };
    },
  },
  [AT.removePenalty]: {
    next(state: Match, { payload, error }: Action<{ key: string }>) {
      if (error || !payload) {
        return state;
      }
      const { key } = payload;
      return {
        ...state,
        home2min: state.home2min.filter((t) => t.key !== key),
        away2min: state.away2min.filter((t) => t.key !== key),
      };
    },
  },
  [AT.addToPenalty]: {
    next(
      state: Match,
      { payload, error }: Action<{ key: string; toAdd: number }>,
    ) {
      if (error || !payload) {
        return state;
      }
      const { key, toAdd } = payload;
      return {
        ...state,
        home2min: state.home2min.map((t) =>
          t.key === key
            ? { ...t, penaltyLength: Number(t.penaltyLength) + Number(toAdd) }
            : t,
        ),
        away2min: state.away2min.map((t) =>
          t.key === key
            ? { ...t, penaltyLength: Number(t.penaltyLength) + Number(toAdd) }
            : t,
        ),
      };
    },
  },
  [AT.pauseMatch]: {
    next(state: Match, { error, payload }: Action<{ isHalfEnd: boolean }>) {
      if (error || !payload) {
        return state;
      }
      const { isHalfEnd } = payload;
      const newState: Match = {
        ...state,
        started: 0,
      };
      if (isHalfEnd) {
        newState.timeElapsed = (newState.halfStops[0] ?? 0) * 60 * 1000;
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
  [AT.startMatch]: {
    next(state: Match) {
      return {
        ...state,
        started: Date.now(),
        countdown: false,
      };
    },
  },
  [AT.updateHalfLength]: {
    next(
      state: Match,
      { error, payload }: Action<{ currentValue: string; newValue: string }>,
    ) {
      if (error || !payload) {
        return state;
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
          v === currentValueParsed ? newValueParsed : v,
        ),
      };
    },
  },
  [AT.setHalfStops]: {
    next(
      state: Match,
      {
        error,
        payload,
      }: Action<{ halfStops: number[]; showInjuryTime: boolean }>,
    ) {
      if (error || !payload) {
        return state;
      }
      const { halfStops, showInjuryTime } = payload;
      return {
        ...state,
        halfStops,
        showInjuryTime: showInjuryTime || false,
      };
    },
  },
  [AT.matchTimeout]: {
    next(state: Match, { error, payload }: Action<{ team: "home" | "away" }>) {
      if (error || !payload) {
        return state;
      }
      const { team } = payload;
      const stateKey = `${String(team)}Timeouts` as
        | "homeTimeouts"
        | "awayTimeouts";
      return {
        ...state,
        timeout: Date.now(),
        [stateKey]: Math.min(state[stateKey] + 1, 4),
      };
    },
  },
  [AT.removeTimeout]: {
    next(state: Match, { error }: Action<void>) {
      if (error) {
        return state;
      }
      return {
        ...state,
        timeout: 0,
      };
    },
  },

  [AT.buzz]: {
    next(state: Match, { payload, error }: Action<{ on: boolean }>) {
      if (error || !payload) {
        return state;
      }
      const { on } = payload;
      return {
        ...state,
        buzzer: on ? Date.now() : false,
      };
    },
  },

  [AT.addGoal]: {
    next(
      state: Match,
      { payload: { team } }: Action<{ team: "home" | "away" }>,
    ) {
      const key = `${String(team)}Score` as "homeScore" | "awayScore";
      return {
        ...state,
        [key]: state[key] + 1,
      };
    },
  },
  [AT.countdown]: {
    next(state: Match, { error }: Action<void>) {
      if (error) {
        return state;
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
  [AT.updateRedCards]: {
    next(
      state: Match,
      { payload: { home, away } }: Action<{ home: number; away: number }>,
    ) {
      return {
        ...state,
        homeRedCards: home,
        awayRedCards: away,
      };
    },
  },
  [AT.receiveRemoteData]: {
    next(state: Match, action: { data: unknown; storeAs: string }) {
      const { data, storeAs } = action;
      if (storeAs === "match" && data && typeof data === "object") {
        const results: Match = { ...state, ...(data as Partial<Match>) };
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
        const dataObj = data as Partial<Match>;
        if (!dataObj.home2min) {
          results.home2min = [];
        }
        if (!dataObj.away2min) {
          results.away2min = [];
        }
        return results;
      }
      return state;
    },
  },
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

export default handleActions(
  actions as unknown as ReducerMap<Match, Match>,
  initialState,
);
