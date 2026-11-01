import asyncio
import json
from pathlib import Path
from time import sleep
from unittest.mock import Mock

import anyio
import httpx
import pytest
from httpx import AsyncClient

from app import dependencies
from app.main import app
from tests.roster_data import lineup, match, player, roster_cases

BASELINE = json.loads(
    (Path(__file__).parent / "fixtures" / "roster_baseline.json").read_text()
)
HISTORY_PATH = "/api/live/team/1/matches/paginated/past/0"
ROSTER_BODY = {"starters": list(range(1, 12)), "substitutes": [12]}
ENDPOINTS = [
    ("GET", "/v3/1/matches/2026-06-15", "/api/live/matchList/20260615/0"),
    ("GET", "/v3/1/matches/101/lineups", "/api/live/match/101/lineups"),
    ("GET", "/v3/1/matches/101/events", "/api/live/match/101/events"),
    ("GET", "/v3/1/matches/101/info", "/api/live/match/101"),
    ("POST", "/v3/1/resolve-roster", HISTORY_PATH),
]


class ClosingTransport(httpx.MockTransport):
    def __init__(self, handler):
        super().__init__(handler)
        self.closed = False
        self.close_cancelled = False
        self.close_delay = 0
        self.close_loop = None

    async def aclose(self):
        try:
            await asyncio.sleep(self.close_delay)
            self.close_loop = asyncio.get_running_loop()
            self.closed = True
        except asyncio.CancelledError:
            self.close_cancelled = True
            raise


class Upstream:
    def __init__(self):
        self.clients = []
        self.transports = []
        self.requests = []
        self.handler = Mock(side_effect=AssertionError("Unexpected upstream"))

    async def handle(self, request):
        self.requests.append(request)
        response = self.handler(request)
        if asyncio.iscoroutine(response):
            return await response
        return response

    def client(self, *args, **kwargs):
        transport = ClosingTransport(self.handle)
        client = AsyncClient(*args, transport=transport, **kwargs)
        self.clients.append(client)
        self.transports.append(transport)
        return client

    def assert_closed(self):
        assert self.clients
        assert all(client.is_closed for client in self.clients)
        assert all(transport.closed for transport in self.transports)
        assert not any(t.close_cancelled for t in self.transports)
        assert all(
            t.close_loop is asyncio.get_running_loop() for t in self.transports
        )


@pytest.fixture
def upstream(monkeypatch, mock_ssm):
    dependencies.get_ksi_api_key.cache_clear()
    upstream = Upstream()
    monkeypatch.setattr(httpx, "AsyncClient", upstream.client)
    yield upstream
    dependencies.get_ksi_api_key.cache_clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("case", roster_cases(), ids=lambda case: case["name"])
async def test_roster_api_preserves_baseline_and_closes_client(upstream, case):
    def respond(request):
        if request.url.path == HISTORY_PATH:
            payload = (
                {"result": case["history"]}
                if case["history_envelope"]
                else case["history"]
            )
            return httpx.Response(200, json=payload)
        match_id = int(request.url.path.split("/")[-2])
        assert match_id in case["fetched"]
        return httpx.Response(200, json=case["lineups"][str(match_id)])

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await client.post(
            "/v3/1/resolve-roster",
            json={
                "starters": case["starters"],
                "substitutes": case["substitutes"],
            },
        )

    assert response.status_code == 200
    assert response.json() == BASELINE[case["name"]]
    assert [request.url.path for request in upstream.requests] == [
        HISTORY_PATH,
        *[f"/api/live/match/{mid}/lineups" for mid in case["fetched"]],
    ]
    assert all(
        r.headers["API_KEY"] == "test-api-key" for r in upstream.requests
    )
    upstream.assert_closed()


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,upstream_path", ENDPOINTS)
async def test_every_match_endpoint_uses_managed_client(
    upstream, method, path, upstream_path
):
    def respond(request):
        assert request.url.path == upstream_path
        assert request.url.params["teamIdFilter"] == "1"
        if path.endswith("/lineups"):
            return httpx.Response(
                200,
                json={
                    "home": lineup(
                        [
                            {
                                "shirtNumber": 1,
                                "personId": 42,
                                "name": "Flat",
                                "position": "G",
                                "starting": True,
                                "captain": True,
                            }
                        ]
                    ),
                    "away": {
                        "players": [],
                        "officials": [
                            {
                                "personId": 99,
                                "name": "Away Coach",
                                "role": "COACH",
                            }
                        ],
                    },
                },
            )
        if path.endswith("/events"):
            return httpx.Response(
                200,
                json=[
                    {
                        "eventId": 1,
                        "eventType": {"id": 1, "name": "GOAL"},
                        "player": player(9, "Scorer", 9, captain=True),
                    }
                ],
            )
        if path.endswith("/info"):
            return httpx.Response(200, json=match(101, 15, 1, 2))
        if method == "POST":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[match(101, 15, 1, 2)])

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await client.request(
            method, path, json=ROSTER_BODY if method == "POST" else None
        )

    assert response.status_code == 200
    data = response.json()
    if path.endswith("/lineups"):
        keeper = data["home"]["players"][0]
        assert keeper["person"]["id"] == 42
        assert keeper["goalkeeper"] is True
        assert keeper["captain"] is True
        assert keeper["startingLineup"] is True
        assert data["home"]["officials"][0]["person"]["name"] == "Coach"
        assert data["away"]["officials"][0]["person"]["name"] == "Away Coach"
    elif path.endswith("/events"):
        assert data[0]["player"]["person"]["name"] == "Scorer"
    elif path.endswith("/info"):
        assert data["id"] == 101
    elif method == "GET":
        assert data[0]["id"] == 101
    else:
        assert data["players"][0]["person"]["name"] == "#1"
    upstream.assert_closed()


