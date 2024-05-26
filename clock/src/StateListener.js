import React from "react";
import PropTypes from "prop-types";
import { useSelector, connect } from "react-redux";
import { useFirebaseConnect, isLoaded } from "react-redux-firebase";

import "./StateListener.css";

const StateListener = ({ sync, listenPrefix, auth }) => {
  const listens = [];
  if (auth.isLoaded && !auth.isEmpty) {
    listens.push(`auth/${auth.uid}`);
  } else {
    listens.push("listeners");
  }
  if (listenPrefix) {
    listens.push({
      path: `${listenPrefix}/match`,
      storeAs: "match",
    });
    listens.push({
      path: `${listenPrefix}/controller`,
      storeAs: "controller",
    });
    listens.push({
      path: `${listenPrefix}/view`,
      storeAs: "view",
    });
  }
  useFirebaseConnect(listens);
  const fbstate = useSelector((state) => state.firebase.data);
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
  auth: PropTypes.shape({
    isLoaded: PropTypes.bool,
    isEmpty: PropTypes.bool,
    uid: PropTypes.string,
  }).isRequired,
};

StateListener.defaultProps = {
  sync: false,
};

const stateToProps = ({ remote: { sync, listenPrefix }, firebase }) => ({
  sync,
  listenPrefix,
  auth: firebase.auth,
});
export default connect(stateToProps)(StateListener);
