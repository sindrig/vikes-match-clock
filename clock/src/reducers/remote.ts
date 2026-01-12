import { handleActions, Action, ReducerMap } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

interface RemoteState {
  email: string;
  password: string;
  sync: boolean;

  syncedData: unknown;
  listenPrefix: string;
}

export const initialState: RemoteState = {
  email: "",
  password: "",
  sync: false,
  syncedData: null,
  listenPrefix: "",
};

const handleRemote = {
  next(
    state: RemoteState,
    { data, storeAs }: { data: unknown; storeAs: string },
  ): RemoteState {
    // Handle auth data - sets the available locations/prefixes
    if (storeAs === "authData" && data && typeof data === "object") {
      const available = Object.entries(data)
        .filter((kv) => kv[1] === true)
        .map(([k]) => k);
      if (!state.listenPrefix || available.indexOf(state.listenPrefix) === -1) {
        return {
          ...state,
          listenPrefix: available[0] || "",
        };
      }
    }
    return state;
  },
};

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// TODO: Fix any usage [redux-actions handleActions requires specific ReducerMap type that conflicts with computed property names]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const actions: any = {
  [AT.setEmail]: {
    next(
      state: RemoteState,
      { payload: { email } }: Action<{ email: string }>,
    ): RemoteState {
      return { ...state, email };
    },
  },
  [AT.setPassword]: {
    next(
      state: RemoteState,
      { payload: { password } }: Action<{ password: string }>,
    ): RemoteState {
      return { ...state, password };
    },
  },
  [AT.setSync]: {
    next(
      state: RemoteState,
      { payload: { sync } }: Action<{ sync: boolean }>,
    ): RemoteState {
      return { ...state, sync };
    },
  },
  [AT.setListenPrefix]: {
    next(
      state: RemoteState,
      { payload: { listenPrefix } }: Action<{ listenPrefix: string }>,
    ): RemoteState {
      if (listenPrefix !== state.listenPrefix) {
        setTimeout(() => window.location.reload(), 2000);
      }
      return { ...state, listenPrefix };
    },
  },
  [AT.receiveRemoteData]: handleRemote,
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access */
export default handleActions<RemoteState, RemoteState>(
  actions as ReducerMap<RemoteState, RemoteState>,
  initialState,
);
