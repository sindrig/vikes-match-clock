import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { VIEWS } from '../../reducers/controller';
import { HALFS } from '../../constants';

// eslint-disable-next-line
const pad = x => `${x}`.length < 2 ? pad(`0${x}`) : x;

export default class Clock extends Component {
    static propTypes = {
        started: PropTypes.number,
        className: PropTypes.string.isRequired,
        selectView: PropTypes.func.isRequired,
        updateMatch: PropTypes.func.isRequired,
        half: PropTypes.oneOf(Object.keys(HALFS)).isRequired,
    };

    static defaultProps = {
        started: null,
    }

    constructor(props) {
        super(props);
        this.interval = null;
        this.state = {
            time: null,
            done: false,
        };
        this.updateTime = this.updateTime.bind(this);
    }

    componentDidMount() {
        this.interval = setInterval(this.updateTime, 100);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    updateTime() {
        const {
            started, half, selectView, updateMatch,
        } = this.props;
        const { done } = this.state;
        if (started) {
            const secondsElapsed = Math.floor((Date.now() - started) / 1000);
            let minutes = Math.min(Math.floor(secondsElapsed / 60), HALFS[half].length);
            if (done) {
                // If more than 1 hour since game is over, set to idle
                if (minutes > (HALFS[half].length + 60)) {
                    updateMatch({ started: null, half: 'FIRST' });
                    selectView(VIEWS.idle);
                }
            } else {
                let seconds;
                console.log('minutes', minutes);
                console.log('HALFS', HALFS[half].length);
                if (minutes >= HALFS[half].length) {
                    seconds = 0;
                    console.log('done', done);
                    this.setState({ done: true });
                } else {
                    seconds = secondsElapsed % 60;
                }
                minutes += HALFS[half].startAt;
                const time = `${pad(minutes)}:${pad(seconds)}`;
                this.setState({ time });
            }
        }
        return null;
    }

    render() {
        const {
            started, className, half,
        } = this.props;
        const { time } = this.state;
        const minutesString = pad(HALFS[half].startAt || 0);
        const zeroTime = `${minutesString}:00`;
        const displayedTime = started && time || zeroTime;
        const style = {};
        if (displayedTime.length > 5) {
            style.fontSize = '24px';
        }
        return (
            <div className={className} style={style}>
                {displayedTime}
            </div>
        );
    }
}
