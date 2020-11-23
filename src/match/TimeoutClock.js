import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import matchActions from "../actions/match";

import { formatMillisAsTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { TIMEOUT_LENGTH } from "../constants";

class TimeoutClock extends Component {
  static propTypes = {
    timeout: PropTypes.number,
    removeTimeout: PropTypes.func.isRequired,
    buzz: PropTypes.func.isRequired,
    className: PropTypes.string.isRequired,
  };

  static defaultProps = {
    timeout: null,
  };

  constructor(props) {
    super(props);
    this.updateTime = this.updateTime.bind(this);
    this.state = {
      warningPlayed: false,
    };
  }

  updateTime() {
    const { timeout, removeTimeout, buzz } = this.props;
    if (!timeout) {
      return null;
    }
    const { warningPlayed } = this.state;
    const millisLeft = TIMEOUT_LENGTH - (Date.now() - timeout) + 1000;
    if (millisLeft <= 0) {
      buzz();
      // Allow us to update time first so we don't try state update on
      // unmounted clock.
      setTimeout(removeTimeout, 10);
    } else if (!warningPlayed && millisLeft <= 10000) {
      this.setState({ warningPlayed: true });
      buzz();
    }
    return formatMillisAsTime(millisLeft);
  }

  render() {
    const { className } = this.props;
    return (
      <ClockBase
        updateTime={this.updateTime}
        isTimeNull={false}
        className={className}
        zeroTime={TIMEOUT_LENGTH}
        fontSizeMin="1.3rem"
        fontSizeMax="1.5rem"
      />
    );
  }
}

const stateToProps = ({ match: { timeout } }) => ({
  timeout,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      removeTimeout: matchActions.removeTimeout,
      buzz: matchActions.buzz,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(TimeoutClock);
