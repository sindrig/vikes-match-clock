import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import "./index.css";
import { ReactReduxFirebaseProvider } from "react-redux-firebase";
import firebase from "firebase/app";
import "firebase/database";
import "firebase/auth";
import { store, persistor } from "./store";
import App from "./App";
import "./raven";

const fbConfig = {
  apiKey: "AIzaSyDhdG6cVA2xTfHhceCUA6N4I1EgdDIL1oA",
  authDomain: "vikes-match-clock-firebase.firebaseapp.com",
  databaseURL: "https://vikes-match-clock-firebase.firebaseio.com",
};

if (process.env.NODE_ENV !== "production") {
  console.warn("Using development firebase, be advised");
  fbConfig.apiKey = "AIzaSyCX-4CXktMfJL47nrrpc1y8Q73j09ItmQI";
  fbConfig.authDomain = "vikes-match-clock-staging.firebaseapp.com";
  fbConfig.databaseURL = "https://vikes-match-clock-staging.firebaseio.com";
}

firebase.initializeApp(fbConfig);
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
        <App />
      </ReactReduxFirebaseProvider>
    </PersistGate>
  </Provider>,
  document.getElementById("root")
);
