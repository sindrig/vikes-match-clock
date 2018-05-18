import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';

import { getState, updateMatch, updateView } from './api';
import ShortcutManager from './ShortcutManager';
import Controller from './Controller';

import ScoreBoard from './ScoreBoard';
import Idle from './Idle';
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
        };
        this.updateMatch = this.updateMatch.bind(this);
        this.handleShortcuts = this.handleShortcuts.bind(this);
        this.selectView = this.selectView.bind(this);
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        getState()
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    handleShortcuts() {
        // TODO do we need something?
        // handleShorcuts accepts (action (string), event (Event))
        return this;
    }

    updateMatch(partial) {
        updateMatch(partial)
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    selectView(event) {
        const { target: { value } } = event;
        updateView(value)
            .then(state => this.setState(state))
            .catch(err => console.log(err));
    }

    renderCurrentView() {
        const { view } = this.state;
        console.log('this.state', this.state);

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
                <Controller
                    state={this.state}
                    updateMatch={this.updateMatch}
                    selectView={this.selectView}
                    views={[IDLE, MATCH]}
                />
            </Shortcuts>
        );
    }
}

export default App;
