import React, { Component } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import { RingLoader } from 'react-spinners';
import { matchPropType, controllerPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';
import * as assets from '../../../assets';
import { getKey, setKey } from '../../../api';

import lambda from '../../../lambda';
import Team from './Team';
import SubController from './SubController';
import assetTypes from '../AssetTypes';
import lambdaExample from '../../../debug/lambda-example';

const DEBUG = false;
const AVAILABLE_MATCHES = 'AVAILABLE_MATCHES';

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
            subTeam: null,
            subIn: null,
            subOut: null,
            availableMatches: null,
            selectedMatch: null,
            selectPlayerAsset: false,
        };
        this.autoFill = this.autoFill.bind(this);
        this.clearTeams = this.clearTeams.bind(this);
        this.addPlayersToQ = this.addPlayersToQ.bind(this);
        this.selectSubs = this.selectSubs.bind(this);
        this.addSubAsset = this.addSubAsset.bind(this);
        this.selectMatch = this.selectMatch.bind(this);
        this.selectPlayerAsset = this.selectPlayerAsset.bind(this);
    }

    componentDidMount() {
        getKey(AVAILABLE_MATCHES).then(availableMatches => this.setState({
            availableMatches,
            selectedMatch: (
                availableMatches && availableMatches.matches ?
                    Object.keys(availableMatches.matches)[0] : null
            ),
        }));
    }

    getPlayerAssetObject({ player, teamName }) {
        const {
            selectedMatch, availableMatches: { matches },
        } = this.state;
        const { group } = matches[selectedMatch];
        if (!player.name || !player.number) {
            return null;
        }
        if (group.match(/meistara/i)) {
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
        }
        return {
            type: assetTypes.NO_IMAGE_PLAYER,
            key: `custom-${player.number}-${player.name}`,
            name: player.name,
            number: player.number,
            teamName,
        };
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
                .map(player => this.getPlayerAssetObject({ player, teamName })));
        const flattened = [].concat(...teamAssets);
        if (!flattened.every(i => i)) {
            this.setState({ error: 'Missing name/number for some players to show' });
        } else {
            addAssets(flattened);
            previousView();
        }
    }

    addSubAsset() {
        const { subIn, subOut } = this.state;
        const { match, addAssets, previousView } = this.props;
        const subInObj = this.getPlayerAssetObject({
            player: subIn,
            teamName: match[subIn.teamName],
        });
        const subOutObj = this.getPlayerAssetObject({
            player: subOut,
            teamName: match[subIn.teamName],
        });
        addAssets([{
            type: assetTypes.SUB,
            subIn: subInObj,
            subOut: subOutObj,
            key: `sub-${subInObj.key}-${subOutObj.key}`,
        }]);
        previousView();
    }

    selectSubs(player, teamName) {
        const { subIn } = this.state;
        this.setState({
            [subIn ? 'subOut' : 'subIn']: { teamName, ...player },
            subTeam: teamName,
        });
    }

    selectPlayerAsset(player, teamName) {
        const { match, addAssets, previousView } = this.props;
        addAssets([this.getPlayerAssetObject({
            player,
            teamName: match[teamName],
        })]);
        previousView();
    }

    clearTeams() {
        const { updateTeams } = this.props;
        updateTeams({
            homeTeam: [],
            awayTeam: [],
        });
        setKey(AVAILABLE_MATCHES, null);
        this.setState({
            availableMatches: null,
            selectedMatch: null,
        });
    }

    handleTeams(data) {
        setKey(AVAILABLE_MATCHES, data);
        const firstKey = Object.keys(data.matches)[0];
        this.setState({
            availableMatches: data,
            selectedMatch: firstKey,
        });
        this.handleMatch(data.matches[firstKey]);
    }

    handleMatch(match) {
        const { match: { homeTeam, awayTeam }, updateTeams } = this.props;
        const mapper = (p, i) => ({ ...p, show: i < 11 });
        updateTeams({
            homeTeam: match.players[clubIds[homeTeam]].map(mapper),
            awayTeam: match.players[clubIds[awayTeam]].map(mapper),
        });
    }

    autoFill() {
        const { match: { homeTeam, awayTeam } } = this.props;
        if (!homeTeam || !awayTeam) {
            this.setState({ error: 'Choose teams first' });
            return;
        }
        this.setState({ loading: true });

        if (DEBUG) {
            this.handleTeams(lambdaExample);
            this.setState({ loading: false });
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
                        this.setState({ error });
                    } else {
                        const json = JSON.parse(data.Payload);
                        if (json.error) {
                            console.error(json.error);
                            this.setState({ error: `${json.error.text || JSON.stringify(json.error)}` });
                        } else {
                            this.handleTeams(json);
                        }
                    }
                    this.setState({ loading: false });
                });
            });
        }
    }

    selectMatch(event) {
        const { target: { value } } = event;
        const { availableMatches } = this.state;
        this.setState({ selectedMatch: value });
        this.handleMatch(availableMatches.matches[value]);
    }

    renderControls() {
        const {
            controllerState: {
                teamPlayers: {
                    homeTeam, awayTeam,
                },
            },
        } = this.props;
        const {
            availableMatches,
        } = this.state;
        return (
            <div>
                {!(homeTeam.length * awayTeam.length) ?
                    <div className="control-item">
                        <button onClick={this.autoFill}>Sækja lið</button>
                    </div> :
                    null
                }
                {(homeTeam.length * awayTeam.length) ?
                    <div className="control-item">
                        <button onClick={this.clearTeams}>Hreinsa lið</button>
                    </div> :
                    null
                }
                {(homeTeam.length * awayTeam.length) ?
                    <div className="control-item">
                        <button onClick={this.addPlayersToQ}>Setja lið í biðröð</button>
                    </div> :
                    null
                }
                {(availableMatches && Object.keys(availableMatches.matches || {}).length > 1) ?
                    this.renderMatchControllers(availableMatches.matches) :
                    null
                }
                {(homeTeam.length * awayTeam.length) ? this.renderActionControllers() : null}
            </div>
        );
    }

    renderMatchControllers(matches) {
        const { selectedMatch } = this.state;
        return (
            <div className="control-item">
                <select value={selectedMatch} onChange={this.selectMatch}>
                    {Object.keys(matches).map(matchKey => (
                        <option value={matchKey} key={matchKey}>{matches[matchKey].group}</option>
                    ))}
                </select>
            </div>
        );
    }

    renderActionButtons() {
        const {
            selectSubs, selectPlayerAsset,
        } = this.state;
        if (selectSubs) {
            return (
                <button
                    onClick={() => this.setState({
                        selectSubs: false,
                        subIn: null,
                        subOut: null,
                        subTeam: null,
                    })}
                >
                    Hætta við skiptingu
                </button>
            );
        } else if (selectPlayerAsset) {
            return (
                <button
                    onClick={() => this.setState({
                        selectPlayerAsset: false,
                    })}
                >
                    Hætta við birtingu
                </button>
            );
        }
        return (
            <div>
                <div className="control-item">
                    <button onClick={() => this.setState({ selectSubs: true })}>Skipting</button>
                </div>
                <div className="control-item">
                    <button onClick={() => this.setState({ selectPlayerAsset: true })}>
                        Birta leikmann
                    </button>
                </div>
            </div>
        );
    }

    renderActionControllers() {
        const {
            subIn, subOut, selectSubs, subTeam,
        } = this.state;
        const { match } = this.props;
        return (
            <div className="sub-controller control-item">
                {this.renderActionButtons()}
                {selectSubs ? (
                    <div className="control-item">
                        <SubController
                            subIn={subIn}
                            subOut={subOut}
                            addSubAsset={this.addSubAsset}
                            subTeam={subTeam ? match[subTeam] : null}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    renderTeam(teamName) {
        const {
            selectSubs, subTeam, selectPlayerAsset,
        } = this.state;
        const {
            controllerState: { teamPlayers },
            updateTeams,
            match,
        } = this.props;
        let selectPlayerAction = null;
        if (selectSubs) {
            if (!subTeam || subTeam === teamName) {
                selectPlayerAction = this.selectSubs;
            }
        } else if (selectPlayerAsset) {
            selectPlayerAction = this.selectPlayerAsset;
        }
        return (
            <Team
                team={teamPlayers[teamName]}
                teamName={teamName}
                updateTeams={updateTeams}
                selectPlayer={selectPlayerAction}
                subTeam={subTeam}
                match={match}
            />
        );
    }

    render() {
        const { loading, error } = this.state;
        const { match } = this.props;
        if (!match.homeTeam || !match.awayTeam) {
            return <div>Veldu lið fyrst</div>;
        }
        return (
            <div className="team-asset-controller">
                <RingLoader loading={loading} />
                {!loading && this.renderControls()}
                <span className="error">{error}</span>
                <div className="team-asset-controller">
                    {this.renderTeam('homeTeam')}
                    {this.renderTeam('awayTeam')}
                </div>
            </div>
        );
    }
}
