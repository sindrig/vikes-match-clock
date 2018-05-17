import React, { Component } from 'react';
import PropTypes from 'prop-types';

const pad = x => String(`0${x}`).slice(-2);

export default class Clock extends Component {
    static propTypes = {
        onStart: PropTypes.func.isRequired,
        started: PropTypes.number,
        className: PropTypes.string.isRequired,
    };

    static defaultProps = {
        started: null,
    }

    constructor(props) {
        super(props);
        this.interval = null;
        this.state = {
            time: null,
        };
        this.updateTime = this.updateTime.bind(this);
    }

    componentDidMount() {
        setInterval(this.updateTime, 100);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    updateTime() {
        const { started } = this.props;
        if (started) {
            const secondsElapsed = Math.floor((Date.now() - started) / 1000);
            const seconds = secondsElapsed % 60;
            const minutes = Math.floor(secondsElapsed / 60);
            const time = `${pad(minutes)}:${pad(seconds)}`;
            this.setState({ time });
        }
    }

    render() {
        const { started, onStart, className } = this.props;
        if (!started) {
            return <button onClick={onStart} className={className}>Start</button>;
        }
        const { time } = this.state;
        return <span className={className}>{time}</span>;
    }
}
