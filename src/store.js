import { createStore, applyMiddleware, compose } from "redux";
import { persistStore } from "redux-persist";
import promiseMiddleware from "redux-promise-middleware";
import thunk from "redux-thunk";
import {
  getFirebase,
  actionTypes as rrfActionTypes,
} from "react-redux-firebase";
import reducer from "./reducers/reducer";
import { Match, Controller, Remote } from "./ActionTypes";

const firebaseMiddleware = (store) => (next) => (action) => {
  const { type } = action;
  const result = next(action);
  const {
    remote: { sync },
    match,
    controller,
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
      const { email } = auth;
      const userPrefix = email.split("@")[0];
      if (Match[type]) {
        firebase.set(`${userPrefix}/match`, match);
      }
      if (Controller[type]) {
        firebase.set(`${userPrefix}/controller`, controller);
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
    devTools
  )
);

export const persistor = persistStore(store);
