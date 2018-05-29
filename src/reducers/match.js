import { handleActions } from 'redux-actions';
import ActionTypes from '../ActionTypes';
import clubIds from '../club-ids';

export const initialState = {
    homeScore: 0,
    awayScore: 0,
    started: null,
    half: 1,
    homeTeam: 'Víkingur R',
    awayTeam: null,
    homeTeamId: 103,
    awayTeamId: null,
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
            const newState = { ...state, ...payload };
            newState.homeTeamId = newState.homeTeam ? clubIds[newState.homeTeam] : null;
            newState.awayTeamId = newState.awayTeam ? clubIds[newState.awayTeam] : null;
            return newState;
        },
    },
};

export default handleActions(actions, initialState);
