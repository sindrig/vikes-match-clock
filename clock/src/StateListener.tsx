import { useSelector, connect } from "react-redux";
import { useFirebaseConnect, isLoaded } from "react-redux-firebase";

import "./StateListener.css";
import { RootState, FirebaseAuthState } from "./types";

interface StateListenerProps {
  sync: boolean;
  listenPrefix: string;
  auth: FirebaseAuthState;
}

type FirebaseListen = string | { path: string; storeAs: string };

const StateListener = ({ sync, listenPrefix, auth }: StateListenerProps) => {
  const listens: FirebaseListen[] = ["locations"];
  if (auth.isLoaded && !auth.isEmpty && auth.uid) {
    listens.push(`auth/${auth.uid}`);
  }
  if (listenPrefix) {
    listens.push({
      path: `states/${listenPrefix}/match`,
      storeAs: "match",
    });
    listens.push({
      path: `states/${listenPrefix}/controller`,
      storeAs: "controller",
    });
    listens.push({
      path: `states/${listenPrefix}/view`,
      storeAs: "view",
    });
  }
  useFirebaseConnect(listens);
  const fbstate = useSelector((state: RootState) => state.firebase);
  if (sync) {
    if (isLoaded(fbstate)) {
      return <div className="connect-indicator">&#8226;</div>;
    }
  }
  return null;
};

const mapStateToProps = ({
  remote: { sync, listenPrefix },
  firebase,
}: RootState) => ({
  sync,
  listenPrefix,
  auth: firebase.auth,
});

const connector = connect(mapStateToProps);

export default connector(StateListener);
