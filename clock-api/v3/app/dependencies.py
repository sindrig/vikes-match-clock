"""Dependency injection for FastAPI routes."""

import boto3
from functools import cache

from app.services.ksi import KsiClient

ssm_client = boto3.client("ssm", region_name="eu-west-1")


@cache
def get_ksi_api_key(team_id: int) -> str:
    response = ssm_client.get_parameter(
        Name=f"/vikes-match-clock/ksi-api-key/{team_id}"
    )
    return response["Parameter"]["Value"]


@cache
def get_weather_api_key() -> str:
    response = ssm_client.get_parameter(Name="/vikes-match-clock/weather-api")
    return response["Parameter"]["Value"]


def get_ksi_client() -> KsiClient:
    return KsiClient()
