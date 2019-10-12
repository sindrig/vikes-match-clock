import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';

import matchActions from '../actions/match';

import { formatMillisAsTime } from '../utils/timeUtils';
import ClockBase from './ClockBase';

class TimeoutClock extends Component {
    static propTypes = {
        timeout: PropTypes.number,
        removeTimeout: PropTypes.func.isRequired,
        className: PropTypes.string.isRequired,
    };

    static defaultProps = {
        timeout: null,
    }

    constructor(props) {
        super(props);
        this.updateTime = this.updateTime.bind(this);
    }

    updateTime() {
        const { timeout, removeTimeout } = this.props;
        if (!timeout) {
            return null;
        }
        const millisLeft = 60000 - (Date.now() - timeout);
        if (millisLeft <= 0) {
            removeTimeout({ playBuzzer: true });
        }
        return formatMillisAsTime(millisLeft);
    }

    render() {
        const {
            className,
        } = this.props;
        return (
            <ClockBase
                updateTime={this.updateTime}
                isTimeNull={false}
                className={className}
                zeroTime={60000}
                fontSizeMin="1.3rem"
                fontSizeMax="1.5rem"
            />
        );
    }
}

const stateToProps = ({
    match: {
        timeout,
    },
}) => ({
    timeout,
});

const dispatchToProps = dispatch => bindActionCreators({
    removeTimeout: matchActions.removeTimeout,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(TimeoutClock);
