import { handleActions, Action } from "redux-actions";
import ActionTypes from "../ActionTypes";
import { FirebaseAuthState } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;

export const initialState: FirebaseAuthState = {
  isLoaded: false,
  isEmpty: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AT is intentionally 'any' due to redux-actions limitations
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
const actions: Record<string, any> = {
  [AT.setAuthState]: {
    next(_state: FirebaseAuthState, { payload }: Action<FirebaseAuthState>) {
      return payload;
    },
  },
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

export default handleActions(actions, initialState);
