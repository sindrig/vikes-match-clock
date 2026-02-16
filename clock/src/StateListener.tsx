import { useLocalState } from "./contexts/LocalStateContext";
import "./StateListener.css";

const StateListener = () => {
  const { auth } = useLocalState();
  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  if (isAuthenticated) {
    return <div className="connect-indicator">&#8226;</div>;
  }
  return null;
};

export default StateListener;
