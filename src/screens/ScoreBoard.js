import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Team from '../match/Team';
import Clock from '../match/Clock';
import AdImage from '../utils/AdImage';

import clubLogos from '../images/clubLogos';

import './ScoreBoard.css';

const getTeam = (id, match) => {
    const name = match[`${id}Team`];
    return {
        image: clubLogos[name] || null,
        name,
        id,
    };
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
        this.resetClock = this.resetClock.bind(this);
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
                <Team className="home" team={getTeam('home', this.props.match)} score={this.props.match.homeScore} />
                <Team className="away" team={getTeam('away', this.props.match)} score={this.props.match.awayScore} />
                <Clock onStart={this.start} started={this.props.match.started} className="clock" reset={this.resetClock} half={this.props.match.half} />
            </div>
        );
    }
}
