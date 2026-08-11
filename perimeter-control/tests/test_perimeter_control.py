"""Unit tests for the perimeter-control daemon."""

import json
import logging
import threading

import pytest

import perimeter_control as pc

# -- config ---------------------------------------------------------------


def test_load_config_defaults():
    config = pc.load_config({})
    assert config.firebase_url == pc.DEFAULT_FIREBASE_URL
    assert config.resolume_base_url == pc.DEFAULT_RESOLUME_BASE_URL
    assert config.resolume_column == pc.DEFAULT_RESOLUME_COLUMN
    assert config.request_timeout == pc.DEFAULT_REQUEST_TIMEOUT
    assert config.initial_backoff_seconds == pc.DEFAULT_INITIAL_BACKOFF
    assert config.max_backoff_seconds == pc.DEFAULT_MAX_BACKOFF


def test_load_config_overrides():
    config = pc.load_config(
        {
            "PERIMETER_FIREBASE_URL": "https://example.com/state",
            "PERIMETER_RESOLUME_BASE_URL": "http://host:80/api/v1",
            "PERIMETER_RESOLUME_COLUMN": "2",
            "PERIMETER_REQUEST_TIMEOUT": "5",
            "PERIMETER_INITIAL_BACKOFF_SECONDS": "0.5",
            "PERIMETER_MAX_BACKOFF_SECONDS": "30",
        }
    )
    assert config.firebase_url == "https://example.com/state"
    assert config.resolume_base_url == "http://host:80/api/v1"
    assert config.resolume_column == 2
    assert config.request_timeout == 5.0
    assert config.initial_backoff_seconds == 0.5
    assert config.max_backoff_seconds == 30.0


def test_load_config_invalid_numeric_falls_back_to_default():
    config = pc.load_config(
        {
            "PERIMETER_REQUEST_TIMEOUT": "not-a-number",
            "PERIMETER_RESOLUME_COLUMN": "not-a-number",
        }
    )
    assert config.request_timeout == pc.DEFAULT_REQUEST_TIMEOUT
    assert config.resolume_column == pc.DEFAULT_RESOLUME_COLUMN


# -- SSE parsing ------------------------------------------------------------


def test_iter_sse_events_standard_framing():
    lines = [
        'event: put',
        'data: {"path":"/","data":"on"}',
        "",
        'event: patch',
        'data: {"path":"/state","data":"off"}',
        "",
    ]
    events = list(pc.iter_sse_events(lines))
    assert events == [
        ("put", '{"path":"/","data":"on"}'),
        ("patch", '{"path":"/state","data":"off"}'),
    ]


def test_iter_sse_events_legacy_single_line_framing():
    lines = [
        'put: {"path":"/","data":"on"}',
        "",
        'patch: {"path":"/","data":"off"}',
        "",
    ]
    events = list(pc.iter_sse_events(lines))
    assert events == [
        ("put", '{"path":"/","data":"on"}'),
        ("patch", '{"path":"/","data":"off"}'),
    ]


def test_iter_sse_events_ignores_keepalive_comments():
    lines = [
        ": keep-alive",
        'event: put',
        'data: {"path":"/","data":"on"}',
        "",
        ":",
        "",
    ]
    events = list(pc.iter_sse_events(lines))
    assert events == [("put", '{"path":"/","data":"on"}')]


def test_iter_sse_events_flushes_at_eof_without_blank_line():
    lines = ['event: put', 'data: {"path":"/","data":"off"}']
    events = list(pc.iter_sse_events(lines))
    assert events == [("put", '{"path":"/","data":"off"}')]


def test_iter_sse_events_handles_crlf_lines():
    lines = ['event: put\r', 'data: {"path":"/","data":"on"}\r', '']
    events = list(pc.iter_sse_events(line.rstrip("\r") for line in lines))
    assert events == [("put", '{"path":"/","data":"on"}')]


# -- state extraction --------------------------------------------------------


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"path": "/", "data": "on"}, "on"),
        ({"path": "/", "data": "off"}, "off"),
        ({"path": "/state", "data": "on"}, "on"),
        ({"path": "/", "data": {"enabled": True, "state": "on"}}, "on"),
        ({"path": "/", "data": None}, None),
        ({"path": "/enabled", "data": True}, None),
        ({"path": "/", "data": {"enabled": True}}, None),
        (None, None),
        ("not-a-dict", None),
    ],
)
def test_extract_state(payload, expected):
    assert pc.extract_state(payload) == expected


# -- desired state validation ------------------------------------------------


def make_controller():
    config = pc.load_config(
        {
            "PERIMETER_INITIAL_BACKOFF_SECONDS": "0.01",
            "PERIMETER_MAX_BACKOFF_SECONDS": "0.02",
        }
    )
    return pc.PerimeterController(config)


def test_valid_state_sets_desired_and_wakes(caplog):
    controller = make_controller()
    with caplog.at_level(logging.INFO):
        controller._on_desired_state("on")
    assert controller._read_desired() == "on"
    assert "New desired perimeter state: on" in caplog.text


@pytest.mark.parametrize("invalid", [None, True, 1, "paused", "ON", "", {}])
def test_invalid_state_does_not_set_desired(caplog, invalid):
    controller = make_controller()
    with caplog.at_level(logging.WARNING):
        controller._on_desired_state(invalid)
    assert controller._read_desired() is None
    assert "Ignoring invalid perimeter state" in caplog.text


