import { Component } from "react";
import type React from "react";
import { connect, ConnectedProps } from "react-redux";
import Clock from "react-live-clock";
import clubLogos from "../images/clubLogos";
import AdImage from "../utils/AdImage";
import { getTemp } from "../lib/weather";
import husasmidjan from "../images/husa.png";
import { IMAGE_TYPES } from "../controller/media";
import { RootState } from "../types";

import "./Idle.css";

const fetchTempInterval = 5 * 60 * 1000;

// Change this to true to use real temp
const useRealTemperature = true;

interface IdleState {
  temperature: number;
}

const stateToProps = ({ match, view: { vp, idleImage } }: RootState) => ({
  match,
  vp,
  idleImage,
});

const connector = connect(stateToProps);

type IdleProps = ConnectedProps<typeof connector>;

class Idle extends Component<IdleProps, IdleState> {
  interval: NodeJS.Timeout | null = null;

  constructor(props: IdleProps) {
    super(props);
    this.updateTemp = this.updateTemp.bind(this);
    this.state = {
      temperature: 17,
    };
  }

  componentDidMount(): void {
    this.updateTemp();
    this.interval = setInterval(this.updateTemp, fetchTempInterval);
  }

  componentWillUnmount(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  updateTemp(): void {
    if (!useRealTemperature) {
      return;
    }
    getTemp().then((temperature) => {
      if (temperature) {
        this.setState({ temperature });
      }
    });
  }

  render(): React.JSX.Element {
    const { vp, idleImage } = this.props;
    const { temperature } = this.state;
    return (
      <div className={`idle idle-${vp.key}`}>
        <AdImage
          imageType={IMAGE_TYPES.largeAds}
          blankBetweenImages={idleImage !== "null"}
          time={8}
        />
        <img
          src={
            (idleImage && (clubLogos as Record<string, string>)[idleImage]) ||
            clubLogos["Víkingur R"]
          }
          alt="Vikes"
          className="idle-vikes"
        />
        <img src={husasmidjan} alt="Vikes" className="idle-ad" />
        <div className="idle-text-container">
          <div className="idle-text-box idle-clock">
            <Clock format="HH:mm" className="idle-clock" ticking />
          </div>
          <div className="idle-text-box idle-temp">
            <span className="idle-temperature">
              {useRealTemperature ? `${temperature}°` : "17°"}
            </span>
          </div>
        </div>
      </div>
    );
  }
}

export default connector(Idle);
