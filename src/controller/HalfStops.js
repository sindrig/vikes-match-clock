import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import matchActions from '../actions/match';


const HalfStops = ({
    halfStops, updateHalfLength,
}) => (
    <div>
        {halfStops
            .map((s, i) => (
                <input
                    type="number"
                    value={s || ''}
                    onChange={({ target: { value } }) => updateHalfLength(s, value)}
                    key={i}  // eslint-disable-line
                />
            ))}
    </div>
);

HalfStops.propTypes = {
    updateHalfLength: PropTypes.func.isRequired,
    halfStops: PropTypes.arrayOf(PropTypes.number).isRequired,
};


const stateToProps = ({ match: { halfStops } }) => ({ halfStops });
const dispatchToProps = dispatch => bindActionCreators({
    updateHalfLength: matchActions.updateHalfLength,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(HalfStops);
