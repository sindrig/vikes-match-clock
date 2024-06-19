import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";

export const initialState = {
  email: "",
  password: "",
  sync: false,
  syncedData: null,
  listenPrefix: "",
};

const handleRemote = {
  next(state, { data, path }) {
    if (path.startsWith("auth/") && data) {
      const available = Object.entries(data).filter((kv) => kv[1] === true)[0];
      if (!state.listenPrefix || available.indexOf(state.listenPrefix) === -1) {
        return {
          ...state,
          listenPrefix: available[0],
        };
      }
    }
    return state;
  },
};

const actions = {
  [ActionTypes.setEmail]: {
    next(state, { payload: { email } }) {
      return { ...state, email };
    },
  },
  [ActionTypes.setPassword]: {
    next(state, { payload: { password } }) {
      return { ...state, password };
    },
  },
  [ActionTypes.setSync]: {
    next(state, { payload: { sync } }) {
      return { ...state, sync };
    },
  },
  [ActionTypes.setListenPrefix]: {
    next(state, { payload: { listenPrefix } }) {
      if (listenPrefix !== state.listenPrefix) {
        setTimeout(() => window.location.reload(), 2000);
      }
      return { ...state, listenPrefix };
    },
  },
  [ActionTypes.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
export default handleActions(actions, initialState);
