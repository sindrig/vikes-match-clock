import React, { Component } from 'react';

import api from './api';
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
        api.getMatch()
            .then(res => this.setState(res.data))
            .catch(err => console.log(err));
    }

    start() {
        api.startMatch()
            .then(res => this.setState(res.data))
            .catch(err => console.log(err));
    }

    updateScore(id, newScore) {
        const { match } = this.state;
        const payload = {
            ...match,
            [`${id}Score`]: newScore,
        };
        console.log('payload', payload);
        api.updateScore(payload)
            .then(res => this.setState(res.data))
            .catch(err => console.log(err));
    }

    render() {
        if (!this.state.match) {
            return null;
        }
        const { match: { homeScore, awayScore, started } } = this.state;
        return (
            <div className="App">
                <Team className="home" team={this.home} score={homeScore} updateScore={this.updateScore}/>
                <Team className="away" team={this.away} score={awayScore} updateScore={this.updateScore}/>
                <Clock onStart={this.start} started={started} className="clock" />
            </div>
        );
    }
}

export default App;
