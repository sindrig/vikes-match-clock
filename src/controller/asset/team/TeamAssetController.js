import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';

import { RingLoader } from 'react-spinners';
import { matchPropType, playerPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';
import * as assets from '../../../assets';

import Team from './Team';
import SubController from './SubController';
import assetTypes from '../AssetTypes';
import controllerActions from '../../../actions/controller';


const VIKES = 'Víkingur R';

class TeamAssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        addAssets: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        // TODO get rid of this?
        previousView: PropTypes.func.isRequired,
        selectedMatch: PropTypes.string,
        availableMatches: PropTypes.objectOf(PropTypes.shape({
            group: PropTypes.string,
            players: PropTypes.objectOf(PropTypes.arrayOf(playerPropType)),
        })),
        getAvailableMatches: PropTypes.func.isRequired,
        clearMatchPlayers: PropTypes.func.isRequired,
        selectMatch: PropTypes.func.isRequired,
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
        this.clearTeams = this.clearTeams.bind(this);
        this.addPlayersToQ = this.addPlayersToQ.bind(this);
        this.selectSubs = this.selectSubs.bind(this);
        this.addSubAsset = this.addSubAsset.bind(this);
        this.selectMatch = this.selectMatch.bind(this);
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
        const { group } = availableMatches && availableMatches[selectedMatch] ?
            availableMatches[selectedMatch] :
            { group: 'Meistaraflokkur' };
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
            match,
            addAssets,
            previousView,
        } = this.props;
        const { homeTeam, awayTeam } = this.getTeamPlayers();
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
        const { clearMatchPlayers } = this.props;
        clearMatchPlayers();
    }

    autoFill() {
        const { match: { homeTeam, awayTeam }, getAvailableMatches } = this.props;
        if (!homeTeam || !awayTeam) {
            this.setState({ error: 'Choose teams first' });
            return;
        }
        this.setState({ loading: true });
        getAvailableMatches(homeTeam, awayTeam).then(() => this.setState({ loading: false }));
    }

    selectMatch(event) {
        const { target: { value } } = event;
        const { selectMatch } = this.props;
        selectMatch(value);
    }

    renderControls() {
        const {
            availableMatches,
        } = this.props;
        const { homeTeam, awayTeam } = this.getTeamPlayers();
        return (
            <div>
                {!(homeTeam.length * awayTeam.length) ?
                    <div className="control-item">
                        <button onClick={this.autoFill}>Sækja lið</button>
                    </div> :
                    null
                }
                {((homeTeam.length * awayTeam.length) || Object.keys(availableMatches).length) ?
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
                {(availableMatches && Object.keys(availableMatches || {}).length > 1) ?
                    this.renderMatchControllers(availableMatches) :
                    null
                }
                {(homeTeam.length * awayTeam.length) ? this.renderActionControllers() : null}
            </div>
        );
    }

    renderMatchControllers(matches) {
        const { selectedMatch } = this.props;
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
    selectMatch: controllerActions.selectMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(TeamAssetController);
