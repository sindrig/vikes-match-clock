import boto3
from functools import cache

from app.services.ksi import KsiClient
from fastapi import Path
from fastapi.exceptions import HTTPException

ssm_client = boto3.client("ssm", region_name="eu-west-1")


@cache
def get_ksi_api_key(team_id: int) -> str:
    response = ssm_client.get_parameter(
        Name=f"/vikes-match-clock/ksi-api-key/{team_id}", WithDecryption=True
    )
    try:
        return response["Parameter"]["Value"]
    except KeyError:
        raise HTTPException(
            status_code=500,
            detail="KSI API key not found for team_id: {team_id}",
        )


@cache
def get_weather_api_key() -> str:
    response = ssm_client.get_parameter(
        Name="/vikes-match-clock/weather-api", WithDecryption=True
    )
    return response["Parameter"]["Value"]


def get_ksi_client(team_id: int = Path(alias="teamId")) -> KsiClient:
    api_key = get_ksi_api_key(team_id)
    return KsiClient(api_key=api_key, team_id=team_id)
