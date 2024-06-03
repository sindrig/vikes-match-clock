import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import "./index.css";
import { ReactReduxFirebaseProvider } from "react-redux-firebase";
import { store, persistor } from "./store";
import App from "./App";
import "./raven";
import { firebase } from "./firebase";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const rrfProps = {
  firebase,
  config: {},
  dispatch: store.dispatch,
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <ReactReduxFirebaseProvider {...rrfProps}>
        <DndProvider backend={HTML5Backend}>
          <App />
        </DndProvider>
      </ReactReduxFirebaseProvider>
    </PersistGate>
  </Provider>,
);
