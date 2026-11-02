import asyncio
import gc
from contextlib import asynccontextmanager
from threading import Event, Lock, get_ident
from unittest.mock import ANY, AsyncMock, Mock, call, patch

import anyio
import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import HTTPException
from httpx import AsyncClient

from app import dependencies
from app.main import app


@pytest.fixture(autouse=True)
def clear_dependency_caches():
    caches = (
        dependencies.get_ssm_client,
        dependencies.get_ksi_api_key,
        dependencies.get_weather_api_key,
    )
    for cached in caches:
        cached.cache_clear()
    yield
    for cached in caches:
        cached.cache_clear()


def test_keys_share_one_lazy_regional_client_and_cache_separately():
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        {"Parameter": {"Value": "ksi-2492"}},
        {"Parameter": {"Value": "weather"}},
        {"Parameter": {"Value": "ksi-42"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm) as factory:
        factory.assert_not_called()
        assert dependencies.get_ksi_api_key(2492) == "ksi-2492"
        assert dependencies.get_weather_api_key() == "weather"
        assert dependencies.get_ksi_api_key(42) == "ksi-42"
        assert dependencies.get_ksi_api_key(2492) == "ksi-2492"
        assert dependencies.get_weather_api_key() == "weather"
        assert dependencies.get_ssm_client() is ssm

    factory.assert_called_once_with("ssm", region_name="eu-west-1", config=ANY)
    config = factory.call_args.kwargs["config"]
    assert config.connect_timeout == 2
    assert config.read_timeout == 2
    assert config.retries == {"mode": "standard", "total_max_attempts": 2}
    assert ssm.get_parameter.call_args_list == [
        call(
            Name="/vikes-match-clock/ksi-api-key/2492",
            WithDecryption=True,
        ),
        call(Name="/vikes-match-clock/weather-api", WithDecryption=True),
        call(Name="/vikes-match-clock/ksi-api-key/42", WithDecryption=True),
    ]


@pytest.mark.asyncio
async def test_ksi_clients_remain_request_scoped_with_cached_key():
    ssm = Mock()
    ssm.get_parameter.return_value = {"Parameter": {"Value": "team-key"}}
    first, second = AsyncMock(), AsyncMock()
    with (
        patch("app.dependencies.boto3.client", return_value=ssm),
        patch(
            "app.dependencies.KsiClient", side_effect=[first, second]
        ) as factory,
    ):
        async with asynccontextmanager(dependencies.get_ksi_client)(
            2492
        ) as one:
            assert one is first
            first.close.assert_not_awaited()
        first.close.assert_awaited_once()
        async with asynccontextmanager(dependencies.get_ksi_client)(
            2492
        ) as two:
            assert two is second
            second.close.assert_not_awaited()
        second.close.assert_awaited_once()

    assert factory.call_args_list == [
        call(api_key="team-key", team_id=2492),
        call(api_key="team-key", team_id=2492),
    ]
    ssm.get_parameter.assert_called_once()


def test_failed_client_creation_is_retried_then_cached():
    ssm = Mock()
    ssm.get_parameter.return_value = {"Parameter": {"Value": "key"}}
    with patch(
        "app.dependencies.boto3.client",
        side_effect=[NoCredentialsError(), ssm],
    ) as factory:
        with pytest.raises(NoCredentialsError):
            dependencies.get_ksi_api_key(2492)
        assert dependencies.get_ksi_api_key(2492) == "key"
        assert dependencies.get_ksi_api_key(2492) == "key"

    assert factory.call_count == 2
    ssm.get_parameter.assert_called_once_with(
        Name="/vikes-match-clock/ksi-api-key/2492", WithDecryption=True
    )


@pytest.mark.parametrize(
    "get_key,args",
    [
        (dependencies.get_ksi_api_key, (2492,)),
        (dependencies.get_weather_api_key, ()),
    ],
)
def test_parameter_failure_keeps_client_but_does_not_cache_key(get_key, args):
    error = ClientError(
        {"Error": {"Code": "ParameterNotFound", "Message": "missing"}},
        "GetParameter",
    )
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        error,
        {"Parameter": {"Value": "recovered"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm) as factory:
        with pytest.raises(ClientError) as raised:
            get_key(*args)
        assert raised.value is error
        assert get_key(*args) == "recovered"
        assert get_key(*args) == "recovered"

    factory.assert_called_once_with("ssm", region_name="eu-west-1", config=ANY)
    assert ssm.get_parameter.call_count == 2


def test_missing_ksi_value_preserves_http_error_and_allows_retry():
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        {"Parameter": {}},
        {"Parameter": {"Value": "recovered"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm):
        with pytest.raises(HTTPException) as raised:
            dependencies.get_ksi_api_key(2492)
        assert raised.value.status_code == 500
        assert raised.value.detail == (
            "KSI API key not found for team_id: {team_id}"
        )
        assert dependencies.get_ksi_api_key(2492) == "recovered"


@pytest.mark.asyncio
async def test_cold_secret_lookups_overlap_without_blocking_health():
    started = {1: Event(), 2: Event()}
    release = Event()
    lookup_threads = []
    clients = []
    ssm = Mock()

    def lookup(**kwargs):
        team_id = int(kwargs["Name"].rsplit("/", 1)[-1])
        assert kwargs["WithDecryption"] is True
        lookup_threads.append(get_ident())
        started[team_id].set()
        assert release.wait(2)
        return {"Parameter": {"Value": f"mock-key-{team_id}"}}

    def create_client(**kwargs):
        client = AsyncMock()
        client.get_matches.return_value = []
        clients.append(client)
        return client

    ssm.get_parameter.side_effect = lookup
    with (
        patch("app.dependencies.boto3.client", return_value=ssm),
        patch(
            "app.dependencies.KsiClient", side_effect=create_client
        ) as factory,
    ):
        async with AsyncClient(app=app, base_url="http://api.test") as client:
            requests = [
                asyncio.create_task(
                    client.get(f"/v3/{team}/matches/2026-06-15")
                )
                for team in (1, 2)
            ]
            try:
                for event in started.values():
                    assert await asyncio.to_thread(event.wait, 0.5)
                health = await asyncio.wait_for(client.get("/v3/health"), 0.25)
                assert health.status_code == 200
                assert not any(request.done() for request in requests)
            finally:
                release.set()
                responses = await asyncio.gather(*requests)
            assert [r.status_code for r in responses] == [200, 200]
            assert (
                await client.get("/v3/1/matches/2026-06-15")
            ).status_code == 200

    assert lookup_threads
    assert all(thread != get_ident() for thread in lookup_threads)
    assert ssm.get_parameter.call_count == 2
    assert (
        factory.call_args_list.count(call(api_key="mock-key-1", team_id=1))
        == 2
    )
    assert call(api_key="mock-key-2", team_id=2) in factory.call_args_list
    assert len(clients) == 3
    for client in clients:
        client.close.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "end", ["timeout", "cancellation", "anyio_cancellation"]
)
async def test_slow_secret_lookup_is_bounded_without_late_http_client(
    monkeypatch, end
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.05)
    limiter = anyio.to_thread.current_default_thread_limiter()
    initial_borrowed = limiter.borrowed_tokens
    started, release, finished = Event(), Event(), Event()
    scopes = []
    ssm = Mock()

    def lookup(**kwargs):
        started.set()
        try:
            assert release.wait(2)
            return {"Parameter": {"Value": "mock-key"}}
        finally:
            finished.set()

    ssm.get_parameter.side_effect = lookup
    with (
        patch("app.dependencies.boto3.client", return_value=ssm),
        patch("app.dependencies.KsiClient") as factory,
    ):
        async with AsyncClient(app=app, base_url="http://api.test") as client:

            async def load():
                with anyio.CancelScope() as scope:
                    scopes.append(scope)
                    return await client.get("/v3/1/matches/2026-06-15")

            request = asyncio.create_task(load())
            try:
                assert await asyncio.to_thread(started.wait, 0.5)
                if end == "cancellation":
                    request.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await request
                elif end == "anyio_cancellation":
                    scopes[0].cancel()
                    assert await asyncio.wait_for(request, 0.5) is None
                else:
                    response = await asyncio.wait_for(request, 0.5)
                    assert response.status_code == 504
                    assert response.json() == {
                        "detail": "KSI request timed out"
                    }
                assert not release.is_set()
                assert not finished.is_set()
                assert limiter.borrowed_tokens == initial_borrowed + 1
                factory.assert_not_called()
                assert (await client.get("/v3/health")).status_code == 200
            finally:
                release.set()
                assert await asyncio.to_thread(finished.wait, 0.5)
                await asyncio.gather(request, return_exceptions=True)
            await wait_until(
                lambda: limiter.borrowed_tokens == initial_borrowed
                and not getattr(dependencies, "_ksi_key_lookups", ())
            )
            factory.assert_not_called()


async def wait_until(predicate):
    async with asyncio.timeout(1):
        while not predicate():
            await asyncio.sleep(0.001)


@pytest.mark.asyncio
@pytest.mark.parametrize("late_failure", [False, True])
async def test_ssm_capacity_survives_timeout_waves_and_queued_cancellation(
    monkeypatch, record_property, late_failure
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.1)
    limiter = anyio.to_thread.current_default_thread_limiter()
    original_tokens = limiter.total_tokens
    limiter.total_tokens = 2
    release = Event()
    lock = Lock()
    active = 0
    peak = 0
    calls = []
    clients = []
    requests = []
    scopes = []
    unhandled = []
    loop = asyncio.get_running_loop()
    original_handler = loop.get_exception_handler()
    loop.set_exception_handler(lambda loop, context: unhandled.append(context))

    def lookup(**kwargs):
        nonlocal active, peak
        team_id = int(kwargs["Name"].rsplit("/", 1)[-1])
        with lock:
            calls.append(team_id)
            call_number = len(calls)
            active += 1
            peak = max(peak, active)
        try:
            assert release.wait(5)
            if late_failure and call_number <= 2:
                raise ClientError(
                    {"Error": {"Code": "InternalServerError"}},
                    "GetParameter",
                )
            return {"Parameter": {"Value": f"mock-key-{team_id}"}}
        finally:
            with lock:
                active -= 1

    def create_client(**kwargs):
        client = AsyncMock()
        client.get_matches.return_value = []
        clients.append(client)
        return client

    async def load(client, team_id):
        with anyio.CancelScope() as scope:
            scopes.append(scope)
            return await client.get(f"/v3/{team_id}/matches/2026-06-15")

    ssm = Mock()
    ssm.get_parameter.side_effect = lookup
    try:
        with (
            patch("app.dependencies.boto3.client", return_value=ssm),
            patch(
                "app.dependencies.KsiClient", side_effect=create_client
            ) as factory,
        ):
            async with AsyncClient(app=app, base_url="http://api.test") as api:
                workers_per_wave = []
                elapsed_per_wave = []
                for wave in range(3):
                    started = loop.time()
                    current = [
                        asyncio.create_task(
                            api.get(f"/v3/{team}/matches/2026-06-15")
                        )
                        for team in (wave * 2 + 1, wave * 2 + 2)
                    ]
                    requests.extend(current)
                    responses = await asyncio.wait_for(
                        asyncio.gather(*current), 0.5
                    )
                    elapsed_per_wave.append(loop.time() - started)
                    assert [r.status_code for r in responses] == [504, 504]
                    assert all(
                        r.json() == {"detail": "KSI request timed out"}
                        for r in responses
                    )
                    with lock:
                        workers_per_wave.append(active)

                record_property("ssm_workers_per_wave", workers_per_wave)
                record_property("wave_elapsed_seconds", elapsed_per_wave)
                assert workers_per_wave == [2, 2, 2]
                assert limiter.borrowed_tokens == 2
                factory.assert_not_called()

                monkeypatch.setattr(
                    dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 1
                )
                queued = [
                    asyncio.create_task(load(api, team)) for team in (7, 8)
                ]
                requests.extend(queued)
                await wait_until(
                    lambda: limiter.statistics().tasks_waiting == 2
                )
                queued[0].cancel()
                with pytest.raises(asyncio.CancelledError):
                    await asyncio.wait_for(queued[0], 0.5)
                scopes[1].cancel()
                assert await asyncio.wait_for(queued[1], 0.5) is None
                assert limiter.statistics().tasks_waiting == 0
                assert limiter.borrowed_tokens == 2
                assert not release.is_set()
                factory.assert_not_called()

                recovery = asyncio.create_task(
                    api.get("/v3/9/matches/2026-06-15")
                )
                requests.append(recovery)
                await wait_until(
                    lambda: limiter.statistics().tasks_waiting == 1
                )
                release.set()
                assert (
                    await asyncio.wait_for(recovery, 0.5)
                ).status_code == 200
                assert factory.call_args_list == [
                    call(api_key="mock-key-9", team_id=9)
                ]
                assert sorted(calls) == [1, 2, 9]
                assert (
                    await api.get("/v3/1/matches/2026-06-15")
                ).status_code == 200
                assert calls.count(1) == (2 if late_failure else 1)
                assert len(clients) == 2
                for client in clients:
                    client.close.assert_awaited_once()
                assert (await api.get("/v3/health")).status_code == 200
                assert peak == 2
    finally:
        release.set()
        for request in requests:
            if not request.done():
                request.cancel()
        await asyncio.gather(*requests, return_exceptions=True)
        try:
            await wait_until(
                lambda: active == 0
                and limiter.borrowed_tokens == 0
                and not getattr(dependencies, "_ksi_key_lookups", ())
            )
            assert limiter.statistics().tasks_waiting == 0
            gc.collect()
            await asyncio.sleep(0)
        finally:
            limiter.total_tokens = original_tokens
            loop.set_exception_handler(original_handler)
    assert unhandled == []
