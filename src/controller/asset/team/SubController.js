import React from 'react';
import PropTypes from 'prop-types';
import { playerPropType } from '../../../propTypes';

const SubController = ({ subIn, subOut, addSubAsset }) => (
    <div>
        {subIn && <div className="substition-player">Út: {`#${subIn.number} - ${subIn.name}`}</div>}
        {subOut && <div className="substition-player">Inn: {`#${subOut.number} - ${subOut.name}`}</div>}
        {subIn && subOut && <button onClick={addSubAsset}>Setja í röð</button>}
    </div>
);

SubController.propTypes = {
    subIn: playerPropType,
    subOut: playerPropType,
    addSubAsset: PropTypes.func.isRequired,
};

SubController.defaultProps = {
    subIn: null,
    subOut: null,
};

export default SubController;
