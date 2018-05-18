import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';

import { getMatch, startMatch, update, resetClock } from './api';
import Team from './Team';
import Clock from './Clock';
import ShortcutManager from './ShortcutManager';
import Controller from './Controller';

import vikesImage from './images/vikes.png';
import grindavikImage from './images/grindavik.png';
import backgroundImage from './images/background.png';
import adImage from './images/borgun.jpg';

import './App.css';

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
            match: null,
            background: 0,
        };
        this.start = this.start.bind(this);
        this.updateScore = this.updateScore.bind(this);
        this.update = this.update.bind(this);
        this.resetClock = this.resetClock.bind(this);
        this.handleShortcuts = this.handleShortcuts.bind(this);
        this.home = {
            image: vikesImage,
            name: 'Víkingur',
            id: 'home',
        };
        this.away = {
            image: grindavikImage,
            name: 'Grindavík',
            id: 'away',
        };
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        getMatch()
            .then(match => this.setState({ match }))
            .catch(err => console.log(err));
    }

    handleShortcuts(action) {
        switch (action) {
        case 'BACKGROUND':
            this.changeBackground();
            break;
        default:
            console.log('no');
            break;
        }
    }

    start() {
        startMatch()
            .then(match => this.setState({ match }))
            .catch(err => console.log(err));
    }

    changeBackground() {
        let background = this.state.background + 1;
        if (background >= backgrounds.length) {
            background = 0;
        }
        this.setState({ background });
    }

    updateScore(id, newScore) {
        const { match } = this.state;
        const payload = {
            ...match,
            [`${id}Score`]: newScore,
        };
        update(payload)
            .then(updated => this.setState({ match: updated }))
            .catch(err => console.log(err));
    }

    update(partial) {
        update(partial)
            .then(updated => this.setState({ match: updated }))
            .catch(err => console.log(err));
    }

    resetClock() {
        resetClock()
            .then((match) => {
                this.setState({ match });
            })
            .catch(err => console.log(err));
    }

    render() {
        if (!this.state.match) {
            return null;
        }
        const { match: { homeScore, awayScore, started }, background } = this.state;
        return (
            <Shortcuts
                name="MAIN"
                handler={this.handleShortcuts}
            >
                <div className="App" style={backgrounds[background]}>
                    <img src={adImage} className="ad" alt="Ad" />
                    <Team className="home" team={this.home} score={homeScore} updateScore={this.updateScore} />
                    <Team className="away" team={this.away} score={awayScore} updateScore={this.updateScore} />
                    <Clock onStart={this.start} started={started} className="clock" reset={this.resetClock} />
                </div>
                <Controller match={this.state.match} update={this.update} />
            </Shortcuts>
        );
    }
}

export default App;
