import React, { Component } from 'react';
import PropTypes from 'prop-types';

const pad = x => String(`0${x}`).slice(-2);

export default class Clock extends Component {
    static propTypes = {
        started: PropTypes.number,
        className: PropTypes.string.isRequired,
        half: PropTypes.number.isRequired,
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
            if (half === 2) {
                minutes += 45;
            }
            const time = `${pad(minutes)}:${pad(seconds)}`;
            this.setState({ time });
        }
        return null;
    }

    render() {
        const {
            started, className, half,
        } = this.props;
        const zeroTime = half === 2 ? '45:00' : '00:00';
        if (!started) {
            return <div className={className}>{zeroTime}</div>;
        }
        const { time } = this.state;
        return (
            <div className={className}>
                {time || zeroTime}
            </div>
        );
    }
}
