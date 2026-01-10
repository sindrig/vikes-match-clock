import { handleActions, Action, ReducerMap } from "redux-actions";
import ActionTypes from "../ActionTypes";
import { FirebaseAuthState } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

export const initialState: FirebaseAuthState = {
  isLoaded: false,
  isEmpty: true,
};

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- AT is intentionally 'any' due to redux-actions limitations */
const actions = {
  [AT.setAuthState]: {
    next(_state: FirebaseAuthState, { payload }: Action<FirebaseAuthState>) {
      return payload;
    },
  },
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

export default handleActions(
  actions as unknown as ReducerMap<FirebaseAuthState, FirebaseAuthState>,
  initialState,
);
