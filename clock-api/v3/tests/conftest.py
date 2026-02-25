import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app
from app.services.adapter import KsiAdapter


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_ssm():
    with patch("app.dependencies.ssm_client") as mock:
        mock.get_parameter.return_value = {"Parameter": {"Value": "test-api-key"}}
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
    client = KsiAdapter(api_key="test-key", team_id=1)
    yield client
    await client.close()
