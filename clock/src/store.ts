import {
  applyMiddleware,
  compose,
  createStore,
  StoreEnhancer,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- redux-persist types don't align with redux-actions Action types
export const persistor: Persistor = persistStore(store as any);

export type AppDispatch = typeof store.dispatch;
