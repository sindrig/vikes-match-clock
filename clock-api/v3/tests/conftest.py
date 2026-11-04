from unittest.mock import patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app import dependencies
from app.main import app
from app.services.ksi import KsiClient


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def ksi_capacity():
    return dependencies.KSI_KEY_LOOKUP_CAPACITY


@pytest_asyncio.fixture
async def app_lifespan(monkeypatch, ksi_capacity):
    monkeypatch.setattr(dependencies, "KSI_KEY_LOOKUP_CAPACITY", ksi_capacity)
    async with app.router.lifespan_context(app):
        yield app.state.ksi_key_lookups


@pytest.fixture
def mock_ssm():
    with patch("app.dependencies.get_ssm_client") as factory:
        mock = factory.return_value
        mock.get_parameter.return_value = {
            "Parameter": {"Value": "test-api-key"}
        }
        yield mock


@pytest.fixture
def app_with_mocked_dependencies(mock_ssm):
    from app.dependencies import get_ksi_api_key, get_weather_api_key

    def override_ksi_key():
        return "test-ksi-key"

    def override_weather_key():
        return "test-weather-key"

    app.dependency_overrides[get_ksi_api_key] = override_ksi_key
    app.dependency_overrides[get_weather_api_key] = override_weather_key
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def mock_ksi_api_key():
    def _get_key(team_id: int) -> str:
        return f"mock-key-{team_id}"

    return _get_key


@pytest.fixture
def mock_weather_api_key():
    return "mock-weather-key"


@pytest_asyncio.fixture
async def ksi_client():
    client = KsiClient(api_key="test-key", team_id=1)
    yield client
    await client.close()
