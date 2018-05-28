import React from 'react';
import PropTypes from 'prop-types';
import { matchPropType } from '../../propTypes';
import clubLogos from '../../images/clubLogos';

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

export default TeamSelector;
