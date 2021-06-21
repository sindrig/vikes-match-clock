import axios from "axios";
import apiConfig from "../apiConfig";

export const getTemp = () =>
  axios.get(`${apiConfig.gateWayUrl}currentWeather`).then(({ data }) => {
    const temperature = Math.ceil(parseFloat(data?.main?.temp_max));
    if (!Number.isNaN(temperature)) {
      return temperature;
    }
    console.log("Received strange temperature:", data);
    return null;
  });

export default getTemp;
