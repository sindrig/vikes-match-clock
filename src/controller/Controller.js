import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import controllerActions from '../actions/controller';
import viewActions from '../actions/view';
import globalActions from '../actions/global';

import { VIEWS } from '../reducers/controller';
import { VPS } from '../reducers/view';
import MatchActions from './MatchActions';
import LoginPage from './LoginPage';
import AssetController from './asset/AssetController';
import { viewPortPropType } from '../propTypes';
import './Controller.css';

// eslint-disable-next-line
const confirmRefresh = () => confirm('Are you absolutely sure?');

const Controller = ({
    selectView, renderAsset, currentAsset, clearState, view, vp, setViewPort, sync, auth,
}) => {
    const left = vp.style.width + 70;
    const currentViewPortName = Object.keys(VPS)
        .filter(key => (
            VPS[key].style.height === vp.style.height
            && VPS[key].style.width === vp.style.width
        ))[0];
    const showControls = !sync || !auth.isEmpty;
    return (
        <div className="controller" style={{ left }}>
            {showControls && <MatchActions />}
            {showControls && <AssetController />}
            <div className="page-actions control-item" style={{ left: -left, top: vp.style.height, width: vp.style.width }}>
                {showControls && (
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
                )}
                {showControls && currentAsset && <button type="button" onClick={() => renderAsset(0)}>Hreinsa núverandi mynd</button>}
                <div className="viewport-select">
                    <select
                        value={currentViewPortName}
                        onChange={e => VPS[e.target.value] && setViewPort(VPS[e.target.value])}
                    >
                        {Object.keys(VPS).map(VP => (
                            <option
                                value={VP}
                                key={VP}
                            >
                                {VPS[VP].name}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => confirmRefresh() && clearState()
                        .then(() => window.location.reload())}
                >
                    Hard refresh
                </button>
                <LoginPage />
            </div>
        </div>
    );
};

Controller.propTypes = {
    clearState: PropTypes.func.isRequired,
    selectView: PropTypes.func.isRequired,
    renderAsset: PropTypes.func.isRequired,
    setViewPort: PropTypes.func.isRequired,
    view: PropTypes.string.isRequired,
    vp: viewPortPropType.isRequired,
    sync: PropTypes.bool,
    firebase: PropTypes.shape({
        auth: PropTypes.func.isRequired,
    }),
    currentAsset: PropTypes.shape({
        asset: PropTypes.shape({
            key: PropTypes.string.isRequired,
            type: PropTypes.string.isRequired,
        }).isRequired,
        time: PropTypes.number,
    }),
    auth: PropTypes.shape({
        isEmpty: PropTypes.bool,
    }).isRequired,
};

Controller.defaultProps = {
    sync: false,
    firebase: null,
    currentAsset: null,
};


const stateToProps = ({
    controller: { view, currentAsset }, view: { vp }, remote: { sync }, firebase: { auth },
}) => ({
    view, vp, sync, currentAsset: currentAsset || null, auth,
});

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    clearState: globalActions.clearState,
    renderAsset: controllerActions.renderAsset,
    setViewPort: viewActions.setViewPort,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Controller);
