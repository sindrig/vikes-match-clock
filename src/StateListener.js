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
    sync, listenPrefix,
}) => {
    const listens = ['listeners'];
    if (listenPrefix) {
        listens.push(
            {
                path: `${listenPrefix}/match`,
                storeAs: 'match',
            },
        );
        listens.push(
            {
                path: `${listenPrefix}/controller`,
                storeAs: 'controller',
            },
        );
    }
    useFirebaseConnect(listens);
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
    listenPrefix: PropTypes.string.isRequired,
};

StateListener.defaultProps = {
    sync: false,
};


const stateToProps = ({ remote: { sync, listenPrefix } }) => ({ sync, listenPrefix });
export default connect(stateToProps)(StateListener);
