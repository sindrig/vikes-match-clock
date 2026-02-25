import "../api/clientConfig";
import { getWeatherEndpointV3WeatherGet } from "../api/client";

export const getTemp = async () => {
  try {
    const result = await getWeatherEndpointV3WeatherGet({
      query: { lat: "64.1285", lon: "-21.8681" },
    });
    const temp = result.data?.temp;
    const temperature = Math.ceil(temp ?? NaN);
    if (!Number.isNaN(temperature)) {
      return temperature;
    }
    console.log("Received strange temperature:", temp);
    return null;
  } catch (error) {
    console.error("Failed to fetch weather:", error);
    return null;
  }
};

export default getTemp;
