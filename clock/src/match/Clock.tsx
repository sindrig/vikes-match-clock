import { Component } from "react";
import type React from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";

import matchActions from "../actions/match";

import { formatTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { RootState } from "../types";

interface OwnProps {
  className: string;
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
}: RootState) => ({
  started,
  countdown,
  timeElapsed,
  matchType,
  showInjuryTime,
  halfStop: halfStops[0],
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      pauseMatch: matchActions.pauseMatch,
      buzz: matchActions.buzz,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type ClockProps = ConnectedProps<typeof connector> & OwnProps;

class Clock extends Component<ClockProps> {
  constructor(props: ClockProps) {
    super(props);
    this.updateTime = this.updateTime.bind(this);
  }

  updateTime(): string {
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
      : Math.min(minutesElapsed, halfStop ?? 0);
    let seconds;
    if (!showInjuryTime && halfStop && minutes >= halfStop && started) {
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

  render(): React.JSX.Element {
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

export default connector(Clock);
