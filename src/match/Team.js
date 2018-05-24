import React from 'react';
import PropTypes from 'prop-types';


const Team = ({
    score, className, team,
}) => (
    <div className={`team ${className}`}>
        {team.image && <img src={team.image} alt={team.name} />}
        <span>{score}</span>
    </div>
);

Team.propTypes = {
    score: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
    team: PropTypes.shape({
        image: PropTypes.string,
        name: PropTypes.string,
    }).isRequired,
};

export default Team;
