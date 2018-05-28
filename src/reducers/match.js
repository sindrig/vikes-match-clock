import { handleActions } from 'redux-actions';
import ActionTypes from '../ActionTypes';

const initialState = {
    homeScore: 0,
    awayScore: 0,
    started: null,
    half: 1,
    homeTeam: 'Víkingur R',
    awayTeam: null,
};


const actions = {
    [ActionTypes.updateMatch]: {
        next(state, { payload, error }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            return { ...state, ...payload };
        },
    },
};

export default handleActions(actions, initialState);
