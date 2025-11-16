import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import matchActions from "../actions/match";

import { Sports } from "../constants";
import { formatTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";

class Clock extends Component {
  static propTypes = {
    started: PropTypes.number,
    countdown: PropTypes.bool,
    timeElapsed: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
    pauseMatch: PropTypes.func.isRequired,
    buzz: PropTypes.func.isRequired,
    // eslint-disable-next-line
    matchType: PropTypes.oneOf(Object.keys(Sports)).isRequired,
    halfStop: PropTypes.number.isRequired,
    showInjuryTime: PropTypes.bool,
  };

  static defaultProps = {
    started: null,
    countdown: false,
    showInjuryTime: true,
  };

  constructor(props) {
    super(props);
    this.updateTime = this.updateTime.bind(this);
  }

  updateTime() {
    const {
      started,
      halfStop,
      timeElapsed,
      pauseMatch,
      buzz,
      showInjuryTime,
      countdown,
    } = this.props;
    let milliSecondsElapsed = timeElapsed;
    if (started) {
      milliSecondsElapsed += Date.now() - started;
    }
    const secondsElapsed = Math.floor(milliSecondsElapsed / 1000);
    const minutesElapsed = Math.floor(secondsElapsed / 60);
    let minutes = showInjuryTime
      ? minutesElapsed
      : Math.min(minutesElapsed, halfStop);
    let seconds;
    if (!showInjuryTime && minutes >= halfStop && started) {
      seconds = 0;
      pauseMatch({ isHalfEnd: true });
      buzz();
    } else {
      seconds = secondsElapsed % 60;
    }
    if (countdown) {
      seconds *= -1;
      minutes *= -1;
      if (seconds) {
        minutes -= 1;
      }
      if (minutes <= 0 && seconds <= 0) {
        minutes = 0;
        seconds = 0;
        pauseMatch();
      }
    }
    return formatTime(minutes, seconds);
  }

  render() {
    const { started, timeElapsed, className } = this.props;
    return (
      <ClockBase
        updateTime={this.updateTime}
        isTimeNull={!started && !timeElapsed}
        className={className}
      />
    );
  }
}

const stateToProps = ({
  match: {
    started,
    halfStops,
    timeElapsed,
    matchType,
    showInjuryTime,
    countdown,
  },
}) => ({
  started,
  countdown,
  timeElapsed,
  matchType,
  showInjuryTime,
  halfStop: halfStops[0],
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      pauseMatch: matchActions.pauseMatch,
      buzz: matchActions.buzz,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(Clock);
