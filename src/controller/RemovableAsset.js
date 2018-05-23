import React, { Component } from 'react';
import PropTypes from 'prop-types';

import redXImage from '../images/red-x.png';
import './RemovableAsset.css';

export default class RemovableAsset extends Component {
    static propTypes = {
        children: PropTypes.oneOfType([
            PropTypes.arrayOf(PropTypes.node),
            PropTypes.node,
        ]).isRequired,
        remove: PropTypes.func.isRequired,
        assetKey: PropTypes.string.isRequired,
    };

    state = {
        hover: false,
    };

    render() {
        const { children, remove, assetKey } = this.props;
        const { hover } = this.state;
        return (
            <div className="removable-asset-container">
                <div
                    className="removable-asset"
                    onMouseEnter={() => this.setState({ hover: true })}
                    onMouseLeave={() => this.setState({ hover: false })}
                >
                    <button onClick={remove} className="removeButton"><img src={redXImage} alt="remove" /></button>
                    {children}
                </div>
                {hover ? <span>{assetKey}</span> : null}
            </div>
        );
    }
}

