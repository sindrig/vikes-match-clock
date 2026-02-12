import { useState, useEffect } from "react";
import Clock from "../components/LiveClock";
import clubLogos from "../images/clubLogos";
import AdImage from "../utils/AdImage";
import { getTemp } from "../lib/weather";
import husasmidjan from "../images/husa.png";
import { IMAGE_TYPES } from "../controller/media";
import { useView } from "../contexts/FirebaseStateContext";

import "./Idle.css";

const fetchTempInterval = 5 * 60 * 1000;

// Change this to true to use real temp
const useRealTemperature = true;

const Idle = () => {
  const [temperature, setTemperature] = useState(17);
  const {
    view: { vp, idleImage },
  } = useView();

  useEffect(() => {
    const updateTemp = () => {
      if (!useRealTemperature) {
        return;
      }
      void getTemp().then((temp) => {
        if (temp) {
          setTemperature(temp);
        }
      });
    };

    updateTemp();
    const interval = setInterval(updateTemp, fetchTempInterval);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={`idle idle-${String(vp.key)}`}>
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
            {useRealTemperature ? `${String(temperature)}°` : "17°"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Idle;
