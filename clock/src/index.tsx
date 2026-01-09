import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import "./index.css";
import { store, persistor } from "./store";
import App from "./App";
import "./raven";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { firebaseAuth } from "./firebaseAuth";
import { AuthActionType } from "./ActionTypes";

firebaseAuth.onAuthStateChanged((user) => {
  const authState = firebaseAuth.userToAuthState(user);
  store.dispatch({
    type: AuthActionType.SET_AUTH_STATE,
    payload: authState,
  });
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const root = createRoot(container);
root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <DndProvider backend={HTML5Backend}>
        <App />
      </DndProvider>
    </PersistGate>
  </Provider>,
);
