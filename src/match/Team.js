import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import { matchPropType, twoMinPropType } from '../propTypes';
import { SPORTS } from '../constants';
import TwoMinClock from './TwoMinClock';

const imageStyle = (team) => {
    if (team.name === 'HK-Víkingur') {
        return {
            maxWidth: '100px',
        };
    }
    if (team.name === 'Grikkland') {
        return {
            top: '14px',
        };
    }
    return {};
};

const Team = ({
    score, className, team, match: { matchType }, penalties,
}) => (
    <div className={`team ${className}`}>
        {team.image && <div><img src={team.image} alt={team.name} style={imageStyle(team)} /></div>}
        <div className="team-name">{ matchType === SPORTS.handball && team.name }</div>
        <span className="score">{score}</span>
        <div className="penalties">
            {
                penalties.map(
                    ({ atTimeElapsed, key, penaltyLength }) => (
                        <TwoMinClock
                            atTimeElapsed={atTimeElapsed}
                            key={key}
                            uniqueKey={key}
                            penaltyLength={penaltyLength}
                        />
                    ),
                )
            }
        </div>
    </div>
);

Team.propTypes = {
    score: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
    team: PropTypes.shape({
        image: PropTypes.string,
        name: PropTypes.string,
    }).isRequired,
    match: matchPropType.isRequired,
    penalties: PropTypes.arrayOf(twoMinPropType),
};

Team.defaultProps = {
    penalties: [],
};


const stateToProps = ({ match }) => ({ match });

export default connect(stateToProps)(Team);
