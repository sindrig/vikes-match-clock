import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import { playerPropType, matchPropType } from '../../../propTypes';
import controllerActions from '../../../actions/controller';
import TeamPlayer from './TeamPlayer';

import './Team.css';

class Team extends Component {
    static propTypes = {
        team: PropTypes.arrayOf(playerPropType).isRequired,
        editPlayer: PropTypes.func.isRequired,
        addPlayer: PropTypes.func.isRequired,
        deletePlayer: PropTypes.func.isRequired,
        teamName: PropTypes.oneOf(['homeTeam', 'awayTeam']).isRequired,
        selectPlayer: PropTypes.func,
        match: matchPropType.isRequired,
        teamId: PropTypes.string,
    };

    static defaultProps = {
        selectPlayer: null,
        teamId: null,
    };

    constructor(props) {
        super(props);
        this.addEmptyLine = this.addEmptyLine.bind(this);
    }

    addEmptyLine() {
        const { addPlayer, teamId } = this.props;
        addPlayer(teamId);
    }

    removePlayer(idx) {
        const { deletePlayer, teamId } = this.props;
        deletePlayer(teamId, idx);
    }

    updatePlayer(idx) {
        return (updatedPlayer) => {
            const { editPlayer, teamId } = this.props;
            editPlayer(teamId, idx, updatedPlayer);
        };
    }


    render() {
        const {
            team, selectPlayer, teamName, match,
        } = this.props;
        return (
            <div className="team-asset-container">
                <div className="team-name">{match[teamName]}</div>
                {match[teamName] ? team.map((p, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={`${i}`}>
                        {selectPlayer && p.number && p.name ?
                            <button onClick={() => selectPlayer(p, teamName)}>{`#${p.number} - ${p.name}`}</button> :
                            <TeamPlayer player={p} onChange={this.updatePlayer(i)} />
                        }
                        <button onClick={() => this.removePlayer(i)}>Eyða línu</button>
                    </div>
                )) : null}
                {match[teamName] ?
                    <div><button onClick={this.addEmptyLine}>Ný lína...</button></div> :
                    null
                }
            </div>
        );
    }
}

const stateToProps = (
    {
        controller: { availableMatches, selectedMatch },
        match,
    },
    ownProps,
) => {
    const selectedMatchObj = availableMatches[selectedMatch];
    const teamId = match[`${ownProps.teamName}Id`];
    return {
        team: selectedMatchObj ?
            selectedMatchObj.players[teamId] || [] :
            [],
        match,
        teamId,
    };
};

const dispatchToProps = dispatch => bindActionCreators({
    editPlayer: controllerActions.editPlayer,
    deletePlayer: controllerActions.deletePlayer,
    addPlayer: controllerActions.addPlayer,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Team);
