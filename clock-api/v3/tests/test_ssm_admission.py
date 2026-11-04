import asyncio
import gc
from threading import Event, Lock
from unittest.mock import AsyncMock, patch

import anyio
import anyio._backends._asyncio as anyio_backend
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app import dependencies
from app.main import app


async def until(predicate):
    async with asyncio.timeout(2):
        while not predicate():
            await asyncio.sleep(0)


async def turn():
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    loop.call_soon(future.set_result, None)
    await future


def queued(owner):
    return len(owner.semaphore._waiters or ())


class Workers:
    def __init__(self):
        self.loop = asyncio.get_running_loop()
        self.entered = asyncio.Queue()
        self.lock = Lock()
        self.gates = {}
        self.released = False
        self.calls = []
        self.active = 0
        self.peak = 0

    def lookup(self, team):
        with self.lock:
            gate = self.gates.setdefault(team, Event())
            if self.released:
                gate.set()
            self.calls.append(team)
            self.active += 1
            self.peak = max(self.peak, self.active)
        self.loop.call_soon_threadsafe(self.entered.put_nowait, team)
        try:
            assert gate.wait(5)
            return f"key-{team}"
        finally:
            with self.lock:
                self.active -= 1

    async def entries(self, count):
        async with asyncio.timeout(2):
            return [await self.entered.get() for _ in range(count)]

    def release(self, team):
        self.gates[team].set()

    def release_all(self):
        with self.lock:
            self.released = True
            for gate in self.gates.values():
                gate.set()


@pytest_asyncio.fixture(autouse=True)
async def no_unhandled_errors():
    loop = asyncio.get_running_loop()
    original = loop.get_exception_handler()
    errors = []
    loop.set_exception_handler(lambda loop, context: errors.append(context))
    try:
        yield
        gc.collect()
        await turn()
        assert errors == []
    finally:
        loop.set_exception_handler(original)


@pytest_asyncio.fixture
async def workers(monkeypatch, app_lifespan):
    workers = Workers()
    monkeypatch.setattr(dependencies, "get_ksi_api_key", workers.lookup)
    try:
        yield workers
    finally:
        workers.release_all()
        await until(lambda: not app_lifespan.tasks and workers.active == 0)
        assert queued(app_lifespan) == 0
        assert app_lifespan.semaphore._value == (
            app_lifespan.semaphore._bound_value
        )


@pytest.fixture
def clients(monkeypatch):
    clients = []

    def create(**kwargs):
        client = AsyncMock()
        client.get_events.return_value = []
        loop = asyncio.get_running_loop()

        async def close():
            assert asyncio.get_running_loop() is loop

        client.close.side_effect = close
        clients.append((kwargs["team_id"], client))
        return client

    monkeypatch.setattr(dependencies, "KsiClient", create)
    yield clients
    for _, client in clients:
        client.close.assert_awaited_once()


@pytest_asyncio.fixture
async def api(app_lifespan, workers, clients):
    async with AsyncClient(app=app, base_url="http://api.test") as api:
        yield api


