import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Team from '../match/Team';
import Clock from '../match/Clock';
import AdImage from '../utils/AdImage';

import vikesImage from '../images/vikes.png';
import grindavikImage from '../images/grindavik.png';

import './ScoreBoard.css';

const home = {
    image: vikesImage,
    name: 'Víkingur',
    id: 'home',
};
const away = {
    image: grindavikImage,
    name: 'Grindavík',
    id: 'away',
};

export default class ScoreBoard extends Component {
    static propTypes = {
        match: PropTypes.shape({
            homeScore: PropTypes.number,
            awayScore: PropTypes.number,
            started: PropTypes.number,
            half: PropTypes.number,
        }).isRequired,
        update: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.start = this.start.bind(this);
        this.updateScore = this.updateScore.bind(this);
        this.resetClock = this.resetClock.bind(this);
    }

    updateScore(id, newScore) {
        const { update } = this.props;
        const { match } = this.state;
        const payload = {
            ...match,
            [`${id}Score`]: newScore,
        };
        update({ match: payload });
    }

    resetClock() {
        const { update } = this.props;
        update({ started: null });
    }

    start() {
        const { update } = this.props;
        update({ started: Date.now() });
    }

    render() {
        return (
            <div>
                <AdImage />
                <Team className="home" team={home} score={this.props.match.homeScore} updateScore={this.updateScore} />
                <Team className="away" team={away} score={this.props.match.awayScore} updateScore={this.updateScore} />
                <Clock onStart={this.start} started={this.props.match.started} className="clock" reset={this.resetClock} half={this.props.match.half} />
            </div>
        );
    }
}
