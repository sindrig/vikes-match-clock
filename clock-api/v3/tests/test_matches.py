import httpx
import pytest
import respx
from httpx import Response

from app.main import app
from app.models.matches import LineupsResponse, Match
from app.services.adapter import KsiAdapter

BASE_URL = "https://api-ksi.analyticom.de"


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_success(ksi_client):
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

    matches = await ksi_client.get_matches("20250615", 0)

    assert len(matches) == 1
    assert matches[0].id == 12345
    assert matches[0].homeTeam.name == "Víkingur"
    assert matches[0].awayTeam.name == "KR"
    assert matches[0].liveStatus == "SCHEDULED"
    assert matches[0].competition.name == "Pepsi Max deildin"


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_empty_current_match_phase(ksi_client):
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(
            200,
            json=[
                {
                    "id": 12345,
                    "homeTeam": {"id": 1, "name": "Víkingur"},
                    "awayTeam": {"id": 2, "name": "KR"},
                    "dateTimeUTC": "2025-06-15T14:00:00Z",
                    "liveStatus": "PLAYED",
                    "currentMatchPhase": {},
                    "competition": {
                        "id": 1,
                        "name": "Pepsi Max deildin",
                    },
                }
            ],
        )
    )

    matches = await ksi_client.get_matches("20250615", 0)

    assert len(matches) == 1
    assert matches[0].currentMatchPhase is None


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_empty(ksi_client):
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(200, json=[])
    )

    matches = await ksi_client.get_matches("20250615", 0)

    assert matches == []


@pytest.mark.asyncio
@respx.mock
async def test_get_lineups_success(ksi_client):
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

    lineups = await ksi_client.get_lineups(12345)

    assert isinstance(lineups, LineupsResponse)
    assert len(lineups.home.players) == 1
    assert lineups.home.players[0].shirtNumber == 10
    assert lineups.home.players[0].captain is True
    assert lineups.home.players[0].person.name == "Player One"
    assert lineups.away.players == []


@pytest.mark.asyncio
@respx.mock
async def test_get_lineups_flat_api_response(ksi_client):
    respx.get(f"{BASE_URL}/api/live/match/12345/lineups").mock(
        return_value=Response(
            200,
            json={
                "home": {
                    "players": [
                        {
                            "roleId": 100,
                            "personId": 42,
                            "name": "Goalkeeper One",
                            "shortName": "GK One",
                            "shirtNumber": 1,
                            "starting": True,
                            "captain": False,
                            "position": "G",
                            "orderNumber": 1,
                        },
                        {
                            "roleId": 101,
                            "personId": 43,
                            "name": "Outfield Player",
                            "shortName": "Outfield P.",
                            "shirtNumber": 10,
                            "starting": True,
                            "captain": True,
                            "orderNumber": 2,
                        },
                        {
                            "roleId": 102,
                            "personId": 44,
                            "name": "Sub Player",
                            "shortName": "Sub P.",
                            "shirtNumber": 15,
                            "starting": False,
                            "captain": False,
                            "orderNumber": 3,
                        },
                    ],
                    "officials": [
                        {
                            "roleId": 200,
                            "personId": 99,
                            "name": "Head Coach",
                            "shortName": "Coach",
                            "role": "Head Coach",
                            "orderNumber": 1,
                        }
                    ],
                },
                "away": {"players": [], "officials": []},
            },
        )
    )

    lineups = await ksi_client.get_lineups(12345)

    assert len(lineups.home.players) == 3

    gk = lineups.home.players[0]
    assert gk.person.id == 42
    assert gk.person.name == "Goalkeeper One"
    assert gk.goalkeeper is True
    assert gk.startingLineup is True
    assert gk.shirtNumber == 1

    captain = lineups.home.players[1]
    assert captain.person.id == 43
    assert captain.captain is True
    assert captain.goalkeeper is False
    assert captain.startingLineup is True

    sub = lineups.home.players[2]
    assert sub.person.id == 44
    assert sub.startingLineup is False

    official = lineups.home.officials[0]
    assert official.person.id == 99
    assert official.person.name == "Head Coach"
    assert official.role == "Head Coach"


