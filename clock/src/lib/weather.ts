import axios from "axios";
import apiConfig from "../apiConfig";

interface WeatherResponse {
  temp?: number;
}

export const getTemp = () =>
  axios
    .get<WeatherResponse>(`${apiConfig.gateWayUrl}currentWeather`)
    .then(({ data }) => {
      const temperature = Math.ceil(data?.temp ?? NaN);
      if (!Number.isNaN(temperature)) {
        return temperature;
      }
      console.log("Received strange temperature:", data);
      return null;
    });

export default getTemp;
