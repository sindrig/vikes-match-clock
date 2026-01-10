import { Component } from "react";
import type React from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";

import matchActions from "../actions/match";

import { formatMillisAsTime } from "../utils/timeUtils";
import ClockBase from "./ClockBase";
import { TIMEOUT_LENGTH } from "../constants";
import { RootState } from "../types";

interface OwnProps {
  className: string;
}

interface TimeoutClockState {
  warningPlayed: boolean;
}

const stateToProps = ({ match: { timeout } }: RootState) => ({
  timeout,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      removeTimeout: matchActions.removeTimeout,
      buzz: matchActions.buzz,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type TimeoutClockProps = ConnectedProps<typeof connector> & OwnProps;

class TimeoutClock extends Component<TimeoutClockProps, TimeoutClockState> {
  constructor(props: TimeoutClockProps) {
    super(props);
    this.state = {
      warningPlayed: false,
    };
  }

  updateTime = (): string | null => {
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
  };

  render(): React.JSX.Element {
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

export default connector(TimeoutClock);
