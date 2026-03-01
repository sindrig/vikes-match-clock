from fastapi import APIRouter, Depends, Path, Query

from app.dependencies import get_ksi_client
from app.models.matches import LineupsResponse, Match, MatchEvent
from app.services.ksi import KsiClient

router = APIRouter(tags=["matches"])


@router.get(
    "/{teamId}/matches/{date}",
    response_model=list[Match],
    operation_id="get_matches",
)
async def get_matches(
    date: str = Path(),
    utc_offset: int = Query(default=0, alias="utcOffset"),
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    date_formatted = date.replace("-", "")
    return await ksi_client.get_matches(date_formatted, utc_offset)


@router.get(
    "/{teamId}/matches/{matchId}/lineups",
    response_model=LineupsResponse,
    operation_id="get_lineups",
)
async def get_lineups(
    match_id: int = Path(alias="matchId"),
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    return await ksi_client.get_lineups(match_id)


@router.get(
    "/{teamId}/matches/{matchId}/events",
    response_model=list[MatchEvent],
    operation_id="get_events",
)
async def get_events(
    match_id: int = Path(alias="matchId"),
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    return await ksi_client.get_events(match_id)


@router.get(
    "/{teamId}/matches/{matchId}/info",
    response_model=Match,
    operation_id="get_match_info",
)
async def get_match_info(
    match_id: int = Path(alias="matchId"),
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    return await ksi_client.get_match_info(match_id)