@pytest.mark.asyncio
@respx.mock
async def test_get_events_success(ksi_client):
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

    events = await ksi_client.get_events(12345)

    assert len(events) == 2
    assert events[0].eventId == 1
    assert events[0].eventType.name == "GOAL"
    assert events[0].minute == 45
    assert events[1].eventType.name == "YELLOW_CARD"


@pytest.mark.asyncio
@respx.mock
async def test_get_match_info_success(ksi_client):
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

    match = await ksi_client.get_match_info(12345)

    assert isinstance(match, Match)
    assert match.id == 12345
    assert match.currentMinute == "45+2"
    assert match.liveStatus == "RUNNING"
    assert match.homeTeamResult.regular == 2
    assert match.awayTeamResult.regular == 1


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_http_error(ksi_client):
    respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(500, text="Internal Server Error")
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await ksi_client.get_matches("20250615", 0)

    assert exc_info.value.response.status_code == 500


@pytest.mark.asyncio
@respx.mock
async def test_get_match_info_not_found(ksi_client):
    respx.get(f"{BASE_URL}/api/live/match/99999").mock(
        return_value=Response(404, text="Not Found")
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await ksi_client.get_match_info(99999)

    assert exc_info.value.response.status_code == 404


@pytest.mark.asyncio
@respx.mock
async def test_get_matches_sends_api_key_header():
    client = KsiAdapter(api_key="my-secret-key", team_id=1)
    route = respx.get(f"{BASE_URL}/api/live/matchList/20250615/0").mock(
        return_value=Response(200, json=[])
    )

    await client.get_matches("20250615", 0)
    await client.close()

    assert route.called
    request = route.calls[0].request
    assert request.headers["API_KEY"] == "my-secret-key"


MOCK_MATCH_DATA = [
    {
        "id": 12345,
        "homeTeam": {"id": 1, "name": "Víkingur"},
        "awayTeam": {"id": 2, "name": "KR"},
        "dateTimeUTC": "2025-06-15T14:00:00Z",
        "liveStatus": "SCHEDULED",
        "competition": {"id": 1, "name": "Pepsi Max deildin"},
    }
]


def test_endpoint_get_matches_date_success(client):
    from unittest.mock import AsyncMock

    from app.dependencies import get_ksi_client
    from app.models.matches import Match

    mock_matches = [Match.model_validate(m) for m in MOCK_MATCH_DATA]

    mock_client = AsyncMock()
    mock_client.get_matches.return_value = mock_matches

    app.dependency_overrides[get_ksi_client] = lambda team_id: mock_client

    response = client.get("/v3/1/matches/2025-06-15")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 12345
    assert data[0]["homeTeam"]["name"] == "Víkingur"
    assert data[0]["awayTeam"]["name"] == "KR"
    assert data[0]["liveStatus"] == "SCHEDULED"

    mock_client.get_matches.assert_called_once_with("20250615", 0)

    app.dependency_overrides.clear()


def test_endpoint_get_matches_date_with_utc_offset(client):
    from unittest.mock import AsyncMock

    from app.dependencies import get_ksi_client

    mock_client = AsyncMock()
    mock_client.get_matches.return_value = []

    app.dependency_overrides[get_ksi_client] = lambda team_id: mock_client

    response = client.get("/v3/1/matches/2025-06-15?utc_offset=-3")

    assert response.status_code == 200
    assert response.json() == []

    mock_client.get_matches.assert_called_once_with("20250615", -3)

    app.dependency_overrides.clear()


def test_endpoint_get_matches_date_empty(client):
    from unittest.mock import AsyncMock

    from app.dependencies import get_ksi_client

    mock_client = AsyncMock()
    mock_client.get_matches.return_value = []

    app.dependency_overrides[get_ksi_client] = lambda team_id: mock_client

    response = client.get("/v3/99/matches/2025-01-01")

    assert response.status_code == 200
    assert response.json() == []

    app.dependency_overrides.clear()


def test_endpoint_get_lineups_success(client):
    from unittest.mock import AsyncMock

    from app.dependencies import get_ksi_client
    from app.models.matches import (
        LineupsResponse,
        MatchAndTeamOfficial,
        Person,
        TeamLineup,
        TeamPlayer,
    )

    mock_lineups = LineupsResponse(
        home=TeamLineup(
            players=[
                TeamPlayer(
                    shirtNumber=10,
                    captain=True,
                    goalkeeper=False,
                    startingLineup=True,
                    person=Person(id=1, name="Player One"),
                ),
                TeamPlayer(
                    shirtNumber=1,
                    captain=False,
                    goalkeeper=True,
                    startingLineup=True,
                    person=Person(id=2, name="Goalkeeper"),
                ),
            ],
            officials=[
                MatchAndTeamOfficial(
                    person=Person(id=100, name="Coach One"),
                    role="Head Coach",
                ),
            ],
        ),
        away=TeamLineup(
            players=[
                TeamPlayer(
                    shirtNumber=9,
                    captain=True,
                    goalkeeper=False,
                    startingLineup=True,
                    person=Person(id=3, name="Away Captain"),
                ),
            ],
            officials=[],
        ),
    )

    mock_client = AsyncMock()
    mock_client.get_lineups.return_value = mock_lineups

    app.dependency_overrides[get_ksi_client] = lambda team_id: mock_client

    response = client.get("/v3/1/matches/12345/lineups")

    assert response.status_code == 200
    data = response.json()

    assert len(data["home"]["players"]) == 2
    assert data["home"]["players"][0]["shirtNumber"] == 10
    assert data["home"]["players"][0]["captain"] is True
    assert data["home"]["players"][0]["person"]["name"] == "Player One"
    assert data["home"]["players"][1]["goalkeeper"] is True

    assert len(data["home"]["officials"]) == 1
    assert data["home"]["officials"][0]["person"]["name"] == "Coach One"
    assert data["home"]["officials"][0]["role"] == "Head Coach"

    assert len(data["away"]["players"]) == 1
    assert data["away"]["players"][0]["shirtNumber"] == 9
    assert data["away"]["players"][0]["captain"] is True
    assert data["away"]["officials"] == []

    mock_client.get_lineups.assert_called_once_with(12345)

    app.dependency_overrides.clear()


def test_endpoint_get_lineups_empty_lineups(client):
    from unittest.mock import AsyncMock

    from app.dependencies import get_ksi_client
    from app.models.matches import LineupsResponse, TeamLineup

    mock_lineups = LineupsResponse(
        home=TeamLineup(players=[], officials=[]),
        away=TeamLineup(players=[], officials=[]),
    )

    mock_client = AsyncMock()
    mock_client.get_lineups.return_value = mock_lineups

    app.dependency_overrides[get_ksi_client] = lambda team_id: mock_client

    response = client.get("/v3/1/matches/99999/lineups")

    assert response.status_code == 200
    data = response.json()
    assert data["home"]["players"] == []
    assert data["home"]["officials"] == []
    assert data["away"]["players"] == []
    assert data["away"]["officials"] == []

    app.dependency_overrides.clear()


def test_endpoint_get_lineups_in_openapi():
    from app.main import app

    schema = app.openapi()
    paths = schema["paths"]

    lineups_path = "/v3/{team_id}/matches/{match_id}/lineups"
    assert lineups_path in paths
    assert "get" in paths[lineups_path]

    get_op = paths[lineups_path]["get"]
    resp_200 = get_op["responses"]["200"]
    content = resp_200["content"]["application/json"]["schema"]
    assert "LineupsResponse" in content.get("$ref", "")


def test_endpoint_get_matches_date_in_openapi():
    from app.main import app

    schema = app.openapi()
    paths = schema["paths"]
    assert any("/matches/" in p for p in paths)
