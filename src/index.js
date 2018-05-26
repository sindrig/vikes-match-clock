import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

if (process.env.NODE_ENV === 'production') {
    if (window.Raven) {
        window.Raven.config('https://cb9ee6811f634cfb83e9615c9f3f9d4a@sentry.io/1214011', {
            release: '0-0-0',
            environment: 'production',
        }).install();
        console.log('Raven registered');
    } else {
        console.log('Was going to register Raven, but could not find it');
    }
} else {
    console.log(`${process.env.NODE_ENV} does not use Raven`);
}

// TODO maybe use SSL and get service worker...?
// import registerServiceWorker from './registerServiceWorker';

ReactDOM.render(<App />, document.getElementById('root'));
// registerServiceWorker();

