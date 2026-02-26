import httpx

from app.models.matches import LineupsResponse, Match, MatchEvent


class KsiClient:
    def __init__(self, api_key: str, team_id: int):
        self.base_url = "https://api-ksi.analyticom.de"
        self.api_key = api_key
        self.team_id = team_id
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=10.0)

    async def get_matches(self, date: str, utc_offset: int) -> list[Match]:
        response = await self.client.get(
            f"/api/live/matchList/{date}/{utc_offset}",
            headers={"API_KEY": self.api_key},
            params={"teamIdFilter": self.team_id},
        )
        response.raise_for_status()
        return [Match.model_validate(m) for m in response.json()]

    async def get_lineups(self, match_id: int) -> LineupsResponse:
        response = await self.client.get(
            f"/api/live/match/{match_id}/lineups",
            headers={"API_KEY": self.api_key},
            params={"teamIdFilter": self.team_id},
        )
        response.raise_for_status()
        return LineupsResponse.model_validate(response.json())

    async def get_events(self, match_id: int) -> list[MatchEvent]:
        response = await self.client.get(
            f"/api/live/match/{match_id}/events",
            headers={"API_KEY": self.api_key},
            params={"teamIdFilter": self.team_id},
        )
        response.raise_for_status()
        return [MatchEvent.model_validate(e) for e in response.json()]

    async def get_match_info(self, match_id: int) -> Match:
        response = await self.client.get(
            f"/api/live/match/{match_id}",
            headers={"API_KEY": self.api_key},
            params={"teamIdFilter": self.team_id},
        )
        response.raise_for_status()
        return Match.model_validate(response.json())

    async def close(self):
        await self.client.aclose()
