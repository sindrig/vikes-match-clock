import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import controllerActions from "../actions/controller";
import Button from "rsuite/Button";

const RefreshHandler = ({ refreshToken, sync, auth, remoteRefresh }) => {
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      window.location.reload();
    }
  }, [refreshToken]);
  if (sync && !auth.isEmpty) {
    return (
      <Button
        color="orange"
        appearance="primary"
        size="sm"
        onClick={remoteRefresh}
      >
        Endurræsa alla skjái
      </Button>
    );
  }
  return null;
};

RefreshHandler.propTypes = {
  refreshToken: PropTypes.string.isRequired,
  auth: PropTypes.shape({
    isEmpty: PropTypes.bool,
  }).isRequired,
  sync: PropTypes.bool,
  remoteRefresh: PropTypes.func.isRequired,
};

const stateToProps = ({
  controller: { refreshToken },
  remote: { sync },
  firebase: { auth },
}) => ({
  refreshToken,
  auth,
  sync,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      remoteRefresh: controllerActions.remoteRefresh,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(RefreshHandler);
