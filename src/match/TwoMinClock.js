import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import matchActions from "../actions/match";
import { formatMillisAsTime } from "../utils/timeUtils";

class TwoMinClock extends Component {
  static propTypes = {
    started: PropTypes.number,
    timeElapsed: PropTypes.number.isRequired,
    // eslint-disable-next-line
    atTimeElapsed: PropTypes.number.isRequired,
    penaltyLength: PropTypes.number.isRequired,
    uniqueKey: PropTypes.string.isRequired,
    removePenalty: PropTypes.func.isRequired,
  };

  static defaultProps = {
    started: null,
  };

  constructor(props) {
    super(props);
    this.interval = null;
    this.state = {
      time: null,
    };
    this.updateTime = this.updateTime.bind(this);
  }

  componentDidMount() {
    this.interval = setInterval(this.updateTime, 100);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  static getDerivedStateFromProps({ started, timeElapsed }) {
    if (!started && !timeElapsed) {
      return { time: null };
    }
    return null;
  }

  updateTime() {
    const {
      started,
      timeElapsed,
      atTimeElapsed,
      penaltyLength,
      removePenalty,
      uniqueKey,
    } = this.props;
    let milliSecondsElapsed = timeElapsed - atTimeElapsed;
    if (started) {
      milliSecondsElapsed += Date.now() - started;
    }
    const milliSecondsLeft = penaltyLength - milliSecondsElapsed;
    if (milliSecondsLeft < 0) {
      removePenalty(uniqueKey);
    } else {
      this.setState({ time: formatMillisAsTime(milliSecondsLeft) });
    }
    return null;
  }

  render() {
    const { penaltyLength } = this.props;
    const { time } = this.state;
    // const zeroTime = formatTime(penaltyLength / 60000, (penaltyLength / 1000) % 60)
    const displayedTime = time || formatMillisAsTime(penaltyLength);
    return <div className="penalty">{displayedTime}</div>;
  }
}

const stateToProps = ({ match: { started, timeElapsed, matchType } }) => ({
  started,
  timeElapsed,
  matchType,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      removePenalty: matchActions.removePenalty,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(TwoMinClock);
