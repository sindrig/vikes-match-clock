import React, { Component } from 'react';

import { getMatch, startMatch, updateScore, resetClock } from './api';
import Team from './Team';
import Clock from './Clock';

import vikesImage from './images/vikes.png';
import grindavikImage from './images/grindavik.png';

import './App.css';

class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            match: null,
        };
        this.start = this.start.bind(this);
        this.updateScore = this.updateScore.bind(this);
        this.resetClock = this.resetClock.bind(this);
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

    componentDidMount() {
        getMatch()
            .then(match => this.setState({ match }))
            .catch(err => console.log(err));
    }

    start() {
        startMatch()
            .then(match => this.setState({ match }))
            .catch(err => console.log(err));
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
            .then(match => {
                this.setState({ match })
                console.log('match', match);
            })
            .catch(err => console.log(err));
    }

    render() {
        console.log('this.state', this.state);
        if (!this.state.match) {
            return null;
        }
        const { match: { homeScore, awayScore, started } } = this.state;
        console.log('started', started);
        return (
            <div className="App">
                <Team className="home" team={this.home} score={homeScore} updateScore={this.updateScore} />
                <Team className="away" team={this.away} score={awayScore} updateScore={this.updateScore} />
                <Clock onStart={this.start} started={started} className="clock" reset={this.resetClock} />
            </div>
        );
    }
}

export default App;
