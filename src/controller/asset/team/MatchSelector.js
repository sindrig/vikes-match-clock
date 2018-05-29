import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import { availableMatchesPropType } from '../../../propTypes';

import controllerActions from '../../../actions/controller';

const MatchSelector = ({ availableMatches, selectedMatch, selectMatch }) => (
    <div className="control-item">
        <select value={selectedMatch} onChange={({ target: { value } }) => selectMatch(value)}>
            {Object.keys(availableMatches).map(matchKey => (
                <option value={matchKey} key={matchKey}>{availableMatches[matchKey].group}</option>
            ))}
        </select>
    </div>
);

MatchSelector.propTypes = {
    availableMatches: availableMatchesPropType.isRequired,
    selectedMatch: PropTypes.string,
    selectMatch: PropTypes.func.isRequired,
};

MatchSelector.defaultProps = {
    selectedMatch: null,
};

const stateToProps = ({
    match,
    controller: {
        availableMatches,
        selectedMatch,
    },
}) => ({
    match,
    availableMatches,
    selectedMatch,
});

const dispatchToProps = dispatch => bindActionCreators({
    selectMatch: controllerActions.selectMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(MatchSelector);
