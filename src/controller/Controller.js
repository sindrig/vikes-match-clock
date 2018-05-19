import React from 'react';
import PropTypes from 'prop-types';

import MatchActions from './MatchActions';
import './Controller.css';

const Controller = ({
    updateMatch, state, selectView, views, onFileUpload,
}) => {
    const matchAction = (attr, fn) => () => updateMatch({
        ...state.match,
        [attr]: fn(state.match[attr]),
    });
    return (
        <div className="controller">
            {state.view === 'MATCH' ? <MatchActions matchAction={matchAction} state={state} /> : null}
            <div className="page-actions">
                <div className="view-selector">
                    {views.map(view => (
                        <label htmlFor={`view-selector-${view}`}>
                            <input
                                type="radio"
                                value={view}
                                key={view}
                                checked={view === state.view ? 'checked' : null}
                                onChange={selectView}
                                className="view-selector-input"
                                id={`view-selector-${view}`}
                                name="view-selector"
                            />
                            {view}
                        </label>
                    ))}
                </div>
                <input type="file" onChange={onFileUpload} />
                <button onClick={() => window.location.reload()}>Refresh!</button>
            </div>
        </div>
    );
};

Controller.propTypes = {
    updateMatch: PropTypes.func.isRequired,
    onFileUpload: PropTypes.func.isRequired,
    selectView: PropTypes.func.isRequired,
    views: PropTypes.arrayOf(PropTypes.string).isRequired,
    state: PropTypes.shape({
        match: PropTypes.shape({
            homeScore: PropTypes.number,
            awayScore: PropTypes.number,
            started: PropTypes.number,
            half: PropTypes.number,
        }).isRequired,
    }).isRequired,
};

export default Controller;
