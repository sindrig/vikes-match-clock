import React from 'react';
import PropTypes from 'prop-types';
import { matchPropType } from '../propTypes';

import clubLogos from '../images/clubLogos';

const TeamSelector = ({ teamAttrName, selected, matchAction }) => (
    <select
        value={selected || ''}
        onChange={matchAction(
            teamAttrName,
            (current, event) => event.target.value,
        )}
    >
        <option value="">Veldu lið...</option>
        {
            Object.keys(clubLogos).map(key => (
                <option value={key} key={key}>{key}</option>
            ))
        }
    </select>
);

TeamSelector.propTypes = {
    teamAttrName: PropTypes.string.isRequired,
    selected: PropTypes.string,
    matchAction: PropTypes.func.isRequired,
};

TeamSelector.defaultProps = {
    selected: '',
};

const MatchActions = ({ state, matchAction }) => (
    <div className="control-item">
        {state.view === 'MATCH' && (
            <div>
                <div className="control-item">
                    <button onClick={matchAction('homeScore', x => x + 1)}>Heima +1</button>
                    <button onClick={matchAction('homeScore', x => x - 1)}>Heima -1</button>
                </div>
                <div className="control-item">
                    <button onClick={matchAction('awayScore', x => x + 1)}>Úti +1</button>
                    <button onClick={matchAction('awayScore', x => x - 1)}>Úti -1</button>
                </div>
                <div className="control-item">
                    <button onClick={matchAction('started', () => Date.now())} disabled={!!state.match.started}>Byrja</button>
                    <button onClick={matchAction('started', () => null)} disabled={!state.match.started}>Núllstilla klukku</button>
                </div>
                <div className="control-item">
                    <button onClick={matchAction('started', x => x - (60 * 1000))} disabled={!state.match.started}>Klukka +1 mín</button>
                    <button onClick={matchAction('started', x => x + (60 * 1000))} disabled={!state.match.started}>Klukka -1 mín</button>
                </div>
                <div className="control-item">
                    <button onClick={matchAction('started', x => x - (5 * 1000))} disabled={!state.match.started}>Klukka +5 sek</button>
                    <button onClick={matchAction('started', x => x + (5 * 1000))} disabled={!state.match.started}>Klukka -5 sek</button>
                </div>
                <div className="control-item">
                    <button onClick={matchAction('half', () => 1)} disabled={state.match.half === 1}>Fyrri hálfleikur</button>
                    <button onClick={matchAction('half', () => 2)} disabled={state.match.half === 2}>Seinni hálfleikur</button>
                </div>
            </div>
        )}
        <div>
            <div className="control-item">
                <span>Heima: <TeamSelector matchAction={matchAction} teamAttrName="homeTeam" selected={state.match.homeTeam} /></span>
                <span>Úti: <TeamSelector matchAction={matchAction} teamAttrName="awayTeam" selected={state.match.awayTeam} /></span>
            </div>
        </div>
    </div>
);

MatchActions.propTypes = {
    matchAction: PropTypes.func.isRequired,
    state: PropTypes.shape({
        match: matchPropType.isRequired,
    }).isRequired,
};

export default MatchActions;
