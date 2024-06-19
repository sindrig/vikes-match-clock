import { createStore, applyMiddleware, compose } from "redux";
import { persistStore } from "redux-persist";
import promiseMiddleware from "redux-promise-middleware";
import thunk from "redux-thunk";
import {
  getFirebase,
  actionTypes as rrfActionTypes,
} from "react-redux-firebase";
import reducer from "./reducers/reducer";
import { Match, Controller, Remote, View } from "./ActionTypes";

const firebaseMiddleware = (store) => (next) => (action) => {
  const { type } = action;
  const result = next(action);
  const {
    remote: { sync, listenPrefix },
    match,
    controller,
    view,
    firebase: { auth },
  } = store.getState();
  let firebase;
  try {
    firebase = getFirebase();
  } catch (e) {
    firebase = null;
  }
  if (firebase && sync) {
    if (auth.isLoaded && !auth.isEmpty) {
      if (Match[type]) {
        firebase.set(`states/${listenPrefix}/match`, match);
      }
      if (Controller[type]) {
        firebase.set(`states/${listenPrefix}/controller`, controller);
      }
      if (View[type]) {
        firebase.set(`states/${listenPrefix}/view`, view);
      }
    }
    if (type === rrfActionTypes.SET) {
      store.dispatch({
        ...action,
        type: Remote.receiveRemoteData,
      });
    }
  }
  return result;
};

// eslint-disable-next-line
const devTools = window.__REDUX_DEVTOOLS_EXTENSION__
  ? window.__REDUX_DEVTOOLS_EXTENSION__()
  : (f) => f;

export const store = createStore(
  reducer,
  {},
  compose(
    applyMiddleware(thunk, promiseMiddleware, firebaseMiddleware),
    devTools,
  ),
);

export const persistor = persistStore(store);
