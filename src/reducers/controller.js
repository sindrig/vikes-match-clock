import keymirror from 'keymirror';
import { handleActions } from 'redux-actions';
import ActionTypes from '../ActionTypes';

export const ASSET_VIEWS = keymirror({
    assets: null,
    team: null,
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
    teamPlayers: {
        homeTeam: [],
        awayTeam: [],
    },
    assetView: ASSET_VIEWS.assets,
    view: VIEWS.idle,
};

const actions = {
    [ActionTypes.selectView]: {
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
