import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { playerPropType, matchPropType } from '../../../propTypes';
import TeamPlayer from './TeamPlayer';

import './Team.css';

export default class Team extends Component {
    static propTypes = {
        team: PropTypes.arrayOf(playerPropType).isRequired,
        updateTeams: PropTypes.func.isRequired,
        teamName: PropTypes.oneOf(['homeTeam', 'awayTeam']).isRequired,
        selectPlayer: PropTypes.func,
        match: matchPropType.isRequired,
    };

    static defaultProps = {
        selectPlayer: null,
    };

    constructor(props) {
        super(props);
        this.addEmptyLine = this.addEmptyLine.bind(this);
    }

    addEmptyLine() {
        const { updateTeams, teamName, team } = this.props;
        const empty = {
            name: '',
            number: null,
            role: '',
        };
        updateTeams({ [teamName]: [...team, empty] });
    }

    removePlayer(idx) {
        const { updateTeams, teamName, team } = this.props;
        return updateTeams({ [teamName]: team.filter((item, i) => i !== idx) });
    }

    updatePlayer(idx) {
        return (updatedPlayer) => {
            const { team, teamName, updateTeams } = this.props;
            team[idx] = { ...team[idx], ...updatedPlayer };
            updateTeams({ [teamName]: team });
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
