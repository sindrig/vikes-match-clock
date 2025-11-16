import { applyMiddleware, compose, createStore, Middleware } from "redux";
import { persistStore } from "redux-persist";
import promiseMiddleware from "redux-promise-middleware";
import { thunk, type ThunkDispatch } from "redux-thunk";
import {
  actionTypes as rrfActionTypes,
  getFirebase,
} from "react-redux-firebase";
import reducer from "./reducers/reducer";
import { Controller, Match, Remote, View } from "./ActionTypes";
import type { RootState } from "./types";

// Extend window for Redux DevTools
declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: () => unknown;
  }
}

const firebaseMiddleware: Middleware<
  Record<string, never>,
  RootState,
  ThunkDispatch<RootState, unknown, { type: string }>
> = (store) => (next) => (action) => {
  const { type } = action as { type: string };
  const result = next(action);
  const {
    remote: { sync, listenPrefix },
    match,
    controller,
    view,
    firebase: { auth },
  } = store.getState();
  let firebase: ReturnType<typeof getFirebase> | null;
  try {
    firebase = getFirebase();
  } catch (e) {
    firebase = null;
  }
  if (firebase && sync) {
    if (auth.isLoaded && !auth.isEmpty) {
      if (Match[type]) {
        void firebase.set(`states/${listenPrefix}/match`, match);
      }
      if (Controller[type]) {
        void firebase.set(`states/${listenPrefix}/controller`, controller);
      }
      if (View[type]) {
        void firebase.set(`states/${listenPrefix}/view`, view);
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

const devTools = window.__REDUX_DEVTOOLS_EXTENSION__
  ? window.__REDUX_DEVTOOLS_EXTENSION__()
  : (f: unknown) => f;

export const store = createStore(
  reducer,
  {},
  compose(applyMiddleware(thunk, promiseMiddleware, firebaseMiddleware), devTools)
);

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
