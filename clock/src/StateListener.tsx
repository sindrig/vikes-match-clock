import { useSelector } from "react-redux";
import {
  useFirebaseSync,
  useFirebaseAuthListener,
} from "./hooks/useFirebaseSync";

import "./StateListener.css";
import { RootState } from "./types";

const StateListener = () => {
  const { sync } = useSelector((state: RootState) => state.remote);
  const { isLoaded, isEmpty } = useSelector((state: RootState) => state.auth);

  useFirebaseSync();
  useFirebaseAuthListener();

  if (sync && isLoaded && !isEmpty) {
    return <div className="connect-indicator">&#8226;</div>;
  }
  return null;
};

export default StateListener;
