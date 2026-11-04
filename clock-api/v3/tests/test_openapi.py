import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent


def test_export_and_health_are_offline_and_preserve_tracked_contract(tmp_path):
    api_dir = Path(__file__).resolve().parents[1]
    script = dedent("""
        import runpy
        import sys
        from unittest.mock import patch

        def forbidden(*args, **kwargs):
            raise AssertionError("AWS construction or network access attempted")

        with (
            patch("boto3.client", side_effect=forbidden),
            patch("boto3.resource", side_effect=forbidden),
            patch("socket.create_connection", side_effect=forbidden),
            patch("socket.getaddrinfo", side_effect=forbidden),
            patch("socket.socket.connect", side_effect=forbidden),
            patch("socket.socket.connect_ex", side_effect=forbidden),
        ):
            runpy.run_path(sys.argv[1], run_name="__main__")
            from fastapi.testclient import TestClient
            from app.main import app

            with TestClient(app) as client:
                response = client.get("/v3/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}
        """)
    subprocess.run(
        [sys.executable, "-c", script, str(api_dir / "export-openapi.py")],
        cwd=tmp_path,
        env={
            "PATH": os.defpath,
            "PYTHONPATH": str(api_dir),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
            "AWS_CONFIG_FILE": str(tmp_path / "no-aws-config"),
            "AWS_SHARED_CREDENTIALS_FILE": str(tmp_path / "no-credentials"),
        },
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert (tmp_path / "openapi.json").read_bytes() == (
        api_dir / "openapi.json"
    ).read_bytes()
