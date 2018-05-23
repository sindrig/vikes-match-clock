import React, { Component } from 'react';
import PropTypes from 'prop-types';

import backgroundImage from '../images/background.png';
import { VP, THUMB_VP } from '../constants';


const getTextWidth = (text, font) => {
    // re-use canvas object for better performance
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
};

const getMaxFontSize = (text, width, max) => {
    let regular = max;
    while (regular > 5 && getTextWidth(text.replace(' ', '_'), `${regular}px 'Anton'`) > width - 20) {
        regular -= 1;
    }
    return regular;
};

export default class PlayerAsset extends Component {
    static propTypes = {
        assetKey: PropTypes.string.isRequired,
        thumbnail: PropTypes.bool,
        asset: PropTypes.string.isRequired,
    };

    static defaultProps = {
        thumbnail: false,
    };

    state = {
        fontSizes: {
            thumbnail: 1,
            regular: 1,
        },
        playerName: '',
        playerNumber: '',
    }

    static getDerivedStateFromProps(nextProps) {
        const { assetKey } = nextProps;
        const key = assetKey.replace('players/', '').split('.')[0];
        const parts = key.split(/[ ](.+)/);
        let playerNumber = parseInt(parts[0], 10);
        if (Number.isNaN(playerNumber)) {
            [playerNumber] = parts;
        }
        const playerName = parts[1].split('_').join(' ');
        const fontSizes = {
            thumbnail: getMaxFontSize(playerName, THUMB_VP.width, 12),
            regular: getMaxFontSize(playerName, VP.width, 30),
        };

        return { fontSizes, playerName, playerNumber };
    }

    render() {
        const { assetKey, thumbnail, asset } = this.props;
        const { fontSizes, playerName, playerNumber } = this.state;
        const nameStyle = {
            fontSize: `${thumbnail ? fontSizes.thumbnail : fontSizes.regular}px`,
        };
        return (
            <div className="asset-player-icon" key={assetKey} style={{ backgroundImage: `url(${backgroundImage})` }}>
                <img src={asset} alt={assetKey} />
                <span className="asset-player-number">{playerNumber}</span>
                <span className="asset-player-name" style={nameStyle}>{playerName}</span>
            </div>
        );
    }
}