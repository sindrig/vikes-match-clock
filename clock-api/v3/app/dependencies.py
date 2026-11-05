import asyncio
import logging
from collections.abc import AsyncIterator
from functools import cache

import anyio
import anyio.lowlevel
import boto3
from botocore.config import Config
from fastapi import Path, Request
from fastapi.exceptions import HTTPException

from app.services.ksi import KsiClient

KSI_REQUEST_TIMEOUT_SECONDS = 10.0
KSI_CLEANUP_TIMEOUT_SECONDS = 1.0
KSI_KEY_LOOKUP_CAPACITY = 40

logger = logging.getLogger(__name__)


@cache
def get_ssm_client():
    return boto3.client(
        "ssm",
        region_name="eu-west-1",
        config=Config(
            connect_timeout=2,
            read_timeout=2,
            retries={"mode": "standard", "total_max_attempts": 2},
        ),
    )


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


class KsiKeyLookups:
    def __init__(self, capacity: int):
        self.loop = asyncio.get_running_loop()
        self.semaphore = asyncio.BoundedSemaphore(capacity)
        self.tasks: dict[asyncio.Task[str], bool] = {}
        self.closing = False

    def check_loop(self):
        if asyncio.get_running_loop() is not self.loop:
            raise RuntimeError("KSI key lookups belong to another event loop")

    def finished(self, task: asyncio.Task[str]):
        self.tasks.pop(task)
        if not task.cancelled():
            task.exception()

    async def lookup(self, team_id: int, deadline: float) -> str:
        self.check_loop()
        if self.closing:
            raise asyncio.CancelledError
        if self.loop.time() >= deadline:
            raise TimeoutError

        async def lookup():
            async with self.semaphore:
                if self.closing:
                    raise asyncio.CancelledError
                if self.loop.time() >= deadline:
                    raise TimeoutError
                task = asyncio.current_task()
                if task is None:
                    raise RuntimeError(
                        "KSI key lookups require an asyncio task"
                    )
                self.tasks[task] = True
                return await anyio.to_thread.run_sync(
                    get_ksi_api_key, team_id, limiter=anyio.CapacityLimiter(1)
                )

        coroutine = lookup()
        try:
            task = asyncio.create_task(coroutine)
        except BaseException:
            coroutine.close()
            raise
        self.tasks.setdefault(task, False)
        task.add_done_callback(self.finished)
        try:
            return await asyncio.shield(task)
        finally:
            if not self.tasks.get(task, False):
                task.cancel()

    async def close(self):
        self.check_loop()
        self.closing = True
        for task, admitted in self.tasks.items():
            if not admitted:
                task.cancel()
        cancellation = None
        with anyio.CancelScope(shield=True):
            draining = asyncio.gather(*self.tasks, return_exceptions=True)
            while not draining.done():
                try:
                    await asyncio.shield(draining)
                except asyncio.CancelledError as error:
                    cancellation = error
            draining.result()
        if cancellation is not None:
            raise cancellation


async def get_ksi_client(
    request: Request,
    team_id: int = Path(alias="teamId"),
) -> AsyncIterator[KsiClient]:
    client = None
    loop = asyncio.get_running_loop()
    deadline = loop.time() + KSI_REQUEST_TIMEOUT_SECONDS
    try:
        async with asyncio.timeout_at(deadline):
            api_key = await request.app.state.ksi_key_lookups.lookup(
                team_id, deadline
            )
            await anyio.lowlevel.checkpoint()
            if loop.time() >= deadline:
                raise TimeoutError
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
