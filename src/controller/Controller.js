import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import controllerActions from '../actions/controller';
import globalActions from '../actions/global';

import { VIEWS } from '../reducers/controller';
import MatchActions from './MatchActions';
import AssetController from './asset/AssetController';
import './Controller.css';

// eslint-disable-next-line
const confirmRefresh = () => confirm('Are you absolutely sure?');

const Controller = ({
    selectView, renderAsset, clearState, view,
}) => (
    <div className="controller">
        <MatchActions />
        <AssetController
            renderAsset={renderAsset}
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
            <button onClick={() => confirmRefresh() && clearState()
                .then(() => window.location.reload())}
            >
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
    view: PropTypes.string.isRequired,
};


const stateToProps = ({ controller: { view }, match }) => ({ view, match });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    clearState: globalActions.clearState,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Controller);
