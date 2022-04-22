import React from "react";
import ReactDOM from "react-dom";
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

const rrfConfig = {
  userProfile: "users",
};

const rrfProps = {
  firebase,
  config: rrfConfig,
  dispatch: store.dispatch,
};

ReactDOM.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <ReactReduxFirebaseProvider {...rrfProps}>
        <DndProvider backend={HTML5Backend}>
          <App />
        </DndProvider>
      </ReactReduxFirebaseProvider>
    </PersistGate>
  </Provider>,
  document.getElementById("root")
);
