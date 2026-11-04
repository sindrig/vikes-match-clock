import httpx
from fastapi import HTTPException

from app.models.matches import (
    LineupsResponse,
    Match,
    MatchEvent,
    Person,
    TeamLineup,
    TeamPlayer,
)


class KsiClient:
    def __init__(self, api_key: str, team_id: int):
        self.base_url = "https://api-ksi.analyticom.de"
        self.api_key = api_key
        self.team_id = team_id
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=10.0)
        self.past_matches: list[Match] | None = None

    def _check_response(self, response: httpx.Response) -> None:
        if response.is_success:
            return
        raise HTTPException(
            status_code=502,
            detail=f"Upstream API responded with {response.status_code}",
        )

    async def get_matches(self, date: str, utc_offset: int) -> list[Match]:
        response = await self._get(
            f"/api/live/matchList/{date}/{utc_offset}",
        )
        return [Match.model_validate(m) for m in response.json()]

    async def get_lineups(self, match_id: int) -> LineupsResponse:
        response = await self._get(f"/api/live/match/{match_id}/lineups")
        return LineupsResponse.model_validate(response.json())

    async def get_events(self, match_id: int) -> list[MatchEvent]:
        response = await self._get(f"/api/live/match/{match_id}/events")
        return [MatchEvent.model_validate(e) for e in response.json()]

    async def get_match_info(self, match_id: int) -> Match:
        response = await self._get(f"/api/live/match/{match_id}")
        return Match.model_validate(response.json())

    async def get_past_matches(self) -> list[Match]:
        if self.past_matches is not None:
            return self.past_matches
        response = await self._get(
            f"/api/live/team/{self.team_id}/matches/paginated/past/0",
            params={"page": 1, "pageSize": 10},
        )
        data = response.json()
        matches = data.get("result", []) if isinstance(data, dict) else data
        self.past_matches = sorted(
            [Match.model_validate(m) for m in matches],
            key=lambda m: m.dateTimeUTC,
            reverse=True,
        )
        return self.past_matches

    async def resolve_roster(
        self, starters: list[int], substitutes: list[int]
    ) -> TeamLineup:
        matches = await self.get_past_matches()
        unresolved = set(starters) | set(substitutes)
        seen: dict[int, TeamPlayer] = {}
        for match in matches:
            if self.team_id not in (match.homeTeam.id, match.awayTeam.id):
                continue
            lineups = await self.get_lineups(match.id)
            if match.homeTeam.id == self.team_id:
                team_lineup = lineups.home
            else:
                team_lineup = lineups.away
            for player in team_lineup.players:
                num = player.shirtNumber
                if num is not None and num in unresolved:
                    seen[num] = player
                    unresolved.remove(num)
            if not unresolved:
                break

        goalkeeper = starters[0]
        ordered_numbers = [
            goalkeeper,
            *sorted(starters[1:]),
            *sorted(substitutes),
        ]
        players: list[TeamPlayer] = []
        for number in ordered_numbers:
            starting = number in starters
            if number in seen:
                found = seen[number]
                players.append(
                    TeamPlayer(
                        shirtNumber=number,
                        captain=found.captain,
                        goalkeeper=found.goalkeeper,
                        startingLineup=starting,
                        person=found.person,
                    )
                )
            else:
                players.append(
                    TeamPlayer(
                        shirtNumber=number,
                        captain=False,
                        goalkeeper=False,
                        startingLineup=starting,
                        person=Person(id=0, name=f"#{number}"),
                    )
                )
        return TeamLineup(players=players, officials=[])

    async def _get(
        self, path: str, params: dict[str, int] | None = None
    ) -> httpx.Response:
        try:
            response = await self.client.get(
                path,
                headers={"API_KEY": self.api_key},
                params={"teamIdFilter": self.team_id, **(params or {})},
            )
        except httpx.TimeoutException as error:
            raise HTTPException(
                status_code=504, detail="KSI request timed out"
            ) from error
        except httpx.RequestError as error:
            raise HTTPException(
                status_code=502, detail="Upstream API request failed"
            ) from error
        self._check_response(response)
        return response

    async def close(self) -> None:
        await self.client.aclose()
