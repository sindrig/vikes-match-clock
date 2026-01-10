import { Component } from "react";
import type React from "react";

import { formatMillisAsTime } from "../utils/timeUtils";

interface ClockBaseProps {
  updateTime: () => string | null;
  isTimeNull?: boolean;
  zeroTime?: number;
  className?: string;
  fontSizeMin?: string;
  fontSizeMax?: string;
}

interface ClockBaseState {
  time: string | null;
}

export default class Clock extends Component<ClockBaseProps, ClockBaseState> {
  static defaultProps = {
    isTimeNull: false,
    zeroTime: 0,
    className: "",
    fontSizeMin: "1.7rem",
    fontSizeMax: "1.85rem",
  };

  interval: NodeJS.Timeout | null = null;

  constructor(props: ClockBaseProps) {
    super(props);
    this.state = {
      time: null,
    };
  }

  componentDidMount(): void {
    this.updateTime();
    this.interval = setInterval(this.updateTime, 100);
  }

  componentWillUnmount(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  static getDerivedStateFromProps({
    isTimeNull,
  }: ClockBaseProps): ClockBaseState | null {
    if (isTimeNull) {
      return { time: null };
    }
    return null;
  }

  updateTime = (): void => {
    const { updateTime } = this.props;
    const time = updateTime();
    if (time !== null) {
      this.setState({ time });
    }
  };

  render(): React.JSX.Element {
    const { isTimeNull, zeroTime, className, fontSizeMax, fontSizeMin } =
      this.props;
    const { time } = this.state;
    const displayedTime =
      (!isTimeNull && time) || formatMillisAsTime(zeroTime || 0);
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
