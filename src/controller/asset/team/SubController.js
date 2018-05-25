import React from 'react';
import PropTypes from 'prop-types';
import { playerPropType } from '../../../propTypes';

const SubController = ({
    subTeam, subIn, subOut, addSubAsset,
}) => (
    <div>
        {subTeam}
        {subIn && <div className="substition-player">Út: {`#${subIn.number} - ${subIn.name}`}</div>}
        {subOut && <div className="substition-player">Inn: {`#${subOut.number} - ${subOut.name}`}</div>}
        {subIn && subOut && <button onClick={addSubAsset}>Setja í röð</button>}
    </div>
);

SubController.propTypes = {
    subIn: playerPropType,
    subOut: playerPropType,
    subTeam: PropTypes.string,
    addSubAsset: PropTypes.func.isRequired,
};

SubController.defaultProps = {
    subIn: null,
    subOut: null,
    subTeam: null,
};

export default SubController;
