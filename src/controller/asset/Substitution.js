import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import backgroundImage from '../../images/background.png';
import { viewPortPropType } from '../../propTypes';

import './Substitution.css';

const Substitution = ({ children, thumbnail, vp }) => {
    if (children.length !== 2) {
        console.error('Children should have length 2, received ', children);
    }
    const style = {
        backgroundImage: `url(${backgroundImage})`,
        ...vp,
    };
    return (
        <div
            className={`asset-substitution${thumbnail ? ' thumbnail' : ''}`}
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
};

Substitution.defaultProps = {
    thumbnail: false,
};

const stateToProps = ({ view: { vp } }) => ({ vp });

export default connect(stateToProps)(Substitution);
