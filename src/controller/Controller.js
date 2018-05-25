import React from 'react';
import PropTypes from 'prop-types';

import MatchActions from './MatchActions';
import AssetController from './asset/AssetController';
import { matchPropType, controllerPropType } from '../propTypes';
import './Controller.css';

const Controller = ({
    updateMatch, state, selectView, views, renderAsset, controllerState, updateState, clearState,
}) => {
    const matchAction = (attr, fn) => event => updateMatch({
        ...state.match,
        [attr]: fn(state.match[attr], event),
    });
    return (
        <div className="controller">
            <MatchActions matchAction={matchAction} state={state} />
            <AssetController
                renderAsset={renderAsset}
                updateState={updateState}
                match={state.match}
                state={controllerState}
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
                <button onClick={() => clearState().then(() => window.location.reload())}>
                    Hard refresh
                </button>
                <button onClick={() => renderAsset(null)}>Hreinsa núverandi mynd</button>
            </div>
        </div>
    );
};

Controller.propTypes = {
    updateMatch: PropTypes.func.isRequired,
    clearState: PropTypes.func.isRequired,
    selectView: PropTypes.func.isRequired,
    renderAsset: PropTypes.func.isRequired,
    views: PropTypes.arrayOf(PropTypes.string).isRequired,
    state: PropTypes.shape({
        match: matchPropType.isRequired,
        controller: controllerPropType.isRequired,
    }).isRequired,
    controllerState: PropTypes.shape({
        assets: PropTypes.any.isRequired,
    }).isRequired,
    updateState: PropTypes.func.isRequired,
};

export default Controller;
