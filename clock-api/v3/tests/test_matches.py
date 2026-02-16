"""Tests for the KSI API client."""

import httpx
import pytest
import respx
from httpx import Response

from app.models.matches import LineupsResponse, Match

BASE_URL = "https://api-ksi.analyticom.de"


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_success(ksi_client):
    """Test get_matches returns parsed Match objects."""
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(
            200,
            json=[
                {
                    "id": 12345,
                    "homeTeam": {"id": 1, "name": "Víkingur"},
                    "awayTeam": {"id": 2, "name": "KR"},
                    "dateTimeUTC": "2025-06-15T14:00:00Z",
                    "liveStatus": "SCHEDULED",
                    "competition": {
                        "id": 1,
                        "name": "Pepsi Max deildin",
                    },
                }
            ],
        )
    )

    matches = await ksi_client.get_matches("20250615", 0, 1, "test-key")

    assert len(matches) == 1
    assert matches[0].id == 12345
    assert matches[0].homeTeam.name == "Víkingur"
    assert matches[0].awayTeam.name == "KR"
    assert matches[0].liveStatus == "SCHEDULED"
    assert matches[0].competition.name == "Pepsi Max deildin"


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_empty(ksi_client):
    """Test get_matches returns empty list when no matches."""
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(200, json=[])
    )

    matches = await ksi_client.get_matches("20250615", 0, 1, "test-key")

    assert matches == []


@pytest.mark.asyncio
@respx.mock
async def test_get_lineups_success(ksi_client):
    """Test get_lineups returns parsed LineupsResponse."""
    respx.get(f"{BASE_URL}/api/live/match/12345/lineups").mock(
        return_value=Response(
            200,
            json={
                "home": {
                    "players": [
                        {
                            "shirtNumber": 10,
                            "captain": True,
                            "goalkeeper": False,
                            "startingLineup": True,
                            "person": {
                                "id": 1,
                                "name": "Player One",
                            },
                        }
                    ],
                    "officials": [],
                },
                "away": {"players": [], "officials": []},
            },
        )
    )

    lineups = await ksi_client.get_lineups(12345, "test-key")

    assert isinstance(lineups, LineupsResponse)
    assert len(lineups.home.players) == 1
    assert lineups.home.players[0].shirtNumber == 10
    assert lineups.home.players[0].captain is True
    assert lineups.home.players[0].person.name == "Player One"
    assert lineups.away.players == []


@pytest.mark.asyncio
@respx.mock
async def test_get_events_success(ksi_client):
    """Test get_events returns parsed MatchEvent list."""
    respx.get(f"{BASE_URL}/api/live/match/12345/events").mock(
        return_value=Response(
            200,
            json=[
                {
                    "eventId": 1,
                    "eventType": {"id": 1, "name": "GOAL"},
                    "minute": 45,
                    "displayMinute": "45",
                },
                {
                    "eventId": 2,
                    "eventType": {"id": 2, "name": "YELLOW_CARD"},
                    "minute": 32,
                    "displayMinute": "32",
                },
            ],
        )
    )

    events = await ksi_client.get_events(12345, "test-key")

    assert len(events) == 2
    assert events[0].eventId == 1
    assert events[0].eventType.name == "GOAL"
    assert events[0].minute == 45
    assert events[1].eventType.name == "YELLOW_CARD"


@pytest.mark.asyncio
@respx.mock
async def test_get_match_info_success(ksi_client):
    """Test get_match_info returns single Match."""
    respx.get(f"{BASE_URL}/api/live/match/12345").mock(
        return_value=Response(
            200,
            json={
                "id": 12345,
                "homeTeam": {"id": 1, "name": "Víkingur"},
                "awayTeam": {"id": 2, "name": "KR"},
                "dateTimeUTC": "2025-06-15T14:00:00Z",
                "liveStatus": "RUNNING",
                "currentMinute": "45+2",
                "competition": {
                    "id": 1,
                    "name": "Test League",
                },
                "homeTeamResult": {
                    "regular": 2,
                },
                "awayTeamResult": {
                    "regular": 1,
                },
            },
        )
    )

    match = await ksi_client.get_match_info(12345, "test-key")

    assert isinstance(match, Match)
    assert match.id == 12345
    assert match.currentMinute == "45+2"
    assert match.liveStatus == "RUNNING"
    assert match.homeTeamResult.regular == 2
    assert match.awayTeamResult.regular == 1


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_http_error(ksi_client):
    """Test client raises on HTTP 500 errors."""
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(500, text="Internal Server Error")
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await ksi_client.get_matches("20250615", 0, 1, "test-key")

    assert exc_info.value.response.status_code == 500


@pytest.mark.asyncio
@respx.mock
async def test_get_match_info_not_found(ksi_client):
    """Test client raises on HTTP 404 errors."""
    respx.get(f"{BASE_URL}/api/live/match/99999").mock(
        return_value=Response(404, text="Not Found")
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await ksi_client.get_match_info(99999, "test-key")

    assert exc_info.value.response.status_code == 404


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_sends_api_key_header(ksi_client):
    """Test that API key is sent in the API_KEY header."""
    route = respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(200, json=[])
    )

    await ksi_client.get_matches("20250615", 0, 1, "my-secret-key")

    assert route.called
    request = route.calls[0].request
    assert request.headers["API_KEY"] == "my-secret-key"