@pytest.mark.asyncio
async def test_repeated_requests_reuse_key_but_not_history_or_http_client(
    upstream, mock_ssm
):
    upstream.handler = lambda request: httpx.Response(200, json=[])
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        first = await client.post("/v3/1/resolve-roster", json=ROSTER_BODY)
        second = await client.post("/v3/1/resolve-roster", json=ROSTER_BODY)

    assert first.json() == second.json()
    assert len(upstream.clients) == 2
    assert upstream.clients[0] is not upstream.clients[1]
    assert [r.url.path for r in upstream.requests] == [HISTORY_PATH] * 2
    mock_ssm.get_parameter.assert_called_once()
    upstream.assert_closed()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure,status,detail",
    [
        (httpx.Response(503), 502, "Upstream API responded with 503"),
        (
            httpx.ReadTimeout("private upstream diagnostic"),
            504,
            "KSI request timed out",
        ),
        (
            httpx.ConnectError("private upstream diagnostic"),
            502,
            "Upstream API request failed",
        ),
    ],
)
async def test_upstream_failure_has_defined_response_and_cleanup(
    upstream, failure, status, detail
):
    def respond(request):
        if isinstance(failure, Exception):
            raise failure
        return failure

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await client.get("/v3/1/matches/101/events")

    assert response.status_code == status
    assert response.json() == {"detail": detail}
    upstream.assert_closed()


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [b"{", b'{"not": "an event list"}'])
async def test_invalid_upstream_data_still_closes_client(upstream, payload):
    upstream.handler = lambda request: httpx.Response(200, content=payload)
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        with pytest.raises((ValueError, TypeError)):
            await client.get("/v3/1/matches/101/events")

    upstream.assert_closed()


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,upstream_path", ENDPOINTS)
async def test_total_timeout_applies_to_every_match_endpoint(
    monkeypatch, upstream, method, path, upstream_path
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.05)
    cancelled = asyncio.Event()

    async def respond(request):
        assert request.url.path == upstream_path
        try:
            await asyncio.Future()
        finally:
            cancelled.set()

    upstream.handler = respond
    started = asyncio.get_running_loop().time()
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await asyncio.wait_for(
            client.request(
                method, path, json=ROSTER_BODY if method == "POST" else None
            ),
            timeout=0.5,
        )

    assert response.status_code == 504
    assert response.json() == {"detail": "KSI request timed out"}
    assert asyncio.get_running_loop().time() - started < 0.5
    assert cancelled.is_set()
    upstream.assert_closed()


@pytest.mark.asyncio
async def test_roster_budget_is_shared_across_history_and_lineups(
    monkeypatch, upstream
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.15)
    cancelled = asyncio.Event()

    async def respond(request):
        if request.url.path == HISTORY_PATH:
            await asyncio.sleep(0.04)
            return httpx.Response(
                200,
                json=[
                    match(1, 15, 1, 2),
                    match(2, 8, 1, 2),
                    match(3, 1, 1, 2),
                ],
            )
        if request.url.path == "/api/live/match/1/lineups":
            await asyncio.sleep(0.04)
            return httpx.Response(
                200,
                json={
                    "home": lineup([player(1, "Resolved Keeper", 1)]),
                    "away": lineup([]),
                },
            )
        assert request.url.path == "/api/live/match/2/lineups"
        try:
            await asyncio.Future()
        finally:
            cancelled.set()

    upstream.handler = respond
    started = asyncio.get_running_loop().time()
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await asyncio.wait_for(
            client.post("/v3/1/resolve-roster", json=ROSTER_BODY), 0.6
        )

    assert response.status_code == 504
    assert response.json() == {"detail": "KSI request timed out"}
    assert asyncio.get_running_loop().time() - started < 0.6
    assert len(upstream.requests) == 3
    assert cancelled.is_set()
    upstream.assert_closed()


@pytest.mark.asyncio
async def test_key_lookup_and_http_work_share_the_same_budget(
    monkeypatch, upstream, mock_ssm
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.1)
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    def lookup(**kwargs):
        sleep(0.06)
        return {"Parameter": {"Value": "mock-key"}}

    async def respond(request):
        entered.set()
        try:
            await asyncio.sleep(0.06)
            return httpx.Response(200, json=[])
        except asyncio.CancelledError:
            cancelled.set()
            raise

    mock_ssm.get_parameter.side_effect = lookup
    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await asyncio.wait_for(
            client.get("/v3/1/matches/101/events"), 0.5
        )

    assert response.status_code == 504
    assert response.json() == {"detail": "KSI request timed out"}
    assert entered.is_set()
    assert cancelled.is_set()
    upstream.assert_closed()