def request(api, team, scopes=None):
    async def load():
        with anyio.CancelScope() as scope:
            if scopes is not None:
                scopes.append(scope)
            return await api.get(f"/v3/{team}/matches/101/events")

    return asyncio.create_task(load())


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1, 2])
@pytest.mark.parametrize("cancel_first", [True, False])
@pytest.mark.parametrize("kind", ["asyncio", "anyio"])
async def test_cancelled_handoff_reaches_live_waiter(
    ksi_capacity, cancel_first, kind, app_lifespan, api, workers, clients
):
    owner = app_lifespan
    for _ in range(ksi_capacity):
        await owner.semaphore.acquire()
    workers.release_all()
    scopes = []
    cancelled = []
    for team in range(1, ksi_capacity + 1):
        cancelled.append(request(api, team, scopes))
        await until(lambda: queued(owner) == team)
    survivor = request(api, 99)
    await until(lambda: queued(owner) == ksi_capacity + 1)

    def cancel():
        for task, scope in zip(cancelled, scopes):
            if kind == "asyncio":
                task.cancel()
            else:
                scope.cancel()

    def release():
        for _ in range(ksi_capacity):
            owner.semaphore.release()

    loop = asyncio.get_running_loop()
    for callback in (cancel, release) if cancel_first else (release, cancel):
        loop.call_soon(callback)
    try:
        results = await asyncio.gather(*cancelled, return_exceptions=True)
        assert all(
            (
                isinstance(result, asyncio.CancelledError)
                if kind == "asyncio"
                else result is None
            )
            for result in results
        )
        response = await asyncio.wait_for(survivor, 1)
        assert response.status_code == 200
        assert 99 in workers.calls
        if cancel_first:
            assert workers.calls == [99]
        assert workers.peak <= ksi_capacity
        assert [team for team, _ in clients] == [99]
        await until(lambda: not owner.tasks)
        assert queued(owner) == 0
    finally:
        for task in [*cancelled, survivor]:
            task.cancel()
        await asyncio.gather(*cancelled, survivor, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_deadline_callback_at_handoff_preserves_response_and_progress(
    monkeypatch, ksi_capacity, app_lifespan, api, workers, clients
):
    owner = app_lifespan
    await owner.semaphore.acquire()
    workers.release_all()
    real_timeout_at = asyncio.timeout_at
    timers = []

    def timeout_at(deadline):
        timer = real_timeout_at(deadline)
        if not timers:
            on_timeout = timer._on_timeout

            def expire_and_release():
                on_timeout()
                owner.semaphore.release()

            timer._on_timeout = expire_and_release
        timers.append(timer)
        return timer

    monkeypatch.setattr(asyncio, "timeout_at", timeout_at)
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.05)
    expired = request(api, 1)
    await until(lambda: queued(owner) == 1)
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 1)
    survivor = request(api, 2)
    await until(lambda: queued(owner) == 2)
    first, second = await asyncio.wait_for(
        asyncio.gather(expired, survivor), 1.5
    )
    assert first.status_code == 504
    assert first.json() == {"detail": "KSI request timed out"}
    assert second.status_code == 200
    assert workers.calls == [2]
    assert [team for team, _ in clients] == [2]


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_actual_worker_completion_hands_off_without_stranding_queue(
    monkeypatch,
    record_property,
    ksi_capacity,
    app_lifespan,
    api,
    workers,
    clients,
):
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.25)
    owner = app_lifespan
    original_report = anyio_backend.WorkerThread._report_result
    injected = False
    cancelled = None

    def report(worker, future, result, error):
        nonlocal injected
        if not injected:
            injected = True
            cancelled.cancel()
        return original_report(worker, future, result, error)

    monkeypatch.setattr(anyio_backend.WorkerThread, "_report_result", report)
    first = request(api, 1)
    assert await workers.entries(1) == [1]
    cancelled = request(api, 2)
    await until(lambda: queued(owner) == 1)
    started = owner.loop.time()
    survivor = request(api, 3)
    await until(lambda: queued(owner) == 2)
    workers.release(1)
    assert (await first).status_code == 200
    with pytest.raises(asyncio.CancelledError):
        await cancelled
    assert await workers.entries(1) == [3]
    assert workers.calls == [1, 3]
    assert workers.active == 1
    assert queued(owner) == 0
    workers.release(3)
    assert (await asyncio.wait_for(survivor, 1)).status_code == 200
    elapsed = owner.loop.time() - started
    assert elapsed < 0.25
    workers.release_all()
    assert (await api.get("/v3/4/matches/101/events")).status_code == 200
    assert workers.calls == [1, 3, 4]
    assert workers.peak == 1
    assert [team for team, _ in clients] == [1, 3, 4]
    record_property("worker_handoff_survivor_status", 200)
    record_property("worker_handoff_ssm_calls", workers.calls)
    record_property("worker_handoff_survivor_seconds", elapsed)
    await until(lambda: not owner.tasks and workers.active == 0)
    record_property("worker_handoff_peak_workers", workers.peak)
    record_property(
        "worker_handoff_cleanup",
        {
            "active": workers.active,
            "queued": queued(owner),
            "retained": len(owner.tasks),
        },
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1, 2])
async def test_notified_reservation_prevents_fresh_arrival_queue_jump(
    ksi_capacity, app_lifespan, api, workers
):
    owner = app_lifespan
    for _ in range(ksi_capacity):
        await owner.semaphore.acquire()
    first = request(api, 1)
    await until(lambda: queued(owner) == 1)
    newcomer = request(api, 2)
    asyncio.get_running_loop().call_soon(owner.semaphore.release)
    assert await workers.entries(1) == [1]
    await until(lambda: queued(owner) == 1)
    assert workers.calls == [1]
    assert workers.active == 1
    assert owner.semaphore._value == 0
    workers.release(1)
    assert (await first).status_code == 200
    assert await workers.entries(1) == [2]
    assert workers.active == 1
    workers.release(2)
    assert (await newcomer).status_code == 200
    for _ in range(ksi_capacity - 1):
        owner.semaphore.release()
    assert workers.peak == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [2])
