import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import "./raven";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  LocalStateProvider,
  useLocalState,
} from "./contexts/LocalStateContext";
import { FirebaseStateProvider } from "./contexts/FirebaseStateContext";

// Create a wrapper component that bridges LocalState to FirebaseState
function AppWithProviders() {
  const { sync, listenPrefix, auth } = useLocalState();
  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  return (
    <FirebaseStateProvider
      sync={sync}
      listenPrefix={listenPrefix}
      isAuthenticated={isAuthenticated}
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
    <DndProvider backend={HTML5Backend}>
      <AppWithProviders />
    </DndProvider>
  </LocalStateProvider>,
);