def test_handle_event_malformed_json_is_ignored(caplog):
    controller = make_controller()
    with caplog.at_level(logging.WARNING):
        controller._handle_event("not-json")
    assert controller._read_desired() is None
    assert "Ignoring malformed event payload" in caplog.text


def test_handle_event_valid_put_sets_desired():
    controller = make_controller()
    controller._handle_event('{"path": "/", "data": "on"}')
    assert controller._read_desired() == "on"


def test_startup_replay_put_event_is_applied():
    controller = make_controller()
    recorded = []
    controller.resolume.apply_state = lambda state: recorded.append(state)
    controller._handle_event('{"path": "/", "data": "on"}')

    thread = threading.Thread(target=controller._applicator_loop, daemon=True)
    thread.start()
    _wait_until(lambda: len(recorded) >= 1)
    assert recorded == ["on"]
    controller.shutdown()
    thread.join(timeout=2)


# -- Resolume client ----------------------------------------------------------


def test_resolume_apply_on_posts_connect_for_configured_column(monkeypatch):
    calls = {}

    def fake_post(url, timeout):
        calls["url"] = url
        calls["timeout"] = timeout
        return _Response(200)

    monkeypatch.setattr(pc.requests, "post", fake_post)
    client = pc.ResolumeClient("http://localhost:80/api/v1", 1, 10)
    client.apply_state("on")
    assert (
        calls["url"]
        == "http://localhost:80/api/v1/composition/columns/1/connect"
    )
    assert calls["timeout"] == 10


def test_resolume_apply_off_posts_disconnect_all(monkeypatch):
    calls = {}

    def fake_post(url, timeout):
        calls["url"] = url
        return _Response(200)

    monkeypatch.setattr(pc.requests, "post", fake_post)
    client = pc.ResolumeClient("http://localhost:80/api/v1", 1, 10)
    client.apply_state("off")
    assert (
        calls["url"] == "http://localhost:80/api/v1/composition/disconnect-all"
    )


def test_resolume_apply_strips_trailing_slash(monkeypatch):
    calls = {}

    def fake_post(url, timeout):
        calls["url"] = url
        return _Response(200)

    monkeypatch.setattr(pc.requests, "post", fake_post)
    client = pc.ResolumeClient("http://localhost:80/api/v1/", 1, 10)
    client.apply_state("off")
    assert (
        calls["url"] == "http://localhost:80/api/v1/composition/disconnect-all"
    )


def test_resolume_apply_raises_on_non_2xx(monkeypatch):
    monkeypatch.setattr(
        pc.requests, "post", lambda url, timeout: _Response(500)
    )
    client = pc.ResolumeClient("http://localhost:80/api/v1", 1, 10)
    with pytest.raises(RuntimeError, match="HTTP 500"):
        client.apply_state("on")


def test_resolume_apply_raises_on_unknown_state(monkeypatch):
    client = pc.ResolumeClient("http://localhost:80/api/v1", 1, 10)
    with pytest.raises(ValueError, match="unknown perimeter state"):
        client.apply_state("paused")


# -- retry and supersede behavior ---------------------------------------------


def test_resolume_failure_retries_until_success():
    controller = make_controller()
    attempts = []
    state = {"remaining": 2}

    def flaky_apply(state):
        attempts.append(state)
        if state["remaining"] > 0:
            state["remaining"] -= 1
            raise ConnectionError("Resolume down")

    controller.resolume.apply_state = flaky_apply
    controller._on_desired_state("on")
    thread = threading.Thread(target=controller._applicator_loop, daemon=True)
    thread.start()
    _wait_until(lambda: len(attempts) >= 3)
    assert attempts == ["on", "on", "on"]
    controller.shutdown()
    thread.join(timeout=2)


def test_newer_state_supersedes_failed_retry():
    controller = make_controller()
    recorded = []

    def failing_apply(state):
        recorded.append(state)
        raise ConnectionError("Resolume down")

    controller.resolume.apply_state = failing_apply
    controller._on_desired_state("on")
    thread = threading.Thread(target=controller._applicator_loop, daemon=True)
    thread.start()
    _wait_until(lambda: len(recorded) >= 2)
    controller._on_desired_state("off")
    _wait_until(lambda: "off" in recorded)
    first_off = recorded.index("off")
    _sleep(0.05)
    assert all(v == "off" for v in recorded[first_off:])
    assert "on" not in recorded[first_off:]
    controller.shutdown()
    thread.join(timeout=2)


def test_newer_state_supersedes_before_apply():
    controller = make_controller()
    recorded = []

    def blocking_apply(state):
        recorded.append(state)
        raise ConnectionError("Resolume down")

    controller.resolume.apply_state = blocking_apply
    controller._on_desired_state("on")
    thread = threading.Thread(target=controller._applicator_loop, daemon=True)
    thread.start()
    _wait_until(lambda: len(recorded) >= 1)
    controller._on_desired_state("off")
    _wait_until(lambda: "off" in recorded)
    controller.shutdown()
    thread.join(timeout=2)


# -- helpers -------------------------------------------------------------------


class _Response:
    def __init__(self, status_code):
        self.status_code = status_code


def _wait_until(predicate, timeout=3.0):
    deadline = _now() + timeout
    while _now() < deadline:
        if predicate():
            return
        _sleep(0.005)
    raise AssertionError("condition not met within timeout")


def _now():
    import time

    return time.monotonic()


def _sleep(seconds):
    import time

    time.sleep(seconds)
