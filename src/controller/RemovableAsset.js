import React from 'react';
import PropTypes from 'prop-types';

import redXImage from '../images/red-x.png';
import './RemovableAsset.css';

const RemovableAsset = ({ children, remove }) => (
    <div className="removable-asset">
        <button onClick={remove} className="removeButton"><img src={redXImage} alt="remove" /></button>
        {children}
    </div>
);

RemovableAsset.propTypes = {
    children: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.node),
        PropTypes.node,
    ]),
    remove: PropTypes.func.isRequired,
};

export default RemovableAsset;
