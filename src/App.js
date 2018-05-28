import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';
import { connect } from 'react-redux';

import { getState, updateMatch, updateController, clearState } from './api';
import ShortcutManager from './utils/ShortcutManager';

import Controller from './controller/Controller';

import ScoreBoard from './screens/ScoreBoard';
import Idle from './screens/Idle';
import backgroundImage from './images/background.png';

import { VIEWS } from './reducers/controller';

import './App.css';

const IDLE = 'IDLE';
const MATCH = 'MATCH';

const backgrounds = [
    { backgroundImage: `url(${backgroundImage})` },
    { backgroundColor: 'black' },
    {},
];

class App extends Component {
    static propTypes = {
        view: PropTypes.string.isRequired,
    };

    static childContextTypes = {
        shortcuts: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            match: {},
            overlay: null,
            controller: null,
        };
        this.updateMatch = this.updateMatch.bind(this);
        this.handleShortcuts = this.handleShortcuts.bind(this);
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
        const { view } = this.props;

        switch (view) {
        case VIEWS.match:
            return <ScoreBoard match={this.state.match} update={this.updateMatch} />;
        case VIEWS.idle:
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
                        views={[IDLE, MATCH]}
                        renderAsset={this.setOverlay}
                        controllerState={this.state.controller}
                        updateState={this.updateController}
                        clearState={clearState}
                    />
                }
                {this.renderOverlay()}
            </Shortcuts>
        );
    }
}

const stateToProps = ({ controller: { view } }) => ({ view });

export default connect(stateToProps)(App);