@pytest.mark.parametrize("cancelled_team", [3, 5, 7])
async def test_fifo_head_middle_tail_cancellation_multiple_releases_newcomers(
    monkeypatch, ksi_capacity, cancelled_team, app_lifespan, api, workers
):
    owner = app_lifespan
    admitted = []
    original_run = anyio.to_thread.run_sync

    async def run(function, team, **kwargs):
        admitted.append(team)
        return await original_run(function, team, **kwargs)

    monkeypatch.setattr(anyio.to_thread, "run_sync", run)
    tasks = {team: request(api, team) for team in (1, 2)}
    assert sorted(await workers.entries(2)) == [1, 2]
    for team in range(3, 8):
        tasks[team] = request(api, team)
        await until(lambda: queued(owner) == team - 2)
    tasks[cancelled_team].cancel()
    with pytest.raises(asyncio.CancelledError):
        await tasks[cancelled_team]
    await until(lambda: queued(owner) == 4)
    workers.release(1)
    workers.release(2)
    tasks[8] = request(api, 8)
    tasks[9] = request(api, 9)
    expected = [team for team in range(3, 10) if team != cancelled_team]
    assert sorted(await workers.entries(2)) == expected[:2]
    assert admitted[2:] == expected[:2]
    assert workers.active == 2
    workers.release_all()
    responses = await asyncio.gather(
        *(task for team, task in tasks.items() if team != cancelled_team)
    )
    assert all(response.status_code == 200 for response in responses)
    assert admitted == [1, 2, *expected]
    assert sorted(workers.calls) == [1, 2, *expected]
    assert workers.peak == 2


