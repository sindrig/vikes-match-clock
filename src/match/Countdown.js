import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import matchActions from "../actions/match";
import bestacountdown from "../images/bestacountdown.png";

import ClockBase from "./ClockBase";

class Clock extends Component {
  static propTypes = {
    started: PropTypes.number,
    timeElapsed: PropTypes.number.isRequired,
    startMatch: PropTypes.func.isRequired,
  };

  static defaultProps = {
    started: null,
  };

  constructor(props) {
    super(props);
    this.updateTime = this.updateTime.bind(this);
  }

  updateTime() {
    const { startMatch, started, timeElapsed } = this.props;
    let milliSecondsElapsed = timeElapsed;
    milliSecondsElapsed += Date.now() - started;
    const secondsElapsed = -Math.floor(milliSecondsElapsed / 1000);
    const minutesElapsed = Math.floor(secondsElapsed / 60);
    if (minutesElapsed > 0 || secondsElapsed > 10) {
      return <img src={bestacountdown} alt="Vikes" />;
    } else if (secondsElapsed <= 0) {
      startMatch();
      return 0;
    }
    return secondsElapsed;
  }

  render() {
    const { started, timeElapsed } = this.props;
    return (
      <ClockBase
        updateTime={this.updateTime}
        isTimeNull={!started && !timeElapsed}
        className="countdown"
        fontSizeMin="2rem"
        fontSizeMax="8rem"
      />
    );
  }
}

const stateToProps = ({ match: { started, timeElapsed } }) => ({
  started,
  timeElapsed,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      startMatch: matchActions.startMatch,
      buzz: matchActions.buzz,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(Clock);
