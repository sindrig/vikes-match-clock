from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_ksi_client
from app.main import app
from app.models.matches import (
    Competition,
    Match,
    MatchEvent,
    MatchEventType,
    Result,
    Team,
)


@pytest.fixture
def mock_ksi_client():
    client = AsyncMock()
    return client


@pytest.fixture
def test_client(mock_ksi_client):
    app.dependency_overrides[get_ksi_client] = lambda: mock_ksi_client

    with patch("app.routers.matches.get_ksi_api_key", return_value="test-key"):
        yield TestClient(app)

    app.dependency_overrides.clear()


@pytest.mark.skip(reason="Placeholder test")
def test_health_check(client):
    pass


class TestGetEvents:
    def test_get_events_returns_event_list(self, test_client, mock_ksi_client):
        mock_ksi_client.get_events.return_value = [
            MatchEvent(
                eventId=1,
                eventType=MatchEventType(id=1, name="GOAL"),
                minute=45,
                displayMinute="45",
            ),
            MatchEvent(
                eventId=2,
                eventType=MatchEventType(id=2, name="YELLOW_CARD"),
                minute=32,
                displayMinute="32",
            ),
        ]

        response = test_client.get("/1/matches/12345/events")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["eventId"] == 1
        assert data[0]["eventType"]["name"] == "GOAL"
        assert data[1]["eventType"]["name"] == "YELLOW_CARD"

    def test_get_events_empty(self, test_client, mock_ksi_client):
        mock_ksi_client.get_events.return_value = []

        response = test_client.get("/1/matches/12345/events")

        assert response.status_code == 200
        assert response.json() == []

    def test_get_events_calls_client_with_correct_args(
        self, test_client, mock_ksi_client
    ):
        mock_ksi_client.get_events.return_value = []

        test_client.get("/42/matches/99999/events")

        mock_ksi_client.get_events.assert_called_once_with(99999, "test-key")


class TestGetMatchInfo:
    def test_get_match_info_returns_match(self, test_client, mock_ksi_client):
        mock_ksi_client.get_match_info.return_value = Match(
            id=12345,
            homeTeam=Team(id=1, name="Víkingur"),
            awayTeam=Team(id=2, name="KR"),
            dateTimeUTC="2025-06-15T14:00:00Z",
            liveStatus="RUNNING",
            currentMinute="45+2",
            competition=Competition(id=1, name="Pepsi Max deildin"),
            homeTeamResult=Result(regular=2),
            awayTeamResult=Result(regular=1),
        )

        response = test_client.get("/1/matches/12345/info")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 12345
        assert data["homeTeam"]["name"] == "Víkingur"
        assert data["awayTeam"]["name"] == "KR"
        assert data["liveStatus"] == "RUNNING"
        assert data["currentMinute"] == "45+2"
        assert data["homeTeamResult"]["regular"] == 2
        assert data["awayTeamResult"]["regular"] == 1

    def test_get_match_info_calls_client_with_correct_args(
        self, test_client, mock_ksi_client
    ):
        mock_ksi_client.get_match_info.return_value = Match(
            id=12345,
            homeTeam=Team(id=1, name="Víkingur"),
            awayTeam=Team(id=2, name="KR"),
            dateTimeUTC="2025-06-15T14:00:00Z",
            liveStatus="SCHEDULED",
            competition=Competition(id=1, name="Test"),
        )

        test_client.get("/42/matches/12345/info")

        mock_ksi_client.get_match_info.assert_called_once_with(
            12345, "test-key"
        )
