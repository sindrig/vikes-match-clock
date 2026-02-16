"""Weather service integrating vedur.is and OpenWeatherMap."""

import httpx
from xml.dom import minidom

from app.models.weather import WeatherResponse


async def get_weather(lat: float, lon: float, api_key: str) -> WeatherResponse:
    """Get weather from vedur.is or OpenWeatherMap fallback."""
    # Try vedur.is first (Iceland station 1472)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://xmlweather.vedur.is/"
                "?op_w=xml&type=obs&lang=is&view=xml&ids=1472"
            )
            r.raise_for_status()
            dom = minidom.parseString(r.text)
            temp_elem = dom.getElementsByTagName("T")[0]
            temp = float(temp_elem.firstChild.data)  # type: ignore[union-attr]
            return WeatherResponse(
                temp=temp,
                service="vedur.is",
                main={"temp_max": f"{temp:.1f}"},
            )
    except Exception:
        pass

    # Fallback to OpenWeatherMap
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": lat,
                "lon": lon,
                "appid": api_key,
                "units": "metric",
            },
        )
        r.raise_for_status()
        data = r.json()
        temp = data["main"]["temp"]
        return WeatherResponse(
            temp=temp,
            service="openweathermap",
            main={"temp_max": f"{temp:.1f}"},
        )
