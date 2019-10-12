import { handleActions } from 'redux-actions';
import ActionTypes from '../ActionTypes';
import clubIds from '../club-ids';
import { SPORTS, HALFSTOPS } from '../constants';

export const initialState = {
    homeScore: 0,
    awayScore: 0,
    started: null,
    timeElapsed: 0,
    halfStops: HALFSTOPS[SPORTS.football],
    homeTeam: 'Víkingur R',
    awayTeam: null,
    homeTeamId: 103,
    awayTeamId: null,
    injuryTime: 0,
    matchType: SPORTS.football,
    home2min: [],
    away2min: [],
    timeout: null,
    buzzer: false,
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
            if (Number.isNaN(newState.injuryTime)) {
                newState.injuryTime = 0;
            }
            if (!SPORTS[newState.matchType]) {
                newState.matchType = SPORTS.football;
            }
            if (newState.matchType !== state.matchType) {
                newState.halfStops = HALFSTOPS[newState.matchType];
            }
            if (newState.started && !state.started) {
                newState.buzzer = false;
            }
            return newState;
        },
    },
    [ActionTypes.addTimeout]: {
        next(state, { payload, error }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            const { team, key, penaltyLength } = payload;
            const stateKey = `${team}2min`;
            const collection = [...state[stateKey]];
            collection.push({ atTimeElapsed: state.timeElapsed, key, penaltyLength });
            return {
                ...state,
                [stateKey]: collection,
            };
        },
    },
    [ActionTypes.removePenalty]: {
        next(state, { payload, error }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            const { key } = payload;
            return {
                ...state,
                home2min: state.home2min.filter(t => t.key !== key),
                away2min: state.away2min.filter(t => t.key !== key),
            };
        },
    },
    [ActionTypes.pauseMatch]: {
        next(state, { error, payload }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            const { isHalfEnd } = payload;
            const newState = {
                ...state,
                started: null,
                buzzer: isHalfEnd ? Date.now() : false,
            };
            if (isHalfEnd) {
                newState.timeElapsed = newState.halfStops[0] * 60 * 1000;
                if (newState.halfStops.length > 1) {
                    newState.halfStops = newState.halfStops.slice(1);
                }
            } else if (state.started) {
                newState.timeElapsed = state.timeElapsed
                    + Math.floor((Date.now() - state.started));
            }
            return newState;
        },
    },
    [ActionTypes.updateHalfLength]: {
        next(state, { error, payload }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            const { currentValue, newValue } = payload;
            const currentValueParsed = parseInt(currentValue, 10);
            const newValueParsed = newValue === '' ? 0 : parseInt(newValue, 10);
            if (Number.isNaN(newValueParsed) || newValueParsed < 0) {
                return state;
            }
            return {
                ...state,
                halfStops: state.halfStops
                    .map(v => (v === currentValueParsed ? newValueParsed : v)),
            };
        },
    },
    [ActionTypes.matchTimeout]: {
        next(state, { error }) {
            if (error) {
                return { ...state, error };
            }
            return {
                ...state,
                timeout: Date.now(),
            };
        },
    },
    [ActionTypes.removeTimeout]: {
        next(state, { payload, error }) {
            if (error) {
                return { ...state, error };
            }
            if (!payload) {
                return { ...state, pending: true };
            }
            const { buzzer } = payload;
            return {
                ...state,
                timeout: null,
                buzzer: buzzer ? Date.now() : false,
            };
        },
    },
};

export default handleActions(actions, initialState);
