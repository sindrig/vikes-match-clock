import { createAction } from 'redux-actions';
import axios from 'axios';
import apiConfig from '../apiConfig';
import ActionTypes from '../ActionTypes';
import lambdaExample from '../debug/lambda-example';
import clubIds from '../club-ids';


const DEBUG = false;


const actions = {
    [ActionTypes.selectView]: view => ({ view }),
    [ActionTypes.selectAssetView]: assetView => ({ assetView }),
    [ActionTypes.clearMatchPlayers]: () => {},
    [ActionTypes.selectMatch]: matchId => matchId,
    [ActionTypes.editPlayer]: (teamId, idx, updatedPlayer) => ({ teamId, idx, updatedPlayer }),
    [ActionTypes.deletePlayer]: (teamId, idx) => ({ teamId, idx }),
    [ActionTypes.addPlayer]: teamId => ({ teamId }),
    [ActionTypes.updateAssets]: partial => partial,
    [ActionTypes.getAvailableMatches]: (homeTeam, awayTeam) => {
        if (DEBUG) {
            return new Promise(resolve => resolve(lambdaExample));
        }
        const options = {
            params: {
                homeTeam: clubIds[homeTeam],
                awayTeam: clubIds[awayTeam],
            },
        };
        return axios.get(`${apiConfig.gateWayUrl}getPlayers`, options);
    },
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
