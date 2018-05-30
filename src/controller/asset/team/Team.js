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
        this.submitForm = this.submitForm.bind(this);
    }

    state = {
        inputValue: '',
        error: '',
    };

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

    submitForm(event) {
        const { team, selectPlayer, teamName } = this.props;
        event.preventDefault();
        const { inputValue } = this.state;
        const requestedNumber = parseInt(inputValue, 10);
        let found = false;
        team.forEach((player) => {
            if (requestedNumber === parseInt(player.number, 10)) {
                selectPlayer(player, teamName);
                found = true;
            }
        });
        this.setState({
            error: found ? '' : `No player #${inputValue} found`,
            inputValue: '',
        });
    }

    renderForm() {
        const { inputValue } = this.state;
        return (
            <form onSubmit={this.submitForm}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={({ target: { value } }) => this.setState({ inputValue: value })}
                    placeholder="# leikmanns og ENTER"
                    className="player-input"
                />
            </form>
        );
    }

    render() {
        const {
            team, selectPlayer, teamName, match,
        } = this.props;
        const {
            error,
        } = this.state;
        return (
            <div className="team-asset-container">
                <span>{error}</span>
                {selectPlayer ? this.renderForm() : null}
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
