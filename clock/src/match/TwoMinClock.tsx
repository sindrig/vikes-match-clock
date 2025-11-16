import { Component } from "react";
import type React from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";

import matchActions from "../actions/match";
import { formatMillisAsTime } from "../utils/timeUtils";
import { RootState } from "../types";

interface OwnProps {
  atTimeElapsed: number;
  penaltyLength: number;
  uniqueKey: string;
}

interface TwoMinClockState {
  time: string | null;
}

const stateToProps = ({ match: { started, timeElapsed, matchType } }: RootState) => ({
  started,
  timeElapsed,
  matchType,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      removePenalty: matchActions.removePenalty,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type TwoMinClockProps = ConnectedProps<typeof connector> & OwnProps;

class TwoMinClock extends Component<TwoMinClockProps, TwoMinClockState> {
  interval: NodeJS.Timeout | null = null;

  constructor(props: TwoMinClockProps) {
    super(props);
    this.state = {
      time: null,
    };
    this.updateTime = this.updateTime.bind(this);
  }

  componentDidMount(): void {
    this.interval = setInterval(this.updateTime, 100);
  }

  componentWillUnmount(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  static getDerivedStateFromProps({ started, timeElapsed }: TwoMinClockProps): TwoMinClockState | null {
    if (!started && !timeElapsed) {
      return { time: null };
    }
    return null;
  }

  updateTime(): null {
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

  render(): React.JSX.Element {
    const { penaltyLength } = this.props;
    const { time } = this.state;
    const displayedTime = time || formatMillisAsTime(penaltyLength);
    return <div className="penalty">{displayedTime}</div>;
  }
}

export default connector(TwoMinClock);
