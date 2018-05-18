import React from 'react';
import PropTypes from 'prop-types';

import MatchActions from './MatchActions';

const Controller = ({
    updateMatch, state, selectView, views,
}) => {
    const matchAction = (attr, fn) => () => updateMatch({
        ...state.match,
        [attr]: fn(state.match[attr]),
    });
    return (
        <div className="controller">
            {state.view === 'MATCH' ? <MatchActions matchAction={matchAction} state={state} /> : null}
            <div>
                <select onChange={selectView}>
                    {views.map(view => (
                        <option
                            value={view}
                            key={view}
                            selected={view === state.view}
                        >
                            {view}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <button onClick={() => window.location.reload()}>Refresh!</button>
            </div>
        </div>
    );
};

Controller.propTypes = {
    updateMatch: PropTypes.func.isRequired,
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
