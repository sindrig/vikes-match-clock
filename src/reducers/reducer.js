import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import match from './match';
import controller from './controller';
import view from './view';

const persistConfig = key => ({
    key,
    storage,
});

export default combineReducers({
    match: persistReducer(persistConfig('match'), match),
    controller: persistReducer(persistConfig('controller'), controller),
    view: persistReducer(persistConfig('view'), view),
});
