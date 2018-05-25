import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { playerPropType } from '../../../propTypes';
import TeamPlayer from './TeamPlayer';

import './Team.css';

export default class Team extends Component {
    static propTypes = {
        team: PropTypes.arrayOf(playerPropType).isRequired,
        updateTeams: PropTypes.func.isRequired,
        teamName: PropTypes.oneOf(['homeTeam', 'awayTeam']).isRequired,
        selectSub: PropTypes.func,
    };

    static defaultProps = {
        selectSub: null,
    };

    updatePlayer(idx) {
        return (updatedPlayer) => {
            const { team, teamName, updateTeams } = this.props;
            team[idx] = { ...team[idx], ...updatedPlayer };
            updateTeams({ [teamName]: team });
        };
    }


    render() {
        const { team, selectSub, teamName } = this.props;
        return (
            <div className="team-asset-container">
                {team.map((p, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={`${i}`}>
                        {selectSub ?
                            <button onClick={() => selectSub(p, teamName)}>{`#${p.number} - ${p.name}`}</button> :
                            <TeamPlayer player={p} onChange={this.updatePlayer(i)} />
                        }
                    </div>
                ))}
            </div>
        );
    }
}
