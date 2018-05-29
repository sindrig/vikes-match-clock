import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import matchActions from '../actions/match';
import { matchPropType } from '../propTypes';
import TeamSelector from './TeamSelector';
import { VIEWS } from '../reducers/controller';


const MatchActions = ({ view, match, updateMatch }) => (
    <div className="control-item">
        {view === VIEWS.match && (
            <div>
                <div className="control-item">
                    <button onClick={() => updateMatch({ homeScore: match.homeScore + 1 })}>
                        Heima +1
                    </button>
                    <button onClick={() => updateMatch({ homeScore: match.homeScore - 1 })}>
                        Heima -1
                    </button>
                </div>
                <div className="control-item">
                    <button onClick={() => updateMatch({ awayScore: match.awayScore + 1 })}>
                        Úti +1
                    </button>
                    <button onClick={() => updateMatch({ awayScore: match.awayScore - 1 })}>
                        Úti -1
                    </button>
                </div>
                <div className="control-item">
                    <button
                        onClick={() => updateMatch({ started: Date.now() })}
                        disabled={!!match.started}
                    >
                        Byrja
                    </button>
                    <button
                        onClick={() => updateMatch({ started: null })}
                        disabled={!match.started}
                    >
                        Núllstilla klukku
                    </button>
                </div>
                <div className="control-item">
                    <button
                        onClick={() => updateMatch({ started: match.started - (60 * 1000) })}
                        disabled={!match.started}
                    >
                        Klukka +1 mín
                    </button>
                    <button
                        onClick={() => updateMatch({ started: match.started + (60 * 1000) })}
                        disabled={!match.started}
                    >
                        Klukka -1 mín
                    </button>
                </div>
                <div className="control-item">
                    <button
                        onClick={() => updateMatch({ started: match.started - (5 * 1000) })}
                        disabled={!match.started}
                    >
                        Klukka +5 sek
                    </button>
                    <button
                        onClick={() => updateMatch({ started: match.started + (5 * 1000) })}
                        disabled={!match.started}
                    >
                        Klukka -5 sek
                    </button>
                </div>
                <div className="control-item">
                    <button
                        onClick={() => updateMatch({ half: 1 })}
                        disabled={match.half === 1}
                    >
                        Fyrri hálfleikur
                    </button>
                    <button
                        onClick={() => updateMatch({ half: 2 })}
                        disabled={match.half === 2}
                    >
                        Seinni hálfleikur
                    </button>
                </div>
            </div>
        )}
        <div>
            <div className="control-item">
                <span>Heima: <TeamSelector teamAttrName="homeTeam" /></span>
                <span>Úti: <TeamSelector teamAttrName="awayTeam" /></span>
            </div>
        </div>
    </div>
);

MatchActions.propTypes = {
    updateMatch: PropTypes.func.isRequired,
    match: matchPropType.isRequired,
    view: PropTypes.string.isRequired,
};


const stateToProps = ({ controller: { view }, match }) => ({ view, match });
const dispatchToProps = dispatch => bindActionCreators({
    updateMatch: matchActions.updateMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(MatchActions);
