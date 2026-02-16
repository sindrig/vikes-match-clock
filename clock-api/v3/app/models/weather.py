"""Pydantic models for weather data."""

from pydantic import BaseModel


class WeatherResponse(BaseModel):
    """Weather response with temperature and service info."""

    temp: float
    service: str
    main: dict  # Legacy compat: {"temp_max": "formatted_temp"}
