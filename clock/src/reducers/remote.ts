import { handleActions, Action } from "redux-actions";

import ActionTypes from "../ActionTypes";
const AT: any = ActionTypes;

interface RemoteState {
  email: string;
  password: string;
  sync: boolean;
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
  next(state: RemoteState, { data, path }: { data: any; path: string }): RemoteState {
    if (path.startsWith("auth/") && data) {
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
export default handleActions(actions, initialState);
