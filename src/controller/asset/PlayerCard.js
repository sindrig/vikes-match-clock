import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { assetPropType, viewPortPropType } from "../../propTypes";
import { THUMB_VP } from "../../constants";
import { getBackground } from "../../reducers/view";

const getTextWidth = (text, font) => {
  // re-use canvas object for better performance
  const canvas =
    getTextWidth.canvas ||
    (getTextWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  const metrics = context.measureText(text);
  return metrics.width;
};

const getMaxFontSize = (text, width, max) => {
  let regular = max;
  while (
    regular > 5 &&
    getTextWidth(text.replace(" ", "_"), `${regular}px 'Anton'`) > width - 20
  ) {
    regular -= 1;
  }
  return regular;
};

class PlayerCard extends Component {
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
    overlay: PropTypes.shape({
      text: PropTypes.string.isRequired,
      blink: PropTypes.bool,
      effect: PropTypes.string,
    }),
    // eslint-disable-next-line
    vp: viewPortPropType.isRequired,
    background: PropTypes.string.isRequired,
  };

  static defaultProps = {
    thumbnail: false,
    children: [],
    className: "",
    widthMultiplier: 1,
    overlay: {
      text: "",
      blink: false,
    },
  };

  state = {
    fontSizes: {
      thumbnail: 1,
      regular: 1,
    },
  };

  static getDerivedStateFromProps(nextProps) {
    const {
      asset: { name },
      widthMultiplier,
      vp: {
        style: { width },
      },
    } = nextProps;
    const fontSizes = {
      thumbnail: getMaxFontSize(
        name,
        THUMB_VP.width * widthMultiplier,
        Math.floor(width / 14)
      ),
      regular: getMaxFontSize(
        name,
        width * widthMultiplier,
        Math.floor(width / 5)
      ),
    };
    return { fontSizes };
  }

  render() {
    const { thumbnail, asset, children, className, overlay, background } =
      this.props;
    const { fontSizes } = this.state;
    const nameStyle = {
      fontSize: `${thumbnail ? fontSizes.thumbnail : fontSizes.regular}px`,
    };
    return (
      <div
        className={`asset-player-icon ${className}`}
        key={asset.key}
        style={getBackground(background)}
      >
        {children}
        <span
          className={`player-card-overlay ${
            overlay.blink ? overlay.effect : ""
          }`}
        >
          {overlay.text}
        </span>
        <span className="asset-player-number">{asset.number}</span>
        <span className="asset-player-name" style={nameStyle}>
          {asset.name}
        </span>
      </div>
    );
  }
}

const stateToProps = ({ view: { vp, background } }) => ({ vp, background });

export default connect(stateToProps)(PlayerCard);
