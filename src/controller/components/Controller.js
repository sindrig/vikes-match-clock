import React from 'react';
import PropTypes from 'prop-types';

import { VIEWS } from '../../reducers/controller';
import MatchActions from '../MatchActions';
import AssetController from '../asset/AssetController';
import { matchPropType, controllerPropType } from '../../propTypes';
import './Controller.css';

const Controller = ({
    state, selectView, renderAsset, controllerState, updateState, clearState, view,
}) => (
    <div className="controller">
        <MatchActions />
        <AssetController
            renderAsset={renderAsset}
            updateState={updateState}
            match={state.match}
            state={controllerState}
        />
        <div className="page-actions control-item">
            <div className="view-selector">
                {Object.keys(VIEWS).map(VIEW => (
                    <label htmlFor={`view-selector-${VIEW}`} key={VIEW}>
                        <input
                            type="radio"
                            value={VIEW}
                            checked={VIEW === view ? 'checked' : false}
                            onChange={e => selectView(e.target.value)}
                            className="view-selector-input"
                            id={`view-selector-${VIEW}`}
                            name="view-selector"
                        />
                        {VIEW}
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

Controller.propTypes = {
    clearState: PropTypes.func.isRequired,
    selectView: PropTypes.func.isRequired,
    renderAsset: PropTypes.func.isRequired,
    state: PropTypes.shape({
        match: matchPropType.isRequired,
        controller: controllerPropType.isRequired,
    }).isRequired,
    controllerState: PropTypes.shape({
        assets: PropTypes.any.isRequired,
    }).isRequired,
    updateState: PropTypes.func.isRequired,
    view: PropTypes.string.isRequired,
};

export default Controller;
