import React, { Component } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import { RingLoader } from 'react-spinners';
import { matchPropType, controllerPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';
import * as assets from '../../../assets';

import lambda from '../../../lambda';
import Team from './Team';

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

const VIKES = 'Víkingur R';

const getPlayerAsset = (player, isVikes) => {
    if (isVikes) {
        const keyMatcher = new RegExp(`players/0?${player.number}`);
        console.log('player.number, keyMatcher', player.number, keyMatcher);
        // const possibleKey = `players/${player.number}`;
        const asset = Object.keys(assets).find(key => key.match(keyMatcher));
        if (asset) {
            return asset;
        }
    }
    return `customPlayer/${player.number}/${player.name}`;
};

export default class TeamAssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        addAssets: PropTypes.func.isRequired,
        updateTeams: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        controllerState: controllerPropType.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            error: '',
        };
        this.autoFill = this.autoFill.bind(this);
        this.clearTeams = this.clearTeams.bind(this);
        this.addPlayersToQ = this.addPlayersToQ.bind(this);
    }

    addPlayersToQ() {
        const {
            controllerState: {
                teamPlayers: {
                    homeTeam, awayTeam,
                },
            },
            match,
            addAssets,
        } = this.props;
        const teamAssets = [
            { team: awayTeam, vikes: match.awayTeam === VIKES },
            { team: homeTeam, vikes: match.homeTeam === VIKES },
        ].map(({ team, vikes }) => team.filter(p => p.show).map(p => getPlayerAsset(p, vikes)));
        const flattened = [].concat(...teamAssets);
        addAssets(flattened);
    }

    clearTeams() {
        const { updateTeams } = this.props;
        updateTeams({
            homeTeam: [],
            awayTeam: [],
        });
    }

    handleTeams(data) {
        const { match: { homeTeam, awayTeam }, updateTeams } = this.props;
        updateTeams({
            homeTeam: data[clubIds[homeTeam]].map((p, i) => ({ ...p, show: i < 11 })),
            awayTeam: data[clubIds[awayTeam]].map((p, i) => ({ ...p, show: i < 11 })),
        });
    }

    autoFill() {
        const { match: { homeTeam, awayTeam } } = this.props;
        if (!homeTeam || !awayTeam) {
            this.setState({ error: 'Choose teams first' });
            return;
        }
        this.setState({ loading: true });

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
                    this.setState({ error });
                } else {
                    const json = JSON.parse(data.Payload);
                    if (json.error) {
                        this.setState({ error: json.error });
                    } else {
                        this.handleTeams(json);
                    }
                }
                this.setState({ loading: false });
            });
        });
    }

    render() {
        const { loading, error } = this.state;
        const {
            controllerState: {
                teamPlayers: {
                    homeTeam, awayTeam,
                },
            },
            updateTeams,
        } = this.props;
        return (
            <div className="team-asset-controller">
                <RingLoader loading={loading} />
                <div className="control-item">
                    {!loading ? <button onClick={this.autoFill}>Sækja lið</button> : null}
                </div>
                <div className="control-item">
                    {!loading ? <button onClick={this.clearTeams}>Hreinsa lið</button> : null}
                </div>
                <div className="control-item">
                    {!loading ?
                        <button onClick={this.addPlayersToQ}>Setja lið í biðröð</button> :
                        null
                    }
                </div>
                <span className="error">{error}</span>
                <div className="team-asset-controller">
                    <Team
                        team={homeTeam}
                        teamName="homeTeam"
                        updateTeams={updateTeams}
                    />
                    <Team
                        team={awayTeam}
                        teamName="awayTeam"
                        updateTeams={updateTeams}
                    />
                </div>
            </div>
        );
    }
}
