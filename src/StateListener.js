import React from 'react';
import PropTypes from 'prop-types';
import { useSelector, connect } from 'react-redux';
import { useFirebaseConnect, isLoaded } from 'react-redux-firebase';

const style = {
    textAlign: 'right',
    width: '20%',
    position: 'absolute',
    right: 0,
};

const StateListener = ({
    sync,
}) => {
    useFirebaseConnect([
        'match', 'controller',
    ]);
    const fbstate = useSelector(state => state.firebase.data);
    if (sync) {
        const txt = isLoaded(fbstate)
            ? 'Connected!'
            : 'Loading remote...';
        return <div style={style}>{txt}</div>;
    }
    return null;
};

StateListener.propTypes = {
    sync: PropTypes.bool,
};

StateListener.defaultProps = {
    sync: false,
};


const stateToProps = ({ remote: { sync } }) => ({ sync });
export default connect(stateToProps)(StateListener);
