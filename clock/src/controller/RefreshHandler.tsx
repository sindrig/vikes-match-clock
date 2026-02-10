import { useEffect, useRef } from "react";
import Button from "rsuite/Button";
import { useController } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";

const RefreshHandler = () => {
  const { controller, remoteRefresh } = useController();
  const { sync, auth } = useLocalState();
  const refreshToken = controller.refreshToken;

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

export default RefreshHandler;
