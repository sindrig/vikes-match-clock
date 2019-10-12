import { handleActions } from 'redux-actions';

import ActionTypes from '../ActionTypes';


export const VPS = {
    outside: {
        style: {
            height: 176,
            width: 240,
        },
        fontSize: '100%',
    },
    insidebig: {
        style: {
            height: 288,
            width: 448,
        },
        fontSize: '180%',
    },
};

export const initialState = {
    vp: VPS.outside,
};


const actions = {
    [ActionTypes.setViewPort]: {
        next(state, { payload: { vp } }) {
            document.getElementsByTagName('html')[0].setAttribute('style', `font-size: ${vp.fontSize}`);
            return { ...state, vp };
        },
    },
};
export default handleActions(actions, initialState);
