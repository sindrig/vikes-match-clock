import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './index.css';
import { ReactReduxFirebaseProvider } from 'react-redux-firebase';
import firebase from 'firebase/app';
import 'firebase/database';
import 'firebase/auth';
import { store, persistor } from './store';
import App from './App';
import './raven';

const fbConfig = {
    apiKey: 'AIzaSyDhdG6cVA2xTfHhceCUA6N4I1EgdDIL1oA',
    authDomain: 'vikes-match-clock-firebase.firebaseapp.com',
    databaseURL: 'https://vikes-match-clock-firebase.firebaseio.com',
    // projectId: 'vikes-match-clock-firebase',
    // storageBucket: 'vikes-match-clock-firebase.appspot.com',
    // messagingSenderId: '861256792475',
    // appId: '1:861256792475:web:7968ebb26dc716ac5c093e',
};

firebase.initializeApp(fbConfig);
const rrfConfig = {
    userProfile: 'users',
};

const rrfProps = {
    firebase,
    config: rrfConfig,
    dispatch: store.dispatch,
};

// TODO maybe use SSL and get service worker...?
// import registerServiceWorker from './registerServiceWorker';

ReactDOM.render(
    (
        <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <ReactReduxFirebaseProvider {...rrfProps}>
                    <App />
                </ReactReduxFirebaseProvider>
            </PersistGate>
        </Provider>
    ),
    document.getElementById('root'),
);
// registerServiceWorker();