@pytest.mark.asyncio
async def test_cancellation_before_child_starts_never_submits_worker(
    monkeypatch, app_lifespan, workers
):
    owner = app_lifespan
    create_task = asyncio.create_task
    created = []

    def create(coroutine):
        child = create_task(coroutine)
        created.append(child)
        child.cancel()
        return child

    parent = create_task(owner.lookup(1, owner.loop.time() + 1))
    monkeypatch.setattr(asyncio, "create_task", create)
    with pytest.raises(asyncio.CancelledError):
        await parent
    await until(lambda: not owner.tasks)
    assert len(created) == 1
    assert created[0].cancelled()
    assert workers.calls == []
    assert owner.semaphore._value == dependencies.KSI_KEY_LOOKUP_CAPACITY


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
@pytest.mark.parametrize("kind", ["asyncio", "anyio"])
async def test_admitted_cancellation_before_submission_retains_slot(
    monkeypatch, ksi_capacity, kind, app_lifespan, api, workers, clients
):
    owner = app_lifespan
    entered = asyncio.Event()
    submit = asyncio.Event()
    original_run = anyio.to_thread.run_sync

    async def run(function, *args, **kwargs):
        entered.set()
        await submit.wait()
        return await original_run(function, *args, **kwargs)

    monkeypatch.setattr(anyio.to_thread, "run_sync", run)
    scopes = []
    first = request(api, 1, scopes)
    await asyncio.wait_for(entered.wait(), 1)
    if kind == "asyncio":
        first.cancel()
    else:
        scopes[0].cancel()
    await asyncio.gather(first, return_exceptions=True)
    assert list(owner.tasks.values()) == [True]
    assert owner.semaphore._value == 0
    assert workers.calls == []
    second = request(api, 2)
    await until(lambda: queued(owner) == 1)
    submit.set()
    assert await workers.entries(1) == [1]
    assert workers.active == 1
    assert queued(owner) == 1
    assert clients == []
    workers.release(1)
    assert await workers.entries(1) == [2]
    workers.release(2)
    assert (await second).status_code == 200
    assert [team for team, _ in clients] == [2]
    assert workers.peak == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_expiry_after_notification_returns_capacity_without_worker(
    ksi_capacity, app_lifespan, workers
):
    owner = app_lifespan
    await owner.semaphore.acquire()
    deadline = owner.loop.time() + 0.05
    task = asyncio.create_task(owner.lookup(1, deadline))
    await until(lambda: queued(owner) == 1)
    owner.loop.call_at(deadline, owner.semaphore.release)
    with pytest.raises(TimeoutError):
        await task
    await until(lambda: not owner.tasks)
    assert owner.semaphore._value == 1
    assert queued(owner) == 0
    assert workers.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["asyncio", "anyio"])
async def test_cancellation_at_key_result_never_allocates_http(
    monkeypatch, kind, app_lifespan, api, workers, clients
):
    original_report = anyio_backend.WorkerThread._report_result
    scopes = []
    task = None

    def report(worker, future, result, error):
        if kind == "asyncio":
            task.cancel()
        else:
            scopes[0].cancel()
        return original_report(worker, future, result, error)

    monkeypatch.setattr(anyio_backend.WorkerThread, "_report_result", report)
    task = request(api, 1, scopes)
    assert await workers.entries(1) == [1]
    workers.release(1)
    await asyncio.gather(task, return_exceptions=True)
    await until(lambda: not app_lifespan.tasks)
    assert workers.calls == [1]
    assert clients == []


@pytest.mark.asyncio
async def test_key_result_checks_absolute_expiry_without_delivered_timer(
    monkeypatch, app_lifespan, api, workers, clients
):
    real_timeout_at = asyncio.timeout_at
    timers = []
    deadlines = []

    def timeout_at(deadline):
        timer = real_timeout_at(deadline)
        timers.append(timer)
        return timer

    async def lookup(team, deadline):
        deadlines.append(deadline)
        timers[0].reschedule(None)
        future = app_lifespan.loop.create_future()
        app_lifespan.loop.call_at(deadline, future.set_result, "key")
        return await future

    monkeypatch.setattr(asyncio, "timeout_at", timeout_at)
    monkeypatch.setattr(app_lifespan, "lookup", lookup)
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.02)
    response = await api.get("/v3/1/matches/101/events")
    assert response.status_code == 504
    assert response.json() == {"detail": "KSI request timed out"}
    assert len(timers) == len(deadlines) == 1
    assert app_lifespan.loop.time() >= deadlines[0]
    assert workers.calls == []
    assert clients == []


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_admission_and_endpoint_work_keep_original_deadline(
    monkeypatch, ksi_capacity, app_lifespan, api, workers, clients
):
    owner = app_lifespan
    await owner.semaphore.acquire()
    lookup = owner.lookup
    create = dependencies.KsiClient
    deadlines = []
    entered = asyncio.Event()

    async def key(team, deadline):
        deadlines.append(deadline)
        return await lookup(team, deadline)

    def create_client(**kwargs):
        client = create(**kwargs)

        async def events(match_id):
            entered.set()
            result = owner.loop.create_future()
            handle = owner.loop.call_at(
                deadlines[0] + 0.025, result.set_result, []
            )
            try:
                return await result
            finally:
                handle.cancel()

        client.get_events.side_effect = events
        return client

    monkeypatch.setattr(owner, "lookup", key)
    monkeypatch.setattr(dependencies, "KsiClient", create_client)
    monkeypatch.setattr(dependencies, "KSI_REQUEST_TIMEOUT_SECONDS", 0.15)
    task = request(api, 1)
    await until(lambda: queued(owner) == 1)
    workers.release_all()
    owner.loop.call_at(deadlines[0] - 0.075, owner.semaphore.release)
    response = await asyncio.wait_for(task, 1)
    assert entered.is_set()
    assert response.status_code == 504
    assert response.json() == {"detail": "KSI request timed out"}
    assert workers.calls == [1]
    assert [team for team, _ in clients] == [1]
    assert len(deadlines) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_task_creation_and_submission_failures_release_exactly_once(
    monkeypatch, ksi_capacity, app_lifespan, api, workers, clients
):
    owner = app_lifespan
    coroutines = []

    def fail_create(coroutine):
        coroutines.append(coroutine)
        raise RuntimeError("task creation failed")

    with patch.object(asyncio, "create_task", fail_create):
        with pytest.raises(RuntimeError, match="task creation failed"):
            await owner.lookup(1, owner.loop.time() + 1)
    assert coroutines[0].cr_frame is None
    assert not owner.tasks
    assert owner.semaphore._value == 1

    with patch.object(
        anyio.to_thread, "run_sync", side_effect=RuntimeError("submission")
    ):
        with pytest.raises(RuntimeError, match="submission"):
            await owner.lookup(1, owner.loop.time() + 1)
    await until(lambda: not owner.tasks)
    assert owner.semaphore._value == 1
    assert workers.calls == []
    workers.release_all()
    assert (await api.get("/v3/1/matches/101/events")).status_code == 200
    assert workers.calls == [1]
    assert [team for team, _ in clients] == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("ksi_capacity", [1])
