import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";

export const initialState = {
  available: [],
};

const handleRemote = {
  next(state, { data, path }) {
    if (path === "listeners" && data) {
      return {
        ...state,
        available: data.available.split(","),
      };
    }
    return state;
  },
};

const actions = {
  [ActionTypes.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
export default handleActions(actions, initialState);
