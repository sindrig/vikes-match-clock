import React, { Component } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import { RingLoader } from 'react-spinners';
import { matchPropType, controllerPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';
import * as assets from '../../../assets';

import lambda from '../../../lambda';
import Team from './Team';
import SubController from './SubController';
import assetTypes from '../AssetTypes';

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

const getPlayerAsset = ({ player, teamName }) => {
    const isVikes = teamName === VIKES;
    if (isVikes) {
        const keyMatcher = new RegExp(`players/0?${player.number}`);
        const assetKey = Object.keys(assets).find(key => key.match(keyMatcher));
        if (assetKey) {
            return {
                type: assetTypes.PLAYER,
                key: assetKey,
                name: player.name,
                number: player.number,
                teamName,
            };
        }
    }
    return {
        type: assetTypes.NO_IMAGE_PLAYER,
        key: `custom-${player.number}-${player.name}`,
        name: player.name,
        number: player.number,
        teamName,
    };
};

export default class TeamAssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        addAssets: PropTypes.func.isRequired,
        updateTeams: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        controllerState: controllerPropType.isRequired,
        previousView: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            error: '',
            selectSubs: false,
            subIn: null,
            subOut: null,
        };
        this.autoFill = this.autoFill.bind(this);
        this.clearTeams = this.clearTeams.bind(this);
        this.addPlayersToQ = this.addPlayersToQ.bind(this);
        this.selectSubs = this.selectSubs.bind(this);
        this.addSubAsset = this.addSubAsset.bind(this);
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
            previousView,
        } = this.props;
        const teamAssets = [
            { team: awayTeam, teamName: match.awayTeam },
            { team: homeTeam, teamName: match.homeTeam },
        ].map(({ team, teamName }) =>
            team.filter(p => p.show)
                .map(player => getPlayerAsset({ player, teamName })));
        const flattened = [].concat(...teamAssets);
        addAssets(flattened);
        previousView();
    }

    addSubAsset() {
        const { subIn, subOut } = this.state;
        const { match, addAssets, previousView } = this.props;
        const subInObj = getPlayerAsset({
            player: subIn,
            teamName: match[subIn.teamName],
        });
        const subOutObj = getPlayerAsset({
            player: subOut,
            teamName: match[subIn.teamName],
        });
        addAssets([{
            type: assetTypes.SUB,
            subIn: subInObj,
            subOut: subOutObj,
        }]);
        previousView();
    }

    selectSubs(player, teamName) {
        const { subIn } = this.state;
        this.setState({ [subIn ? 'subOut' : 'subIn']: { teamName, ...player } });
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

    renderControls() {
        const {
            controllerState: {
                teamPlayers: {
                    homeTeam, awayTeam,
                },
            },
        } = this.props;
        const { subIn, subOut, selectSubs } = this.state;
        return (
            <div>
                <div className="control-item">
                    {!(homeTeam.length * awayTeam.length) ?
                        <button onClick={this.autoFill}>Sækja lið</button> :
                        null
                    }
                </div>
                <div className="control-item">
                    {(homeTeam.length * awayTeam.length) ?
                        <button onClick={this.clearTeams}>Hreinsa lið</button> :
                        null
                    }
                </div>
                <div className="control-item">
                    {(homeTeam.length * awayTeam.length) ?
                        <button onClick={this.addPlayersToQ}>Setja lið í biðröð</button> :
                        null
                    }
                </div>
                {selectSubs ? (
                    <button
                        onClick={() => this.setState({
                            selectSubs: false,
                            subIn: null,
                            subOut: null,
                        })}
                    >
                        Hætta við skiptingu
                    </button>
                ) : <button onClick={() => this.setState({ selectSubs: true })}>Skipting</button>
                }
                {selectSubs ? (
                    <div className="control-item">
                        <SubController
                            subIn={subIn}
                            subOut={subOut}
                            addSubAsset={this.addSubAsset}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    render() {
        const {
            loading, error, selectSubs,
        } = this.state;
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
                {!loading && this.renderControls()}
                <span className="error">{error}</span>
                <div className="team-asset-controller">
                    <Team
                        team={homeTeam}
                        teamName="homeTeam"
                        updateTeams={updateTeams}
                        selectSub={selectSubs ? this.selectSubs : null}
                    />
                    <Team
                        team={awayTeam}
                        teamName="awayTeam"
                        updateTeams={updateTeams}
                        selectSub={selectSubs ? this.selectSubs : null}
                    />
                </div>
            </div>
        );
    }
}
