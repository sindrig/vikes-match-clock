import { useLocalState } from "./contexts/LocalStateContext";
import "./StateListener.css";

const StateListener = () => {
  const { sync, auth } = useLocalState();
  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  if (sync && isAuthenticated) {
    return <div className="connect-indicator">&#8226;</div>;
  }
  return null;
};

export default StateListener;
