"""KSI/Analyticom API client service."""

import httpx

from app.models.matches import LineupsResponse, Match, MatchEvent


class KsiClient:
    """Async client for Analyticom KSI API."""

    def __init__(self):
        self.base_url = "https://api-ksi.analyticom.de"
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=10.0)

    async def get_matches(
        self, date: str, utc_offset: int, team_id: int, api_key: str
    ) -> list[Match]:
        """Get matches for date (yyyyMMdd format) filtered by team."""
        response = await self.client.get(
            f"/api/live/matchList/{date}/{utc_offset}",
            headers={"API_KEY": api_key},
            params={"teamIdFilter": team_id},
        )
        response.raise_for_status()
        return [Match.model_validate(m) for m in response.json()]

    async def get_lineups(
        self, match_id: int, api_key: str
    ) -> LineupsResponse:
        """Get lineups for a match."""
        response = await self.client.get(
            f"/api/live/match/{match_id}/lineups",
            headers={"API_KEY": api_key},
        )
        response.raise_for_status()
        return LineupsResponse.model_validate(response.json())

    async def get_events(
        self, match_id: int, api_key: str
    ) -> list[MatchEvent]:
        """Get events for a match."""
        response = await self.client.get(
            f"/api/live/match/{match_id}/events",
            headers={"API_KEY": api_key},
        )
        response.raise_for_status()
        return [MatchEvent.model_validate(e) for e in response.json()]

    async def get_match_info(self, match_id: int, api_key: str) -> Match:
        """Get detailed info for a single match."""
        response = await self.client.get(
            f"/api/live/match/{match_id}",
            headers={"API_KEY": api_key},
        )
        response.raise_for_status()
        return Match.model_validate(response.json())

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
