import React from 'react';
import PropTypes from 'prop-types';
import { playerPropType } from '../../../propTypes';

const SubView = ({
    subTeam, subIn, subOut,
}) => (
    <div>
        {subTeam}
        {subIn && (
            <div className="substition-player">
Út:
                {`#${subIn.number} - ${subIn.name}`}
            </div>
        )}
        {subOut && (
            <div className="substition-player">
Inn:
                {`#${subOut.number} - ${subOut.name}`}
            </div>
        )}
    </div>
);

SubView.propTypes = {
    subIn: playerPropType,
    subOut: playerPropType,
    subTeam: PropTypes.string,
};

SubView.defaultProps = {
    subIn: null,
    subOut: null,
    subTeam: null,
};

export default SubView;
