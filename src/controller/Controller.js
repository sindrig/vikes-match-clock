import React from 'react';
import PropTypes from 'prop-types';

import MatchActions from './MatchActions';
import AssetController from './AssetController';
import { clearState } from '../api';
import './Controller.css';

const Controller = ({
    updateMatch, state, selectView, views, renderAsset, controllerState, updateState,
}) => {
    const matchAction = (attr, fn) => event => updateMatch({
        ...state.match,
        [attr]: fn(state.match[attr], event),
    });
    return (
        <div className="controller">
            {state.view === 'MATCH' ? <MatchActions matchAction={matchAction} state={state} /> : null}
            <AssetController
                renderAsset={renderAsset}
                updateState={updateState}
                {...controllerState.assets}
            />
            <div className="page-actions">
                <div className="view-selector">
                    {views.map(view => (
                        <label htmlFor={`view-selector-${view}`} key={view}>
                            <input
                                type="radio"
                                value={view}
                                checked={view === state.view ? 'checked' : false}
                                onChange={selectView}
                                className="view-selector-input"
                                id={`view-selector-${view}`}
                                name="view-selector"
                            />
                            {view}
                        </label>
                    ))}
                </div>
                <button onClick={() => clearState().then(() => window.location.reload())}>Hard refresh</button>
            </div>
        </div>
    );
};

Controller.propTypes = {
    updateMatch: PropTypes.func.isRequired,
    selectView: PropTypes.func.isRequired,
    renderAsset: PropTypes.func.isRequired,
    views: PropTypes.arrayOf(PropTypes.string).isRequired,
    state: PropTypes.shape({
        match: PropTypes.shape({
            homeScore: PropTypes.number,
            awayScore: PropTypes.number,
            started: PropTypes.number,
            half: PropTypes.number,
        }).isRequired,
    }).isRequired,
    controllerState: PropTypes.shape({
        assets: PropTypes.any.isRequired,
    }).isRequired,
    updateState: PropTypes.func.isRequired,
};

export default Controller;
