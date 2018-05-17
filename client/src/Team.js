import React from 'react';
import PropTypes from 'prop-types';


const Team = ({
    score, className, team, updateScore,
}) => (
    <div className={`team ${className}`}>
        <button
            onContextMenu={(e) => {
                e.preventDefault();
                updateScore(team.id, score - 1);
            }}
            onClick={(e) => {
                e.preventDefault();
                updateScore(team.id, score + 1);
            }}
        >
            <img
                src={team.image}
                alt={team.name}
            />
            <span>{score}</span>
        </button>
    </div>
);

Team.propTypes = {
    score: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
    team: PropTypes.shape({
        img: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
    }).isRequired,
    updateScore: PropTypes.func.isRequired,
};

export default Team;
