import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { HALFS } from '../../constants';

// eslint-disable-next-line
const pad = x => `${x}`.length < 2 ? pad(`0${x}`) : x;

export default class Clock extends Component {
    static propTypes = {
        started: PropTypes.number,
        className: PropTypes.string.isRequired,
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

    static getDerivedStateFromProps(nextProps) {
        const newState = { done: false };
        if (!nextProps.started) {
            newState.time = null;
        }
        return newState;
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    updateTime() {
        const { started, half } = this.props;
        const { done } = this.state;
        if (!done && started) {
            const secondsElapsed = Math.floor((Date.now() - started) / 1000);
            let minutes = Math.min(Math.floor(secondsElapsed / 60), 45);
            let seconds;
            if (minutes >= 45) {
                seconds = 0;
                this.setState({ done: true });
            } else {
                seconds = secondsElapsed % 60;
            }
            minutes += HALFS[half];
            const time = `${pad(minutes)}:${pad(seconds)}`;
            this.setState({ time });
        }
        return null;
    }

    render() {
        const {
            started, className, half,
        } = this.props;
        const { time } = this.state;
        const minutesString = pad(HALFS[half] || 0);
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
