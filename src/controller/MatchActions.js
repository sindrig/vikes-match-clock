import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import matchActions from '../actions/match';
import { matchPropType } from '../propTypes';
import TeamSelector from './TeamSelector';
import TimeOutManipulationBox from './TimeOutManipulationBox';
import { VIEWS } from '../reducers/controller';
import { SPORTS, DEFAULT_HALFSTOPS } from '../constants';
import HalfStops from './HalfStops';

const roundMillisToSeconds = millis => Math.floor(millis / 1000) * 1000;


const clockManipulationBox = (seconds, match, updateMatch) => {
    const unit = seconds >= 60 ? 'mín' : 'sek';
    const humanReadableSeconds = seconds >= 60 ? seconds / 60 : seconds;
    return (
        <div className="control-item">
            <button
                type="button"
                onClick={() => updateMatch({
                    timeElapsed: roundMillisToSeconds(match.timeElapsed) + (seconds * 1000),
                })}
            >
                +
                {humanReadableSeconds}
                {unit}
            </button>
            <button
                type="button"
                onClick={() => updateMatch({
                    timeElapsed: roundMillisToSeconds(match.timeElapsed) - (seconds * 1000),
                })}
            >
                -
                {humanReadableSeconds}
                {unit}
            </button>
        </div>
    );
};

const MatchActions = ({
    view, match, updateMatch, pauseMatch, matchTimeout, removeTimeout, buzz,
}) => (
    <div className="control-item">
        {view === VIEWS.match && (
            <div>
                <div className="control-item">
                    <button type="button" onClick={() => updateMatch({ homeScore: match.homeScore + 1 })}>
                        Heima +1
                    </button>
                    <button
                        type="button"
                        onClick={() => updateMatch({ homeScore: match.homeScore - 1 })}
                        disabled={match.homeScore <= 0}
                    >
                        Heima -1
                    </button>
                </div>
                <div className="control-item">
                    <button type="button" onClick={() => updateMatch({ awayScore: match.awayScore + 1 })}>
                        Úti +1
                    </button>
                    <button
                        type="button"
                        onClick={() => updateMatch({ awayScore: match.awayScore - 1 })}
                        disabled={match.awayScore <= 0}
                    >
                        Úti -1
                    </button>
                </div>
                <div className="control-item">
                    {match.started ? (
                        <button
                            type="button"
                            onClick={pauseMatch}
                        >
                            Pása
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => updateMatch({ started: Date.now() })}
                        >
                            Byrja
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => updateMatch({
                            started: 0,
                            timeElapsed: 0,
                            home2min: [],
                            away2min: [],
                            timeout: 0,
                            buzzer: false,
                            halfStops: DEFAULT_HALFSTOPS[match.matchType],
                        })}
                        disabled={
                            !match.started
                            && !match.timeElapsed
                            && DEFAULT_HALFSTOPS[match.matchType][0] === match.halfStops[0]
                            && !match.timeout
                        }
                    >
                        Núllstilla klukku
                    </button>
                </div>
                {clockManipulationBox(1, match, updateMatch)}
                {clockManipulationBox(5, match, updateMatch)}
                {clockManipulationBox(60, match, updateMatch)}
                {clockManipulationBox(60 * 5, match, updateMatch)}
                <div className="control-item">
                    {
                        match.matchType === SPORTS.football ? (
                            <div style={{ whiteSpace: 'nowrap', width: '400px' }}>
                                Uppbótartími:
                                {' '}
                                <input type="number" value={match.injuryTime || ''} onChange={({ target: { value } }) => updateMatch({ injuryTime: parseInt(value, 10) })} />
                            </div>
                        ) : null
                    }
                    <div>
                        <HalfStops />
                    </div>
                </div>
            </div>
        )}
        <div>
            <div className="control-item">
                <TeamSelector teamAttrName="homeTeam" />
                <TeamSelector teamAttrName="awayTeam" />
                <div>
                    Íþrótt:
                    <select
                        value={match.matchType}
                        onChange={({ target: { value } }) => updateMatch({ matchType: value })}
                    >
                        {Object.keys(SPORTS).map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
            </div>
            <div className="control-item">
                {
                    match.matchType === SPORTS.handball ? (
                        <div>
                            <TimeOutManipulationBox team="home" />
                            <TimeOutManipulationBox team="away" />
                        </div>
                    ) : null
                }
            </div>
            {
                match.matchType === SPORTS.handball ? (
                    <div className="control-item">
                        { match.timeout
                            ? <button type="button" onClick={removeTimeout}>Eyða Leikhlé</button>
                            : <button type="button" onClick={() => pauseMatch() && buzz(true) && matchTimeout()}>Leikhlé</button>
                        }
                    </div>
                ) : null

            }
        </div>
    </div>
);

MatchActions.propTypes = {
    updateMatch: PropTypes.func.isRequired,
    pauseMatch: PropTypes.func.isRequired,
    matchTimeout: PropTypes.func.isRequired,
    removeTimeout: PropTypes.func.isRequired,
    buzz: PropTypes.func.isRequired,
    match: matchPropType.isRequired,
    view: PropTypes.string.isRequired,
};


const stateToProps = ({ controller: { view }, match }) => ({ view, match });
const dispatchToProps = dispatch => bindActionCreators({
    updateMatch: matchActions.updateMatch,
    pauseMatch: matchActions.pauseMatch,
    matchTimeout: matchActions.matchTimeout,
    removeTimeout: matchActions.removeTimeout,
    buzz: matchActions.buzz,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(MatchActions);
