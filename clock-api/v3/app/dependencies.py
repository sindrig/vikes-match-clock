"""Dependency injection for FastAPI routes."""

import boto3
from functools import cache

ssm_client = boto3.client("ssm", region_name="eu-west-1")


@cache
def get_ksi_api_key():
    """Fetch KSI/Analyticom API key from SSM Parameter Store."""
    response = ssm_client.get_parameter(Name="/vikes-match-clock/ksi-api-key")
    return response["Parameter"]["Value"]


@cache
def get_weather_api_key():
    """Fetch weather API key from SSM Parameter Store."""
    response = ssm_client.get_parameter(Name="/vikes-match-clock/weather-api-key")
    return response["Parameter"]["Value"]
