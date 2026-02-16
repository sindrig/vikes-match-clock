"""Shared test fixtures and configuration."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app


@pytest.fixture
def client():
    """Create a TestClient for testing FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_ssm():
    """Mock SSM Parameter Store for testing."""
    with patch("app.dependencies.ssm_client") as mock:
        mock.get_parameter.return_value = {"Parameter": {"Value": "test-api-key"}}
        yield mock


@pytest.fixture
def app_with_mocked_dependencies(mock_ssm):
    """FastAPI app with mocked SSM dependencies."""
    from app.dependencies import get_ksi_api_key, get_weather_api_key

    def override_ksi_key():
        return "test-ksi-key"

    def override_weather_key():
        return "test-weather-key"

    app.dependency_overrides[get_ksi_api_key] = override_ksi_key
    app.dependency_overrides[get_weather_api_key] = override_weather_key
    yield app
    app.dependency_overrides.clear()
