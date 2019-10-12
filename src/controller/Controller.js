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
import AssetController from './asset/AssetController';
import { viewPortPropType } from '../propTypes';
import './Controller.css';

// eslint-disable-next-line
const confirmRefresh = () => confirm('Are you absolutely sure?');

const Controller = ({
    selectView, renderAsset, clearState, view, vp, setViewPort,
}) => {
    const left = vp.style.width + 70;
    const currentViewPortName = Object.keys(VPS)
        .filter(key => (
            VPS[key].style.height === vp.style.height
            && VPS[key].style.width === vp.style.width
        ))[0];
    return (
        <div className="controller" style={{ left }}>
            <MatchActions />
            <AssetController
                renderAsset={renderAsset}
            />
            <div className="page-actions control-item" style={{ left: -left, top: vp.style.height }}>
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
                <button
                    type="button"
                    onClick={() => confirmRefresh() && clearState()
                        .then(() => window.location.reload())}
                >
                    Hard refresh
                </button>
                <button type="button" onClick={() => renderAsset(null)}>Hreinsa núverandi mynd</button>
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
                                {VP}
                            </option>
                        ))}
                    </select>
                </div>
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
};


const stateToProps = ({ controller: { view }, match, view: { vp } }) => ({ view, match, vp });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    clearState: globalActions.clearState,
    setViewPort: viewActions.setViewPort,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Controller);
