import os

from fastapi.testclient import TestClient

from app.main import app


class TestAppConfig:
    def test_app_has_correct_title(self):
        assert app.title == "Clock API v3"

    def test_app_has_correct_root_path(self):
        assert app.root_path == ""

    def test_health_endpoint_responds(self):
        client = TestClient(app)
        response = client.get("/v3/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_cors_middleware_configured(self):
        client = TestClient(app)
        response = client.options(
            "/v3/health",
            headers={
                "Origin": "http://example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "*"

    def test_run_script_exists(self):
        run_sh = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "run.sh"
        )
        assert os.path.isfile(run_sh)
        assert os.access(run_sh, os.X_OK)
