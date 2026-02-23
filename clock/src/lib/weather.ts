import { fetchWeather } from "./api";

export const getTemp = async () => {
  try {
    const { temp } = await fetchWeather();
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
