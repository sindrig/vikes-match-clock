import React from 'react';
import { matchPropType } from '../../propTypes';

// TODO redux
import Team from '../../match/Team';
import Clock from '../../match/Clock';
import AdImage from '../../utils/AdImage';

import clubLogos from '../../images/clubLogos';

import './ScoreBoard.css';

const getTeam = (id, match) => {
    const name = match[`${id}Team`];
    return {
        image: clubLogos[name] || null,
        name,
        id,
    };
};

const ScoreBoard = ({ match }) => (
    <div className="scoreboard">
        <AdImage />
        <Team className="home" team={getTeam('home', match)} score={match.homeScore} />
        <Team className="away" team={getTeam('away', match)} score={match.awayScore} />
        <Clock className="clock" />
    </div>
);

ScoreBoard.propTypes = {
    match: matchPropType.isRequired,
};

export default ScoreBoard;