async def test_ksi_and_default_anyio_budgets_are_independent(
    ksi_capacity, app_lifespan, api, workers, record_property
):
    owner = app_lifespan
    default = anyio.to_thread.current_default_thread_limiter()
    original_tokens = default.total_tokens
    default.total_tokens = 1
    default_entered = asyncio.Event()
    default_release = Event()

    def default_work():
        owner.loop.call_soon_threadsafe(default_entered.set)
        assert default_release.wait(5)

    default_task = asyncio.create_task(anyio.to_thread.run_sync(default_work))
    first = None
    try:
        await asyncio.wait_for(default_entered.wait(), 1)
        first = request(api, 1)
        assert await workers.entries(1) == [1]
        assert default.borrowed_tokens == 1
        assert workers.active == 1
        assert owner.semaphore._value == 0
        assert not default_task.done()
        record_property("simultaneous_actual_ksi_and_default_workers", 2)
        default_release.set()
        await default_task
        assert (await api.get("/v3/health")).status_code == 200
        assert await anyio.to_thread.run_sync(lambda: "default work") == (
            "default work"
        )
        second = request(api, 2)
        await until(lambda: queued(owner) == 1)
        assert default.borrowed_tokens == 0
        assert workers.calls == [1]
        workers.release_all()
        assert [
            r.status_code for r in await asyncio.gather(first, second)
        ] == [200, 200]
        assert workers.peak == 1
    finally:
        workers.release_all()
        default_release.set()
        if first is not None:
            await asyncio.gather(first, return_exceptions=True)
        await asyncio.gather(default_task, return_exceptions=True)
        default.total_tokens = original_tokens


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["none", "asyncio", "anyio"])
async def test_shutdown_closes_queue_drains_workers_and_defers_cancellation(
    monkeypatch, kind, clients, record_property
):
    monkeypatch.setattr(dependencies, "KSI_KEY_LOOKUP_CAPACITY", 1)
    workers = Workers()
    monkeypatch.setattr(dependencies, "get_ksi_api_key", workers.lookup)
    lifecycle = app.router.lifespan_context(app)
    await lifecycle.__aenter__()
    owner = app.state.ksi_key_lookups
    scopes = []
    async with AsyncClient(app=app, base_url="http://api.test") as api:
        first = request(api, 1)
        assert await workers.entries(1) == [1]
        waiting = [request(api, team) for team in (2, 3)]
        await until(lambda: queued(owner) == 2)

        async def shutdown():
            with anyio.CancelScope() as scope:
                scopes.append(scope)
                await lifecycle.__aexit__(None, None, None)

        closing = asyncio.create_task(shutdown())
        try:
            await until(lambda: owner.closing and queued(owner) == 0)
            await asyncio.gather(*waiting, return_exceptions=True)
            first.cancel()
            await asyncio.gather(first, return_exceptions=True)
            assert workers.calls == [1]
            assert workers.active == 1
            assert list(owner.tasks.values()) == [True]
            assert not closing.done()
            assert app.state.ksi_key_lookups is owner
            with pytest.raises(asyncio.CancelledError):
                await owner.lookup(4, owner.loop.time() + 1)
            with pytest.raises(RuntimeError, match="already running"):
                async with app.router.lifespan_context(app):
                    pytest.fail("Overlapping lifecycle started")
            if kind == "asyncio":
                closing.cancel()
                await turn()
                closing.cancel()
            elif kind == "anyio":
                scopes[0].cancel()
            await turn()
            assert not closing.done()
            assert workers.active == 1
            assert owner.semaphore._value == 0
            workers.release_all()
            result = await asyncio.wait_for(
                asyncio.gather(closing, return_exceptions=True), 1
            )
            if kind == "asyncio":
                assert isinstance(result[0], asyncio.CancelledError)
            else:
                assert result == [None]
            assert not owner.tasks
            assert queued(owner) == 0
            assert workers.active == 0
            assert owner.semaphore._value == 1
            assert not hasattr(app.state, "ksi_key_lookups")
            assert clients == []
            async with app.router.lifespan_context(app):
                fresh = app.state.ksi_key_lookups
                assert fresh is not owner
                assert not fresh.closing
                assert workers.active == 0
                assert (
                    await api.get("/v3/5/matches/101/events")
                ).status_code == 200
            assert workers.calls == [1, 5]
            record_property("shutdown_cancellation", kind)
            record_property("shutdown_drained_on_serving_loop", True)
        finally:
            workers.release_all()
            for task in [first, *waiting]:
                task.cancel()
            await asyncio.gather(first, *waiting, return_exceptions=True)
            await asyncio.gather(closing, return_exceptions=True)


