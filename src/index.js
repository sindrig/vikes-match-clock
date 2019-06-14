import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './index.css';
import { store, persistor } from './store';
import App from './App';
import './raven';


// TODO maybe use SSL and get service worker...?
// import registerServiceWorker from './registerServiceWorker';

ReactDOM.render(
    (
        <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <App />
            </PersistGate>
        </Provider>
    ),
    document.getElementById('root'),
);
// registerServiceWorker();
