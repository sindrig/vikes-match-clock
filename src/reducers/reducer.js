import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { firebaseReducer } from 'react-redux-firebase';

import match from './match';
import controller from './controller';
import view from './view';
import remote from './remote';

const persistConfig = key => ({
    key,
    storage,
    serialize: true,
});

export default combineReducers({
    match: persistReducer(persistConfig('match'), match),
    controller: persistReducer(persistConfig('controller'), controller),
    view: persistReducer(persistConfig('view'), view),
    remote: persistReducer(persistConfig('remote'), remote),
    firebase: firebaseReducer,
});
