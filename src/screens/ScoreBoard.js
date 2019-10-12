import React from 'react';
import { connect } from 'react-redux';
import { matchPropType } from '../propTypes';

import Team from '../match/Team';
import Clock from '../match/Clock';
import TimeoutClock from '../match/TimeoutClock';
import AdImage from '../utils/AdImage';

import clubLogos from '../images/clubLogos';
import { SPORTS } from '../constants';
import buzzer from '../sounds/buzzersound.mp3';

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
    <div className={`scoreboard scoreboard-${match.matchType}`}>
        <AdImage />
        <Team className="home" team={getTeam('home', match)} score={match.homeScore} penalties={match.home2min} />
        <Team className="away" team={getTeam('away', match)} score={match.awayScore} penalties={match.away2min} />
        {match.injuryTime ? (
            <div className="injury-time">
                <span>
                    +
                    {match.injuryTime}
                </span>
            </div>
        ) : null}
        <Clock className="clock matchclock" />
        {match.timeout ? <TimeoutClock className="clock timeoutclock" /> : null}
        {match.matchType === SPORTS.handball
            && match.buzzer
            && (Date.now() - match.buzzer) < 5000
            && <audio src={buzzer} autoPlay />}
    </div>
);

ScoreBoard.propTypes = {
    match: matchPropType.isRequired,
};


const stateToProps = ({ match }) => ({ match });

export default connect(stateToProps)(ScoreBoard);
