import logging

import httpx
from xml.dom import minidom

from app.models.weather import WeatherResponse

logger = logging.getLogger(__name__)


async def get_weather(lat: float, lon: float, api_key: str) -> WeatherResponse:
    try:
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
    except Exception:
        logger.exception("OpenWeatherMap failed, falling back to vedur.is")

    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(
            "https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=1472"
        )
        r.raise_for_status()
        dom = minidom.parseString(r.text)
        temp_elem = dom.getElementsByTagName("T")[0]
        temp = float(temp_elem.firstChild.data.replace(",", "."))  # type: ignore[union-attr]
        return WeatherResponse(
            temp=temp,
            service="vedur.is",
            main={"temp_max": f"{temp:.1f}"},
        )
