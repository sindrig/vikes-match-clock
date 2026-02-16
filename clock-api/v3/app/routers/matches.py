"""Matches API router."""

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
    """Get matches for a team on a specific date."""
    # Convert YYYY-MM-DD to yyyyMMdd
    date_formatted = date.replace("-", "")

    # Get API key for this team
    api_key = get_ksi_api_key(team_id)

    # Fetch from Analyticom
    matches = await ksi_client.get_matches(date_formatted, utc_offset, team_id, api_key)
    return matches


@router.get(
    "/{team_id}/matches/{match_id}/lineups",
    response_model=LineupsResponse,
)
async def get_lineups(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    """Get lineups for a match."""
    api_key = get_ksi_api_key(team_id)
    lineups = await ksi_client.get_lineups(match_id, api_key)
    return lineups


@router.get(
    "/{team_id}/matches/{match_id}/events",
    response_model=list[MatchEvent],
)
async def get_events(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    """Get events for a match."""
    api_key = get_ksi_api_key(team_id)
    events = await ksi_client.get_events(match_id, api_key)
    return events


@router.get("/{team_id}/matches/{match_id}/info", response_model=Match)
async def get_match_info(
    team_id: int,
    match_id: int,
    ksi_client: KsiClient = Depends(get_ksi_client),
):
    """Get detailed info for a match."""
    api_key = get_ksi_api_key(team_id)
    match = await ksi_client.get_match_info(match_id, api_key)
    return match
