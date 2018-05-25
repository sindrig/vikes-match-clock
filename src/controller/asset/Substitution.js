import React from 'react';
import PropTypes from 'prop-types';

import backgroundImage from '../../images/background.png';

import './Substitution.css';

const Substitution = ({ children, thumbnail }) => {
    console.log('thumbnail', thumbnail);
    if (children.length !== 2) {
        console.error('Children should have length 2, received ', children);
    }
    console.log('children', children);
    return (
        <div
            className={`asset-substitution${thumbnail ? ' thumbnail' : ''}`}
            style={{ backgroundImage: `url(${backgroundImage})` }}
        >
            {children}
        </div>
    );
};

Substitution.propTypes = {
    children: PropTypes.arrayOf(PropTypes.node).isRequired,
    thumbnail: PropTypes.bool,
};

Substitution.defaultProps = {
    thumbnail: false,
};

export default Substitution;
