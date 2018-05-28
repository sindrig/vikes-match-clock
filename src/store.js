import { createStore, applyMiddleware, compose } from 'redux';
import { persistStore } from 'redux-persist';
import promiseMiddleware from 'redux-promise-middleware';
import reducer from './reducers/reducer';

// eslint-disable-next-line
const devTools = window.__REDUX_DEVTOOLS_EXTENSION__ ? window.__REDUX_DEVTOOLS_EXTENSION__() : f => f;

export const store = createStore(
    reducer,
    compose(
        applyMiddleware(promiseMiddleware()),
        devTools,
    ),
);

export const persistor = persistStore(store);
