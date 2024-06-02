import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getBackground } from "../../reducers/view";

import { viewPortPropType } from "../../propTypes";

import "./Substitution.css";

const Substitution = ({ children, thumbnail, vp, background }) => {
  if (children.length !== 2) {
    console.error("Children should have length 2, received ", children);
  }
  const style = { ...vp, ...getBackground(background) };
  return (
    <div
      className={`asset-substitution${thumbnail ? " thumbnail" : ""}`}
      style={style}
    >
      {children}
    </div>
  );
};

Substitution.propTypes = {
  children: PropTypes.arrayOf(PropTypes.node).isRequired,
  thumbnail: PropTypes.bool,
  vp: viewPortPropType.isRequired,
  background: PropTypes.string.isRequired,
};

Substitution.defaultProps = {
  thumbnail: false,
};

const stateToProps = ({ view: { vp, background } }) => ({ vp, background });

export default connect(stateToProps)(Substitution);
