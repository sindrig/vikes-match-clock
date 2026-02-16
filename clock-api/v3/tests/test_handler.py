"""Tests for Mangum handler and AWS Lambda integration."""

import asyncio
import json
from unittest.mock import patch

import pytest

from app.main import handler


@pytest.fixture
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


class TestMangumHandler:
    """Tests for Mangum handler with AWS Lambda events."""

    def test_handler_health_check(self, event_loop):
        """Test Mangum handler with health check endpoint."""
        event = {
            "version": "2.0",
            "requestContext": {
                "http": {
                    "method": "GET",
                    "path": "/health",
                    "sourceIp": "127.0.0.1",
                }
            },
            "rawPath": "/health",
            "rawQueryString": "",
            "headers": {},
        }

        result = handler(event, None)  # type: ignore

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "ok"

    def test_handler_returns_lambda_response_structure(self, event_loop):
        """Test handler returns proper API Gateway v2 response format."""
        event = {
            "version": "2.0",
            "requestContext": {
                "http": {
                    "method": "GET",
                    "path": "/health",
                    "sourceIp": "127.0.0.1",
                }
            },
            "rawPath": "/health",
            "rawQueryString": "",
            "headers": {},
        }

        result = handler(event, None)  # type: ignore

        # Verify Lambda response structure
        assert "statusCode" in result
        assert "body" in result
        assert isinstance(result["statusCode"], int)
        assert isinstance(result["body"], str)
        assert result["statusCode"] == 200

    def test_handler_404_not_found(self, event_loop):
        """Test handler returns 404 for non-existent routes."""
        event = {
            "version": "2.0",
            "requestContext": {
                "http": {
                    "method": "GET",
                    "path": "/v3/nonexistent",
                    "sourceIp": "127.0.0.1",
                }
            },
            "rawPath": "/v3/nonexistent",
            "rawQueryString": "",
            "headers": {},
        }

        result = handler(event, None)  # type: ignore

        assert result["statusCode"] == 404

    def test_handler_with_post_request(self, event_loop):
        """Test handler handles POST requests."""
        event = {
            "version": "2.0",
            "requestContext": {
                "http": {
                    "method": "POST",
                    "path": "/health",
                    "sourceIp": "127.0.0.1",
                }
            },
            "rawPath": "/health",
            "rawQueryString": "",
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"key": "value"}),
        }

        result = handler(event, None)  # type: ignore

        # POST to GET endpoint should fail
        assert result["statusCode"] in [405, 404]

    def test_handler_context_parameter(self, event_loop):
        """Test handler accepts context parameter from Lambda."""
        event = {
            "version": "2.0",
            "requestContext": {
                "http": {
                    "method": "GET",
                    "path": "/health",
                    "sourceIp": "127.0.0.1",
                }
            },
            "rawPath": "/health",
            "rawQueryString": "",
            "headers": {},
        }

        result = handler(event, None)  # type: ignore

        assert result["statusCode"] == 200
        assert json.loads(result["body"])["status"] == "ok"

    def test_handler_imports_successfully(self):
        """Test handler is properly imported from app.main."""
        from app.main import handler as imported_handler

        assert imported_handler is not None
        assert callable(imported_handler)

    def test_handler_is_mangum_instance(self):
        """Test handler is a Mangum instance."""
        from mangum import Mangum

        assert isinstance(handler, Mangum)
