import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import "./raven";
import {
  LocalStateProvider,
  useLocalState,
} from "./contexts/LocalStateContext";
import { FirebaseStateProvider } from "./contexts/FirebaseStateContext";

// Create a wrapper component that bridges LocalState to FirebaseState
function AppWithProviders() {
  const { listenPrefix, auth, screenViewport } = useLocalState();
  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  return (
    <FirebaseStateProvider
      listenPrefix={listenPrefix}
      isAuthenticated={isAuthenticated}
      screenViewport={screenViewport}
    >
      <App />
    </FirebaseStateProvider>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const root = createRoot(container);
root.render(
  <LocalStateProvider>
    <AppWithProviders />
  </LocalStateProvider>,
);
