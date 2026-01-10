import { handleActions, ReducerMap } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

interface ScreenData {
  screen: unknown;
  label: string;
  key: string;
  pitchIds: unknown;
}

interface LocationValue {
  label: string;
  screens: unknown[];
  pitchIds: unknown;
}

interface ListenersState {
  available: string[];
  screens: ScreenData[];
}

export const initialState: ListenersState = {
  available: [],
  screens: [],
};

const handleRemote = {
  next(
    state: ListenersState,
    { data, storeAs }: { data: unknown; storeAs: string },
  ): ListenersState {
    if (storeAs === "locations" && data !== null && typeof data === "object") {
      return {
        ...state,
        available: Object.keys(data),
        screens: Object.entries(data)
          .map(([key, value]: [string, unknown]) => {
            const locationValue = value as LocationValue;
            const { label, screens, pitchIds } = locationValue;
            return screens.map((screen: unknown) => ({
              screen,
              label,
              key,
              pitchIds,
            }));
          })
          .reduce((a: ScreenData[], b: ScreenData[]) => a.concat(b), []),
      };
    } else if (
      storeAs === "authData" &&
      data !== null &&
      typeof data === "object"
    ) {
      return {
        ...state,
        available: Object.entries(data)
          .filter((kv) => kv[1] === true)
          .map(([k]) => k),
      };
    }
    return state;
  },
};

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// TODO: Fix any usage [redux-actions handleActions requires specific ReducerMap type that conflicts with computed property names]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const actions: any = {
  [AT.receiveRemoteData]: handleRemote,
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access */
export default handleActions<ListenersState, ListenersState>(
  actions as ReducerMap<ListenersState, ListenersState>,
  initialState,
);
