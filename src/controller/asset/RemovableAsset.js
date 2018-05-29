import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { assetPropType } from '../../propTypes';

import redXImage from '../../images/red-x.png';
import './RemovableAsset.css';

export default class RemovableAsset extends Component {
    static propTypes = {
        children: PropTypes.oneOfType([
            PropTypes.arrayOf(PropTypes.node),
            PropTypes.node,
        ]).isRequired,
        remove: PropTypes.func.isRequired,
        asset: assetPropType.isRequired,
    };

    state = {
        hover: false,
    };

    render() {
        const { children, remove, asset } = this.props;
        const { hover } = this.state;
        return (
            <div className="removable-asset-container">
                <div
                    className="removable-asset"
                    onMouseEnter={() => this.setState({ hover: true })}
                    onMouseLeave={() => this.setState({ hover: false })}
                >
                    <button onClick={() => remove(asset)} className="removeButton"><img src={redXImage} alt="remove" /></button>
                    {children}
                </div>
                {hover ? <div className="removable-asset-key-name">{asset.key}</div> : null}
            </div>
        );
    }
}

