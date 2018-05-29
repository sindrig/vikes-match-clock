import AWS from 'aws-sdk';
import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';
import lambda from '../lambda';
import lambdaExample from '../debug/lambda-example';
import clubIds from '../club-ids';


// DO NOT COMMIT DIS
const DEBUG = true;

const awsConf = {
    region: lambda.region,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: lambda.cognitoPoolId,
        RoleArn: lambda.cognitoRole,
        AccountId: lambda.accountId,
    }),
};
AWS.config.update(awsConf);

const ensureCredentials = () => new Promise((resolve, reject) => {
    if (!AWS.config.credentials || AWS.config.credentials.expired !== false) {
        AWS.config.credentials.get((err) => {
            if (err) {
                reject(err);
            } else {
                resolve(AWS.config.credentials);
            }
        });
    } else {
        resolve(AWS.config.credentials);
    }
});

const actions = {
    [ActionTypes.selectView]: view => ({ view }),
    [ActionTypes.selectAssetView]: assetView => ({ assetView }),
    [ActionTypes.clearMatchPlayers]: () => {},
    [ActionTypes.selectMatch]: matchId => matchId,
    [ActionTypes.editPlayer]: (teamId, idx, updatedPlayer) => ({ teamId, idx, updatedPlayer }),
    [ActionTypes.deletePlayer]: (teamId, idx) => ({ teamId, idx }),
    [ActionTypes.addPlayer]: teamId => ({ teamId }),
    [ActionTypes.getAvailableMatches]: (homeTeam, awayTeam) => new Promise((resolve, reject) => {
        if (DEBUG) {
            resolve(lambdaExample.matches);
        } else {
            ensureCredentials().then(() => {
                const fn = new AWS.Lambda({
                    region: lambda.region,
                    apiVersion: '2015-03-31',
                });
                const fnParams = {
                    FunctionName: lambda.skyrslaFunction,
                    InvocationType: 'RequestResponse',
                    Payload: JSON.stringify({
                        homeTeam: clubIds[homeTeam],
                        awayTeam: clubIds[awayTeam],
                    }),
                };
                fn.invoke(fnParams, (error, data) => {
                    if (error) {
                        reject(new Error(error));
                    } else {
                        const json = JSON.parse(data.Payload);
                        if (json.error) {
                            console.error(json.error);
                            reject(new Error(`${json.error.text || JSON.stringify(json.error)}`));
                        } else {
                            resolve(json.matches);
                        }
                    }
                });
            });
        }
    }),
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
