import { handleActions } from 'redux-actions';

import ActionTypes from '../ActionTypes';

export const initialState = {
    email: '',
    password: '',
    sync: false,
    syncedData: null,
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
};
export default handleActions(actions, initialState);
