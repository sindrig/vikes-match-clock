import React from 'react';
import PropTypes from 'prop-types';
import { useSelector, connect } from 'react-redux';
import { useFirebaseConnect, isLoaded } from 'react-redux-firebase';

import './StateListener.css';

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
        if (isLoaded(fbstate)) {
            return <div className="connect-indicator">&#8226;</div>;
        }
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
