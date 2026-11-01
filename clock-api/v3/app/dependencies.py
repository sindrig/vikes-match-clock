import asyncio
import logging
from collections.abc import AsyncIterator
from functools import cache

import anyio
import boto3
from fastapi import Path
from fastapi.exceptions import HTTPException

from app.services.ksi import KsiClient

KSI_REQUEST_TIMEOUT_SECONDS = 10.0
KSI_CLEANUP_TIMEOUT_SECONDS = 1.0

logger = logging.getLogger(__name__)


@cache
def get_ssm_client():
    return boto3.client("ssm", region_name="eu-west-1")


@cache
def get_ksi_api_key(team_id: int) -> str:
    response = get_ssm_client().get_parameter(
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
    response = get_ssm_client().get_parameter(
        Name="/vikes-match-clock/weather-api", WithDecryption=True
    )
    return response["Parameter"]["Value"]


async def get_ksi_client(
    team_id: int = Path(alias="teamId"),
) -> AsyncIterator[KsiClient]:
    client = None
    try:
        async with asyncio.timeout(KSI_REQUEST_TIMEOUT_SECONDS):
            api_key = await anyio.to_thread.run_sync(
                get_ksi_api_key, team_id, cancellable=True
            )
            client = KsiClient(api_key=api_key, team_id=team_id)
            yield client
    except TimeoutError as error:
        raise HTTPException(
            status_code=504, detail="KSI request timed out"
        ) from error
    finally:
        if client is not None:
            with anyio.move_on_after(
                KSI_CLEANUP_TIMEOUT_SECONDS, shield=True
            ) as cleanup:
                await client.close()
            if cleanup.cancel_called:
                logger.warning("KSI client cleanup timed out")