def test_testclient_lifecycles_use_new_loops_and_fresh_owners(monkeypatch):
    owners = []
    created = []
    closed = []
    monkeypatch.setattr(dependencies, "get_ksi_api_key", lambda team: "key")

    def create(**kwargs):
        loop = asyncio.get_running_loop()
        client = AsyncMock()
        client.get_events.return_value = []
        created.append(loop)

        async def close():
            assert asyncio.get_running_loop() is loop
            closed.append(loop)

        client.close.side_effect = close
        return client

    monkeypatch.setattr(dependencies, "KsiClient", create)
    for _ in range(2):
        with TestClient(app) as api:
            owner = app.state.ksi_key_lookups
            owners.append(owner)
            assert api.get("/v3/1/matches/101/events").status_code == 200
        assert owner.closing
        assert not owner.tasks
        assert owner.loop.is_closed()
        assert not hasattr(app.state, "ksi_key_lookups")
    assert owners[0] is not owners[1]
    assert owners[0].loop is not owners[1].loop
    assert created == closed == [owner.loop for owner in owners]


@pytest.mark.asyncio
async def test_owner_rejects_another_loop_before_touching_capacity():
    owner = dependencies.KsiKeyLookups(1)

    async def foreign_loop():
        with pytest.raises(RuntimeError, match="another event loop"):
            await owner.lookup(1, owner.loop.time() + 1)
        with pytest.raises(RuntimeError, match="another event loop"):
            await owner.close()

    await asyncio.to_thread(lambda: asyncio.run(foreign_loop()))
    assert not owner.tasks
    assert owner.semaphore._value == 1
    assert not owner.closing
    await owner.close()
