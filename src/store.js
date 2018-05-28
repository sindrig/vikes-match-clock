import { createStore } from 'redux';
import { persistStore } from 'redux-persist';
import reducer from './reducers/reducer';

export const store = createStore(
    reducer,
    // eslint-disable-next-line
    window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__(),
);

export const persistor = persistStore(store);
