import React, { Component } from "react";
import PropTypes from "prop-types";

import { formatMillisAsTime } from "../utils/timeUtils";

export default class Clock extends Component {
  static propTypes = {
    updateTime: PropTypes.func.isRequired,
    isTimeNull: PropTypes.bool,
    zeroTime: PropTypes.number,
    className: PropTypes.string,
    fontSizeMin: PropTypes.string,
    fontSizeMax: PropTypes.string,
  };

  static defaultProps = {
    isTimeNull: false,
    zeroTime: 0,
    className: "",
    fontSizeMin: "1.7rem",
    fontSizeMax: "1.85rem",
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

  static getDerivedStateFromProps({ isTimeNull }) {
    if (isTimeNull) {
      return { time: null };
    }
    return null;
  }

  updateTime() {
    const { updateTime } = this.props;
    const time = updateTime();
    if (time !== null) {
      this.setState({ time });
    }
  }

  render() {
    const {
      isTimeNull,
      zeroTime,
      className,
      fontSizeMax,
      fontSizeMin,
    } = this.props;
    const { time } = this.state;
    let displayedTime = formatMillisAsTime(zeroTime);
    if (!isTimeNull) {
      displayedTime = time || displayedTime;
    }
    const style = {
      fontSize: displayedTime.length > 5 ? fontSizeMin : fontSizeMax,
    };
    return (
      <div className={className} style={style}>
        {displayedTime}
      </div>
    );
  }
}
