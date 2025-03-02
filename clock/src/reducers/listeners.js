import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";

export const initialState = {
  available: [],
  screens: [],
};

const handleRemote = {
  next(state, { data, path }) {
    if (path === "locations" && data) {
      return {
        ...state,
        available: Object.keys(data),
        screens: Object.entries(data)
          .map(([key, { label, screens, pitchIds }]) =>
            screens.map((screen) => ({ screen, label, key, pitchIds })),
          )
          .reduce((a, b) => a.concat(b), []),
      };
    } else if (path.startsWith("auth/")) {
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

const actions = {
  [ActionTypes.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
export default handleActions(actions, initialState);
