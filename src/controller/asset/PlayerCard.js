import React, { Component } from 'react';
import PropTypes from 'prop-types';

import backgroundImage from '../../images/background.png';
import { VP, THUMB_VP } from '../../constants';


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

export default class PlayerCard extends Component {
    static propTypes = {
        playerName: PropTypes.string.isRequired,
        playerNumber: PropTypes.string.isRequired,
        thumbnail: PropTypes.bool,
        assetKey: PropTypes.string.isRequired,
        children: PropTypes.oneOfType([
            PropTypes.arrayOf(PropTypes.node),
            PropTypes.node,
        ]),
    };

    static defaultProps = {
        thumbnail: false,
        children: [],
    };

    state = {
        fontSizes: {
            thumbnail: 1,
            regular: 1,
        },
    };

    static getDerivedStateFromProps(nextProps) {
        const { playerName } = nextProps;
        const fontSizes = {
            thumbnail: getMaxFontSize(playerName, THUMB_VP.width, 12),
            regular: getMaxFontSize(playerName, VP.width, 30),
        };
        return { fontSizes };
    }

    render() {
        const { playerNumber, playerName, thumbnail, assetKey, children } = this.props;
        const { fontSizes } = this.state;
        const nameStyle = {
            fontSize: `${thumbnail ? fontSizes.thumbnail : fontSizes.regular}px`,
        };
        return (
            <div className="asset-player-icon" key={assetKey} style={{ backgroundImage: `url(${backgroundImage})` }}>
                {children}
                <span className="asset-player-number">{playerNumber}</span>
                <span className="asset-player-name" style={nameStyle}>{playerName}</span>
            </div>
        );
    }
}
