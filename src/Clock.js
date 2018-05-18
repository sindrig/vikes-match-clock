import React, { Component } from 'react';
import PropTypes from 'prop-types';

const pad = x => String(`0${x}`).slice(-2);
const defaultState = {
    time: null,
    clicks: 0,
    done: false,
};

export default class Clock extends Component {
    static propTypes = {
        onStart: PropTypes.func.isRequired,
        reset: PropTypes.func.isRequired,
        started: PropTypes.number,
        className: PropTypes.string.isRequired,
    };

    static defaultProps = {
        started: null,
    }

    constructor(props) {
        super(props);
        this.interval = null;
        this.state = defaultState;
        this.updateTime = this.updateTime.bind(this);
        this.addClick = this.addClick.bind(this);
        this.addSuperClick = this.addSuperClick.bind(this);
    }

    componentDidMount() {
        setInterval(this.updateTime, 100);
    }

    static getDerivedStateFromProps() {
        return { done: false };
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    addClick(e, superClick = false) {
        e.preventDefault();
        const { reset } = this.props;
        const { done, clicks } = this.state;
        if (clicks > 4) {
            this.setState(defaultState);
            reset();
        } else if (done || superClick) {
            this.setState({ clicks: clicks + 1 });
            setTimeout(() => this.setState({ clicks: 0 }), 10000);
        } else {
            this.setState({ clicks: 0 });
        }
    }

    addSuperClick(e) {
        return this.addClick(e, true);
    }

    updateTime() {
        const { started } = this.props;
        const { done } = this.state;
        if (!done && started) {
            const secondsElapsed = Math.floor((Date.now() - started) / 1000);
            const minutes = Math.min(Math.floor(secondsElapsed / 60), 45);
            let seconds;
            if (minutes >= 45) {
                seconds = 0;
                this.setState({ done: true });
            } else {
                seconds = secondsElapsed % 60;
            }
            const time = `${pad(minutes)}:${pad(seconds)}`;
            this.setState({ time });
        }
        return null;
    }

    render() {
        const { started, onStart, className } = this.props;
        if (!started) {
            return <button onClick={onStart} className={className}>Start</button>;
        }
        const { time } = this.state;
        return (
            <button
                className={className}
                onClick={this.addClick}
                onContextMenu={this.addSuperClick}
            >
                {time}
            </button>
        );
    }
}
