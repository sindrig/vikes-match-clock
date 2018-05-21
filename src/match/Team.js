import React from 'react';
import PropTypes from 'prop-types';


const Team = ({
    score, className, team,
}) => (
    <div className={`team ${className}`}>
        <img
            src={team.image}
            alt={team.name}
        />
        <span>{score}</span>
    </div>
);

Team.propTypes = {
    score: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
    team: PropTypes.shape({
        image: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
    }).isRequired,
};

export default Team;
