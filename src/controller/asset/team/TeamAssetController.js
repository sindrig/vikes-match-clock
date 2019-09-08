import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';

import { RingLoader } from 'react-spinners';
import { matchPropType, availableMatchesPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';
import * as assets from '../../../assets';

import Team from './Team';
import SubView from './SubView';
import assetTypes from '../AssetTypes';
import MatchSelector from './MatchSelector';
import controllerActions from '../../../actions/controller';


const VIKES = 'Víkingur R';

class TeamAssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        addAssets: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        previousView: PropTypes.func.isRequired,
        selectedMatch: PropTypes.string,
        availableMatches: availableMatchesPropType,
        getAvailableMatches: PropTypes.func.isRequired,
        clearMatchPlayers: PropTypes.func.isRequired,
    };

    static defaultProps = {
        availableMatches: {},
        selectedMatch: null,
    }

    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            error: '',
            selectSubs: false,
            subTeam: null,
            subIn: null,
            subOut: null,
            selectPlayerAsset: false,
        };
        this.autoFill = this.autoFill.bind(this);
        this.addPlayersToQ = this.addPlayersToQ.bind(this);
        this.selectSubs = this.selectSubs.bind(this);
        this.addSubAsset = this.addSubAsset.bind(this);
        this.selectPlayerAsset = this.selectPlayerAsset.bind(this);
    }

    getTeamPlayers() {
        const {
            selectedMatch,
            availableMatches,
            match: { homeTeam, awayTeam },
        } = this.props;
        const match = availableMatches[selectedMatch];
        return {
            homeTeam: match ? match.players[clubIds[homeTeam]] || [] : [],
            awayTeam: match ? match.players[clubIds[awayTeam]] || [] : [],
        };
    }

    getPlayerAssetObject({ player, teamName }) {
        const {
            selectedMatch, availableMatches,
        } = this.props;
        const { group } = availableMatches && availableMatches[selectedMatch]
            ? availableMatches[selectedMatch]
            : { group: 'Meistaraflokkur' };
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

    clearState() {
        this.setState({
            error: '',
            selectSubs: false,
            subTeam: null,
            subIn: null,
            subOut: null,
            selectPlayerAsset: false,
        });
    }

    addPlayersToQ() {
        const {
            match,
            addAssets,
            previousView,
        } = this.props;
        const { homeTeam, awayTeam } = this.getTeamPlayers();
        const teamAssets = [
            { team: awayTeam, teamName: match.awayTeam },
            { team: homeTeam, teamName: match.homeTeam },
        ].map(({ team, teamName }) => team.filter(p => p.show)
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
        const { match, addAssets } = this.props;
        const subInObj = this.getPlayerAssetObject({
            player: subIn,
            teamName: match[subIn.teamName],
        });
        const subOutObj = this.getPlayerAssetObject({
            player: subOut,
            // NOTE: We use subIn teamName
            teamName: match[subIn.teamName],
        });
        addAssets([{
            type: assetTypes.SUB,
            subIn: subInObj,
            subOut: subOutObj,
            key: `sub-${subInObj.key}-${subOutObj.key}`,
        }], {
            showNow: true,
        });
        this.clearState();
    }

    selectSubs(player, teamName) {
        const { subIn } = this.state;
        const asset = {
            ...player,
            name: player.name.split(' ').slice(0, player.name.split(' ').length - 1).join(' '),
        };
        if (subIn) {
            this.setState({ subOut: asset }, this.addSubAsset);
        } else {
            this.setState({
                subIn: { teamName, ...asset },
                subTeam: teamName,
            });
        }
    }

    selectPlayerAsset(player, teamName) {
        const { match, addAssets } = this.props;
        addAssets([this.getPlayerAssetObject({
            player,
            teamName: match[teamName],
        })], {
            showNow: true,
        });
        this.clearState();
    }

    autoFill() {
        const { match: { homeTeam, awayTeam }, getAvailableMatches } = this.props;
        if (!homeTeam || !awayTeam) {
            this.setState({ error: 'Choose teams first' });
            return;
        }
        this.setState({ loading: true });
        getAvailableMatches(homeTeam, awayTeam)
            .then(() => this.setState({ error: '' }))
            .catch(e => this.setState({ error: e.message }))
            .then(() => this.setState({ loading: false }));
    }

    renderControls() {
        const {
            availableMatches,
            clearMatchPlayers,
        } = this.props;
        const { homeTeam, awayTeam } = this.getTeamPlayers();
        return (
            <div>
                {!(homeTeam.length || awayTeam.length)
                    ? (
                        <div className="control-item">
                            <button type="button" onClick={this.autoFill}>Sækja lið</button>
                        </div>
                    )
                    : null
                }
                {((homeTeam.length || awayTeam.length) || Object.keys(availableMatches).length)
                    ? (
                        <div className="control-item">
                            <button type="button" onClick={clearMatchPlayers}>Hreinsa lið</button>
                        </div>
                    )
                    : null
                }
                {(homeTeam.length || awayTeam.length)
                    ? (
                        <div className="control-item">
                            <button type="button" onClick={this.addPlayersToQ}>Setja lið í biðröð</button>
                        </div>
                    )
                    : null
                }
                {(availableMatches && Object.keys(availableMatches || {}).length > 1)
                    ? <MatchSelector />
                    : null
                }
                {(homeTeam.length || awayTeam.length) ? this.renderActionControllers() : null}
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
                    type="button"
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
        } if (selectPlayerAsset) {
            return (
                <button
                    type="button"
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
                    <button type="button" onClick={() => this.setState({ selectSubs: true })}>Skipting</button>
                </div>
                <div className="control-item">
                    <button type="button" onClick={() => this.setState({ selectPlayerAsset: true })}>
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
                        <SubView
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
                teamName={teamName}
                selectPlayer={selectPlayerAction}
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

const stateToProps = ({
    match,
    controller: {
        availableMatches,
        selectedMatch,
    },
}) => ({
    match,
    availableMatches,
    selectedMatch,
});

const dispatchToProps = dispatch => bindActionCreators({
    clearMatchPlayers: controllerActions.clearMatchPlayers,
    getAvailableMatches: controllerActions.getAvailableMatches,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(TeamAssetController);
