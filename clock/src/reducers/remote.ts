import { handleActions, Action } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

interface RemoteState {
  email: string;
  password: string;
  sync: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Synced Firebase data can be any shape
  syncedData: any;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase data is untyped
  next(state: RemoteState, { data, path }: { data: any; path: string }): RemoteState {
    if (path.startsWith("auth/") && data) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Firebase data is untyped
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AT is intentionally 'any' due to redux-actions limitations
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
const actions: Record<string, any> = {
  [AT.setEmail]: {
    next(state: RemoteState, { payload: { email } }: Action<{ email: string }>): RemoteState {
      return { ...state, email };
    },
  },
  [AT.setPassword]: {
    next(state: RemoteState, { payload: { password } }: Action<{ password: string }>): RemoteState {
      return { ...state, password };
    },
  },
  [AT.setSync]: {
    next(state: RemoteState, { payload: { sync } }: Action<{ sync: boolean }>): RemoteState {
      return { ...state, sync };
    },
  },
  [AT.setListenPrefix]: {
    next(state: RemoteState, { payload: { listenPrefix } }: Action<{ listenPrefix: string }>): RemoteState {
      if (listenPrefix !== state.listenPrefix) {
        setTimeout(() => window.location.reload(), 2000);
      }
      return { ...state, listenPrefix };
    },
  },
  [AT.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
export default handleActions(actions, initialState);
