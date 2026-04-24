import { useLocalState } from "./contexts/LocalStateContext";
import useConnectedScreens from "./hooks/useConnectedScreens";
import "./StateListener.css";

const StateListener = () => {
  const { auth, listenPrefix } = useLocalState();
  const isAuthenticated = auth.isLoaded && !auth.isEmpty;
  const connectedCount = useConnectedScreens(
    isAuthenticated ? listenPrefix : "",
  );

  if (!isAuthenticated || !listenPrefix) return null;

  return (
    <div
      className="connect-indicator"
      title={`${connectedCount} ${connectedCount === 1 ? "skjár tengdur" : "skjáir tengdir"}`}
    >
      <span className="connect-indicator-count">{connectedCount}</span>
      <span className="connect-indicator-icon">&#9632;</span>
    </div>
  );
};

export default StateListener;
