from fastapi import APIRouter, Depends

from app.dependencies import get_ksi_api_key, get_ksi_client
from app.models.matches import LineupsResponse, Match, MatchEvent
from app.services.ksi import KsiClient

router = APIRouter(tags=["matches"])


@router.get("/{team_id}/matches/{date}", response_model=list[Match])
async def get_matches(
    team_id: int,
    date: str,
    utc_offset: int = 0,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    date_formatted = date.replace("-", "")
    api_key = get_ksi_api_key(team_id)
    return await ksi_client.get_matches(
        date_formatted, utc_offset, team_id, api_key
    )


@router.get(
    "/{team_id}/matches/{match_id}/lineups",
    response_model=LineupsResponse,
)
async def get_lineups(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    api_key = get_ksi_api_key(team_id)
    return await ksi_client.get_lineups(match_id, api_key)


@router.get(
    "/{team_id}/matches/{match_id}/events",
    response_model=list[MatchEvent],
)
async def get_events(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    api_key = get_ksi_api_key(team_id)
    return await ksi_client.get_events(match_id, api_key)


@router.get("/{team_id}/matches/{match_id}/info", response_model=Match)
async def get_match_info(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    api_key = get_ksi_api_key(team_id)
    return await ksi_client.get_match_info(match_id, api_key)
