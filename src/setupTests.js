import React from 'react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import Enzyme, { mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';


Enzyme.configure({ adapter: new Adapter() });

jest.mock('./lib/weather', () => ({
    getTemp: () => new Promise(resolve => resolve(10)),
}));

window.mockStore = configureStore([]);

window.mountWrapComponent = (component, store) => mount(
    <Provider store={store}>{component}</Provider>,
);
