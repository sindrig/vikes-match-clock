import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import { matchPropType } from '../propTypes';
import clubLogos from '../images/clubLogos';


import matchActions from '../actions/match';

const TeamSelector = ({ teamAttrName, match, updateMatch }) => (
    <select
        value={match[teamAttrName] || ''}
        onChange={event => updateMatch({ [teamAttrName]: event.target.value })}
    >
        <option value="">Veldu lið...</option>
        {
            Object.keys(clubLogos).map(key => (
                <option value={key} key={key}>{key}</option>
            ))
        }
    </select>
);

TeamSelector.propTypes = {
    teamAttrName: PropTypes.string.isRequired,
    match: matchPropType.isRequired,
    updateMatch: PropTypes.func.isRequired,
};


const stateToProps = ({ match }, ownProps) => ({ match, ...ownProps });
const dispatchToProps = dispatch => bindActionCreators({
    updateMatch: matchActions.updateMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(TeamSelector);
