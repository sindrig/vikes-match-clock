import {
  applyMiddleware,
  compose,
  createStore,
  Store,
  StoreEnhancer,
  UnknownAction,
} from "redux";
import { persistStore, Persistor } from "redux-persist";
import promiseMiddleware from "redux-promise-middleware";
import { thunk } from "redux-thunk";
import reducer from "./reducers/reducer";

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: () => ReturnType<typeof compose>;
  }
}

const middlewares = applyMiddleware(thunk, promiseMiddleware);

const enhancer: StoreEnhancer = window.__REDUX_DEVTOOLS_EXTENSION__
  ? (compose(
      middlewares,
      window.__REDUX_DEVTOOLS_EXTENSION__(),
    ) as StoreEnhancer)
  : middlewares;

export const store = createStore(reducer, {}, enhancer);

// redux-persist types expect Store<any, UnknownAction> but our store uses redux-actions Action types
export const persistor: Persistor = persistStore(
  store as unknown as Store<ReturnType<typeof reducer>, UnknownAction>,
);

export type AppDispatch = typeof store.dispatch;
