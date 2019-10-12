import React from 'react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import Enzyme, { mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';


Enzyme.configure({ adapter: new Adapter() });

// I don't think i need this since I don't configure the store to use the persist api
// Reset the IndexedDB mock before/after tests.
// This will clear all object stores, indexes, and data.
// beforeEach(() => reset());
// afterEach(() => reset());
// The IndexedDB mock uses setTimeout() to simulate the asyncronous API.
// Add fake timers before/after tests to ensure the asyncronous responses are received by the test.
// beforeEach(() => jest.useFakeTimers());
// afterEach(() => jest.runAllTimers());

jest.mock('./lib/weather', () => ({
    getTemp: () => new Promise(resolve => resolve(10)),
}));

window.mockStore = configureStore([]);

window.mountWrapComponent = (component, store) => mount(
    <Provider store={store}>{component}</Provider>,
);
