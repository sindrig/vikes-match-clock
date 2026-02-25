import httpx

from ksi_client.rest_api_comet_live_prod_postgresql_client import Client
from ksi_client.rest_api_comet_live_prod_postgresql_client.api.competition_data_api_for_live_apps import (
    get_lineups,
    get_match_events,
    get_match_info,
    get_match_list,
)

from app.models.matches import LineupsResponse, Match, MatchEvent, TeamLineup


class KsiAdapter:
    def __init__(self, api_key: str, team_id: int):
        self.base_url = "https://api-ksi.analyticom.de"
        self.api_key = api_key
        self.team_id = team_id
        self.client = Client(base_url=self.base_url, timeout=httpx.Timeout(10.0))

    async def get_matches(self, date: str, utc_offset: int) -> list[Match]:
        raw_matches = await get_match_list.asyncio(
            date=date,
            utc_offset=utc_offset,
            client=self.client,
            team_id_filter=self.team_id,
            api_key=self.api_key,
        )
        if not isinstance(raw_matches, list):
            return []
        return [Match.model_validate(m.to_dict()) for m in raw_matches]

    async def get_lineups(self, match_id: int) -> LineupsResponse:
        raw_lineups = await get_lineups.asyncio(
            match_id=match_id,
            client=self.client,
            team_id_filter=self.team_id,
            api_key=self.api_key,
        )
        if raw_lineups is None:
            return LineupsResponse(
                home=TeamLineup(players=[], officials=[]),
                away=TeamLineup(players=[], officials=[]),
            )
        return LineupsResponse.model_validate(raw_lineups.to_dict())

    async def get_events(self, match_id: int) -> list[MatchEvent]:
        raw_events = await get_match_events.asyncio(
            match_id=match_id,
            client=self.client,
            team_id_filter=self.team_id,
            api_key=self.api_key,
        )
        if not isinstance(raw_events, list):
            return []
        return [MatchEvent.model_validate(e.to_dict()) for e in raw_events]

    async def get_match_info(self, match_id: int) -> Match:
        raw_match = await get_match_info.asyncio(
            match_id=match_id,
            client=self.client,
            team_id_filter=self.team_id,
            api_key=self.api_key,
        )
        if raw_match is None:
            raise ValueError(f"Match {match_id} not found")
        return Match.model_validate(raw_match.to_dict())

    async def close(self):
        await self.client.get_async_httpx_client().aclose()
