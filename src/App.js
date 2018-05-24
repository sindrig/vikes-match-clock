import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';

import { getState, updateMatch, updateView, updateController } from './api';
import ShortcutManager from './utils/ShortcutManager';

import Controller from './controller/Controller';

import ScoreBoard from './screens/ScoreBoard';
import Idle from './screens/Idle';
import backgroundImage from './images/background.png';

import './App.css';

const IDLE = 'IDLE';
const MATCH = 'MATCH';

const backgrounds = [
    { backgroundImage: `url(${backgroundImage})` },
    { backgroundColor: 'black' },
    {},
];

class App extends Component {
    static childContextTypes = {
        shortcuts: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            match: {},
            view: IDLE,
            overlay: null,
            controller: null,
        };
        this.updateMatch = this.updateMatch.bind(this);
        this.handleShortcuts = this.handleShortcuts.bind(this);
        this.selectView = this.selectView.bind(this);
        this.setOverlay = this.setOverlay.bind(this);
        this.updateController = this.updateController.bind(this);
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        getState()
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    setOverlay(component) {
        this.setState({ overlay: component });
    }

    updateMatch(partial) {
        updateMatch(partial)
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    updateController(partial) {
        updateController(partial)
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    selectView(event) {
        const { target: { value } } = event;
        updateView(value)
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    handleShortcuts() {
        // TODO do we need something?
        // handleShorcuts accepts (action (string), event (Event))
        return this;
    }

    renderOverlay() {
        // TODO move to separate container.
        // TODO fade out.
        const { overlay } = this.state;
        if (!overlay) {
            return null;
        }
        return (
            <div className="overlay-container">
                {overlay}
            </div>
        );
    }

    renderCurrentView() {
        const { view } = this.state;

        switch (view) {
        case MATCH:
            return <ScoreBoard match={this.state.match} update={this.updateMatch} />;
        case IDLE:
        default:
            return <Idle />;
        }
    }

    render() {
        return (
            <Shortcuts
                name="MAIN"
                handler={this.handleShortcuts}
            >
                <div className="App" style={backgrounds[0]}>
                    {this.renderCurrentView()}
                </div>
                {this.state.controller &&
                    <Controller
                        state={this.state}
                        updateMatch={this.updateMatch}
                        selectView={this.selectView}
                        views={[IDLE, MATCH]}
                        renderAsset={this.setOverlay}
                        controllerState={this.state.controller}
                        updateState={this.updateController}
                    />
                }
                {this.renderOverlay()}
            </Shortcuts>
        );
    }
}

export default App;
