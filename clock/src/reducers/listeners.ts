import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";
const AT: any = ActionTypes;

interface ListenersState {
  available: string[];
  screens: any[];
}

export const initialState: ListenersState = {
  available: [],
  screens: [],
};

const handleRemote = {
  next(state: ListenersState, { data, path }: { data: any; path: string }): ListenersState {
    if (path === "locations" && data) {
      return {
        ...state,
        available: Object.keys(data),
        screens: Object.entries(data)
          .map(([key, value]: [string, any]) => {
            const { label, screens, pitchIds } = value;
            return screens.map((screen: any) => ({ screen, label, key, pitchIds }));
          })
          .reduce((a: any[], b: any[]) => a.concat(b), []),
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

const actions: Record<string, any> = {
  [AT.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
export default handleActions(actions, initialState);