@pytest.mark.asyncio
async def test_failure_after_partial_resolution_does_not_return_partial_roster(
    upstream,
):
    def respond(request):
        if request.url.path == HISTORY_PATH:
            return httpx.Response(
                200,
                json=[
                    match(1, 15, 1, 2),
                    match(2, 8, 1, 2),
                    match(3, 1, 1, 2),
                ],
            )
        if request.url.path == "/api/live/match/1/lineups":
            return httpx.Response(
                200,
                json={
                    "home": lineup([player(1, "Resolved Keeper", 1)]),
                    "away": lineup([]),
                },
            )
        assert request.url.path == "/api/live/match/2/lineups"
        return httpx.Response(500)

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await client.post("/v3/1/resolve-roster", json=ROSTER_BODY)

    assert response.status_code == 502
    assert response.json() == {"detail": "Upstream API responded with 500"}
    assert len(upstream.requests) == 3
    upstream.assert_closed()


@pytest.mark.asyncio
@pytest.mark.parametrize("cancellation", ["asyncio", "anyio"])
async def test_request_cancellation_closes_transport(upstream, cancellation):
    entered = asyncio.Event()
    scopes = []

    async def respond(request):
        upstream.transports[-1].close_delay = 0.01
        entered.set()
        await asyncio.Future()

    async def request(client):
        with anyio.CancelScope() as scope:
            scopes.append(scope)
            await client.get("/v3/1/matches/101/events")
            pytest.fail("Cancelled request returned a response")

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        task = asyncio.create_task(request(client))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            if cancellation == "asyncio":
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            else:
                scopes[0].cancel()
                await asyncio.wait_for(task, 1)
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    upstream.assert_closed()


@pytest.mark.asyncio
async def test_slow_response_body_is_cancelled_and_closed(
    monkeypatch, upstream
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.06)
    closed = asyncio.Event()

    class SlowBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            while True:
                await asyncio.sleep(0.01)
                yield b" "

        async def aclose(self):
            closed.set()

    upstream.handler = lambda request: httpx.Response(200, stream=SlowBody())
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await asyncio.wait_for(
            client.get("/v3/1/matches/101/events"), 0.5
        )

    assert response.status_code == 504
    assert closed.is_set()
    upstream.assert_closed()


@pytest.mark.asyncio
async def test_cleanup_has_a_separate_bounded_budget(
    monkeypatch, upstream, caplog
):
    monkeypatch.setattr(dependencies, "KSI_CLEANUP_TIMEOUT_SECONDS", 0.03)

    def respond(request):
        upstream.transports[-1].close_delay = 10
        return httpx.Response(200, json=[])

    upstream.handler = respond
    async with AsyncClient(app=app, base_url="http://api.test") as client:
        response = await asyncio.wait_for(
            client.get("/v3/1/matches/101/events"), 0.5
        )

    assert response.status_code == 200
    assert upstream.clients[0].is_closed
    assert upstream.transports[0].close_cancelled
    assert "KSI client cleanup timed out" in caplog.text


@pytest.mark.asyncio
async def test_default_budget_closes_real_loopback_connection_before_gateway(
    monkeypatch, mock_ssm, record_property
):
    monkeypatch.setenv("NO_PROXY", "*")
    assert (
        dependencies.KSI_REQUEST_TIMEOUT_SECONDS
        + dependencies.KSI_CLEANUP_TIMEOUT_SECONDS
        < 12
    )
    dependencies.get_ksi_api_key.cache_clear()
    disconnected = asyncio.Event()
    connections = []
    handlers = []
    clients = []
    original_client = dependencies.KsiClient

    async def stall(reader, writer):
        connections.append(writer)
        handlers.append(asyncio.current_task())
        try:
            await reader.readuntil(b"\r\n\r\n")
            assert await reader.read() == b""
            disconnected.set()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(stall, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    def create_client(**kwargs):
        client = original_client(**kwargs)
        client.client.base_url = f"http://127.0.0.1:{port}"
        clients.append(client)
        return client

    monkeypatch.setattr(dependencies, "KsiClient", create_client)
    started = asyncio.get_running_loop().time()
    try:
        async with AsyncClient(app=app, base_url="http://api.test") as client:
            response = await asyncio.wait_for(
                client.get("/v3/1/matches/101/events"), 11.5
            )
        elapsed = asyncio.get_running_loop().time() - started
        assert response.status_code == 504
        assert response.json() == {"detail": "KSI request timed out"}
        assert elapsed < 12
        await asyncio.wait_for(disconnected.wait(), 0.5)
        assert len(clients) == 1
        assert clients[0].client.is_closed
        record_property("default_budget_elapsed_seconds", elapsed)
        record_property("loopback_connection_closed", True)
    finally:
        server.close()
        await server.wait_closed()
        for connection in connections:
            connection.close()
        await asyncio.gather(*handlers)
        dependencies.get_ksi_api_key.cache_clear()
