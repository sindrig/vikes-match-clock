import React from 'react';
import PropTypes from 'prop-types';

import './MatchController.css';

const ControlButton = ({
    children, className, onClick, big, disabled,
}) => (
    <div className={`match-controller-button-wrapper ${big ? 'big' : ''}`}>
        <button type="button" className={className} onClick={onClick} disabled={disabled}>{children}</button>
    </div>
);

ControlButton.propTypes = {
    children: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.node),
        PropTypes.node,
    ]).isRequired,
    className: PropTypes.string,
    onClick: PropTypes.func.isRequired,
    big: PropTypes.bool,
    disabled: PropTypes.bool,
};

ControlButton.defaultProps = {
    className: '',
    big: false,
    disabled: false,
};


export default ControlButton;
