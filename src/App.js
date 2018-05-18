import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';

import { getMatch, startMatch, updateScore, resetClock } from './api';
import Team from './Team';
import Clock from './Clock';
import ShortcutManager from './ShortcutManager';

import vikesImage from './images/vikes.png';
import grindavikImage from './images/grindavik.png';
import backgroundImage from './images/background.png';

import './App.css';

const backgrounds = [
    {},
    { backgroundColor: 'black' },
    { backgroundImage: `url(${backgroundImage})` },
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
        updateScore(payload)
            .then(updated => this.setState({ match: updated }))
            .catch(err => console.log(err));
    }

    resetClock() {
        resetClock()
            .then((match) => {
                this.setState({ match });
                console.log('match', match);
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
                    <Team className="home" team={this.home} score={homeScore} updateScore={this.updateScore} />
                    <Team className="away" team={this.away} score={awayScore} updateScore={this.updateScore} />
                    <Clock onStart={this.start} started={started} className="clock" reset={this.resetClock} />
                </div>
            </Shortcuts>
        );
    }
}

export default App;
