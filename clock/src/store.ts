import {
  applyMiddleware,
  compose,
  createStore,
  Middleware,
  StoreEnhancer,
} from "redux";
import { persistStore } from "redux-persist";
import promiseMiddleware from "redux-promise-middleware";
import { thunk, type ThunkDispatch } from "redux-thunk";
import {
  actionTypes as rrfActionTypes,
  getFirebase,
} from "react-redux-firebase";
import reducer from "./reducers/reducer";
import { Controller, Match, RemoteActionType, View } from "./ActionTypes";
import type { RootState } from "./types";

// Extend window for Redux DevTools
declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: () => ReturnType<typeof compose>;
  }
}

const firebaseMiddleware: Middleware<
  Record<string, never>,
  RootState,
  ThunkDispatch<RootState, unknown, { type: string }>
> = (store) => (next) => (action) => {
  const actionObj = action as Record<string, unknown> & { type: string };
  const { type } = actionObj;
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
  } catch {
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
        ...actionObj,
        type: RemoteActionType.RECEIVE_REMOTE_DATA,
      });
    }
  }
  return result;
};

const middlewares = applyMiddleware(
  thunk,
  promiseMiddleware,
  firebaseMiddleware,
);

const enhancer: StoreEnhancer = window.__REDUX_DEVTOOLS_EXTENSION__
  ? (compose(
      middlewares,
      window.__REDUX_DEVTOOLS_EXTENSION__(),
    ) as StoreEnhancer)
  : middlewares;

export const store = createStore(reducer, {}, enhancer);

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
