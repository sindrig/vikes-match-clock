"""KSI/Analyticom API client service."""


class KSIClient:
    """Client for KSI/Analyticom API."""

    def __init__(self, api_key: str):
        """Initialize KSI client."""
        self.api_key = api_key

    async def get_matches(self):
        """Fetch matches from KSI."""
        pass
