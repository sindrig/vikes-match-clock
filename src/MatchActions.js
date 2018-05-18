import React from 'react';
import PropTypes from 'prop-types';

const MatchActions = ({ state, matchAction }) => (
    <div>
        <div>
            <button onClick={matchAction('homeScore', x => x + 1)}>Heima +1</button>
            <button onClick={matchAction('homeScore', x => x - 1)}>Heima -1</button>
        </div>
        <div>
            <button onClick={matchAction('awayScore', x => x + 1)}>Úti +1</button>
            <button onClick={matchAction('awayScore', x => x - 1)}>Úti -1</button>
        </div>
        <div>
            <button onClick={matchAction('started', () => Date.now())} disabled={!!state.match.started}>Byrja</button>
            <button onClick={matchAction('started', () => null)} disabled={!state.match.started}>Núllstilla klukku</button>
        </div>
        <div>
            <button onClick={matchAction('started', x => x - (60 * 1000))} disabled={!state.match.started}>Klukka +1 mín</button>
            <button onClick={matchAction('started', x => x + (60 * 1000))} disabled={!state.match.started}>Klukka -1 mín</button>
        </div>
        <div>
            <button onClick={matchAction('started', x => x - (5 * 1000))} disabled={!state.match.started}>Klukka +5 sek</button>
            <button onClick={matchAction('started', x => x + (5 * 1000))} disabled={!state.match.started}>Klukka -5 sek</button>
        </div>
        <div>
            <button onClick={matchAction('half', () => 1)} disabled={state.match.half === 1}>Fyrri hálfleikur</button>
            <button onClick={matchAction('half', () => 2)} disabled={state.match.half === 2}>Seinni hálfleikur</button>
        </div>
    </div>
);

MatchActions.propTypes = {
    matchAction: PropTypes.func.isRequired,
    state: PropTypes.shape({
        match: PropTypes.shape({
            homeScore: PropTypes.number,
            awayScore: PropTypes.number,
            started: PropTypes.number,
            half: PropTypes.number,
        }).isRequired,
    }).isRequired,
};

export default MatchActions;
