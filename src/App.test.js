import React from 'react';
import App from './App';
import { initialState as controllerInitialState } from './reducers/controller';
import { initialState as matchInitialState } from './reducers/match';
import { initialState as viewInitialState } from './reducers/view';
import { initialState as remoteInitialState } from './reducers/remote';

it('renders Idle', () => {
    const store = window.mockStore({
        controller: controllerInitialState,
        match: matchInitialState,
        view: viewInitialState,
        remote: remoteInitialState,
        firebase: { data: null },
    });
    const app = window.mountWrapComponent(<App />, store);
    const controller = app.find('Controller');
    expect(controller).toHaveLength(1);
    const matchActions = controller.find('MatchActions');
    expect(matchActions).toHaveLength(1);
    // There should be no buttons in the match actions when rendering idle
    expect(matchActions.find('button')).toHaveLength(0);
    expect(matchActions.find('TeamSelector')).toHaveLength(2);
    expect(controller.find('AssetController')).toHaveLength(1);
    expect(controller.find('TeamAssetController')).toHaveLength(0);
});

it('renders TeamAssetController', () => {
    const store = window.mockStore({
        controller: {
            ...controllerInitialState,
            assetView: 'teams',
        },
        match: matchInitialState,
        view: viewInitialState,
        remote: remoteInitialState,
        firebase: { data: null },
    });
    const app = window.mountWrapComponent(<App />, store);
    const controller = app.find('Controller');
    expect(controller.find('TeamAssetController')).toHaveLength(1);
});
