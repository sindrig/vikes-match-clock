import keymirror from 'keymirror';
import { handleActions } from 'redux-actions';
import { FULFILLED } from 'redux-promise-middleware';

import ActionTypes from '../ActionTypes';


export const ASSET_VIEWS = keymirror({
    assets: null,
    teams: null,
});


export const VIEWS = keymirror({
    idle: null,
    match: null,
});

const initialState = {
    assets: {
        selectedAssets: [],
        cycle: false,
        imageSeconds: 3,
        autoPlay: false,
    },
    assetView: ASSET_VIEWS.assets,
    view: VIEWS.idle,
    availableMatches: {},
    selectedMatch: null,
};

const actions = {
    [ActionTypes.selectView]: {
        next(state, { payload: { view } }) {
            return { ...state, view };
        },
    },
    [ActionTypes.selectAssetView]: {
        next(state, { payload: { assetView } }) {
            return { ...state, assetView };
        },
    },
    [ActionTypes.clearMatchPlayers]: {
        next(state) {
            return {
                ...state,
                availableMatches: {},
                selectedMatch: null,
            };
        },
    },
    [ActionTypes.selectMatch]: {
        next(state, { payload }) {
            return {
                ...state,
                selectedMatch: payload,
            };
        },
    },
    [`${ActionTypes.getAvailableMatches}_${FULFILLED}`]: {
        next(state, { payload }) {
            return {
                ...state,
                availableMatches: payload,
                selectedMatch: Object.keys(payload)[0] || null,
            };
        },
    },
    [ActionTypes.editPlayer]: {
        next(state, { payload: { teamId, idx, updatedPlayer } }) {
            const { availableMatches, selectedMatch } = state;
            // TODO why not immutable
            const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
            match.players[teamId][idx] = {
                ...match.players[teamId][idx],
                ...updatedPlayer,
            };
            return {
                ...state,
                availableMatches: {
                    ...availableMatches,
                    [selectedMatch]: match,
                },
            };
        },
    },
    [ActionTypes.deletePlayer]: {
        next(state, { payload: { teamId, idx } }) {
            const { availableMatches, selectedMatch } = state;
            // TODO why not immutable
            const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
            match.players[teamId] = match.players[teamId].filter((item, i) => i !== idx);
            return {
                ...state,
                availableMatches: {
                    ...availableMatches,
                    [selectedMatch]: match,
                },
            };
        },
    },
    [ActionTypes.addPlayer]: {
        next(state, { payload: { teamId } }) {
            const { availableMatches, selectedMatch } = state;
            // TODO why not immutable
            const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
            match.players[teamId].push({
                name: '',
                number: '',
                show: false,
                role: '',
            });
            return {
                ...state,
                availableMatches: {
                    ...availableMatches,
                    [selectedMatch]: match,
                },
            };
        },
    },
};
export default handleActions(actions, initialState);
