import { createAction, Action } from "redux-actions";
import { Dispatch } from "redux";
import { PENALTY_LENGTH } from "../constants";
import { Match } from "../types";

const uuidv4 = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; // eslint-disable-line
    const v = c === "x" ? r : (r & 0x3) | 0x8; // eslint-disable-line
    return v.toString(16);
  });

interface PauseMatchOptions {
  isHalfEnd?: boolean;
}

interface ActionCreators {
  updateMatch: (partial: Partial<Match>) => Action<Partial<Match>>;
  addPenalty: (payload: {
    team: string;
    penaltyLength?: number;
  }) => Action<{ team: string; key: string; penaltyLength: number }>;
  removePenalty: (key: string) => Action<{ key: string }>;
  addToPenalty: (
    key: string,
    toAdd?: number
  ) => Action<{ key: string; toAdd: number }>;
  pauseMatch: (options?: PauseMatchOptions) => Action<{ isHalfEnd?: boolean }>;
  startMatch: () => Action<Record<string, never>>;
  setHalfStops: (
    halfStops: number[],
    showInjuryTime: boolean
  ) => Action<{ halfStops: number[]; showInjuryTime: boolean }>;
  updateHalfLength: (
    currentValue: number,
    newValue: number
  ) => Action<{ currentValue: number; newValue: number }>;
  removeTimeout: () => Action<Record<string, never>>;
  addGoal: (payload: { team: string }) => Action<{ team: string }>;
  countdown: () => Action<Record<string, never>>;
  updateRedCards: (
    home: number,
    away: number
  ) => Action<{ home: number; away: number }>;
  buzz: () => (dispatch: Dispatch) => boolean;
  matchTimeout: (payload: { team: string }) => (dispatch: Dispatch) => void;
}

const actionPayloads: Record<string, ((...args: any[]) => any) | undefined> = {
  updateMatch: (partial: Partial<Match>) => partial,
  addPenalty: ({
    team,
    penaltyLength,
  }: {
    team: string;
    penaltyLength?: number;
  }) => ({
    team,
    key: uuidv4(),
    penaltyLength: penaltyLength || PENALTY_LENGTH,
  }),
  removePenalty: (key: string) => ({ key }),
  addToPenalty: (key: string, toAdd?: number) => ({
    key,
    toAdd: toAdd || PENALTY_LENGTH,
  }),
  pauseMatch: (options?: PauseMatchOptions) => ({
    isHalfEnd: options?.isHalfEnd,
  }),
  startMatch: () => ({}),
  setHalfStops: (halfStops: number[], showInjuryTime: boolean) => ({
    halfStops,
    showInjuryTime,
  }),
  updateHalfLength: (currentValue: number, newValue: number) => ({
    currentValue,
    newValue,
  }),
  removeTimeout: () => ({}),
  addGoal: ({ team }: { team: string }) => ({ team }),
  countdown: () => ({}),
  updateRedCards: (home: number, away: number) => ({
    home,
    away,
  }),
};

const actionCreators: Record<string, any> = {};

Object.keys(actionPayloads).forEach((key) => {
  const payloadFn = actionPayloads[key];
  actionCreators[key] = payloadFn
    ? createAction(key, payloadFn as any)
    : createAction(key);
});

const actions = actionCreators as unknown as ActionCreators;

actions.buzz = () => (dispatch: Dispatch) => {
  dispatch({ type: "buzz", payload: { on: true } } as any);
  setTimeout(() => dispatch({ type: "buzz", payload: { on: false } } as any), 3000);
  return true;
};

actions.matchTimeout =
  ({ team }: { team: string }) =>
  (dispatch: Dispatch) => {
    dispatch(actions.pauseMatch() as any);
    dispatch(actions.buzz() as any);
    dispatch({ type: "matchTimeout", payload: { team } } as any);
  };

export default actions;
