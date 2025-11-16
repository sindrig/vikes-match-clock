import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

interface ListenersState {
  available: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase data structure, would need separate type definition
  screens: any[];
}

export const initialState: ListenersState = {
  available: [],
  screens: [],
};

const handleRemote = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase data is untyped
  next(state: ListenersState, { data, path }: { data: any; path: string }): ListenersState {
    if (path === "locations" && data) {
      return {
        ...state,
        available: Object.keys(data),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- Firebase data structure mapping
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AT is intentionally 'any' due to redux-actions limitations
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const actions: Record<string, any> = {
  [AT.receiveRemoteData]: handleRemote,
  // This can't be triggered by changing UI, so we need to listen here as well
  "@@reactReduxFirebase/SET": handleRemote,
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access */
export default handleActions(actions, initialState);
