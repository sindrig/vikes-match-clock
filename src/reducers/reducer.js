import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';
import storage from './storage';

import match from './match';
import controller from './controller';

const persistConfig = key => ({
    key,
    storage,
    serialize: false,
});

export default combineReducers({
    match: persistReducer(persistConfig('match'), match),
    controller: persistReducer(persistConfig('controller'), controller),
});
