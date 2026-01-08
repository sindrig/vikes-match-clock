import { useEffect, useRef } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import controllerActions from "../actions/controller";
import Button from "rsuite/Button";
import { RootState } from "../types";

const mapStateToProps = (state: RootState) => ({
  refreshToken: state.controller.refreshToken,
  auth: state.firebase.auth,
  sync: state.remote.sync,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      remoteRefresh: controllerActions.remoteRefresh,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

const RefreshHandler = ({
  refreshToken,
  sync,
  auth,
  remoteRefresh,
}: PropsFromRedux) => {
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

export default connector(RefreshHandler);
