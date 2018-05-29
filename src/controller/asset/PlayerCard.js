import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { assetPropType } from '../../propTypes';
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
        thumbnail: PropTypes.bool,
        asset: assetPropType.isRequired,
        children: PropTypes.oneOfType([
            PropTypes.arrayOf(PropTypes.node),
            PropTypes.node,
        ]),
        className: PropTypes.string,
        // eslint-disable-next-line
        widthMultiplier: PropTypes.number,
    };

    static defaultProps = {
        thumbnail: false,
        children: [],
        className: '',
        widthMultiplier: 1,
    };

    state = {
        fontSizes: {
            thumbnail: 1,
            regular: 1,
        },
    };

    static getDerivedStateFromProps(nextProps) {
        const { asset: { name }, widthMultiplier } = nextProps;
        const fontSizes = {
            thumbnail: getMaxFontSize(name, THUMB_VP.width * widthMultiplier, 12),
            regular: getMaxFontSize(name, VP.width * widthMultiplier, 30),
        };
        return { fontSizes };
    }

    render() {
        const {
            thumbnail, asset, children, className,
        } = this.props;
        const { fontSizes } = this.state;
        const nameStyle = {
            fontSize: `${thumbnail ? fontSizes.thumbnail : fontSizes.regular}px`,
        };
        return (
            <div className={`asset-player-icon ${className}`} key={asset.key} style={{ backgroundImage: `url(${backgroundImage})` }}>
                {children}
                <span className="asset-player-number">{asset.number}</span>
                <span className="asset-player-name" style={nameStyle}>{asset.name}</span>
            </div>
        );
    }
}
