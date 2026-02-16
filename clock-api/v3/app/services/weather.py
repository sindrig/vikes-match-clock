"""Weather service integrating vedur.is and OpenWeatherMap."""


class WeatherService:
    """Service for weather data from multiple sources."""

    def __init__(self, api_key: str):
        """Initialize weather service."""
        self.api_key = api_key

    async def get_forecast(self):
        """Get weather forecast."""
        pass
