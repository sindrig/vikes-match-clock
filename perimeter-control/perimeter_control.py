"""Perimeter Resolume control daemon.

Streams the perimeter state from a Firebase Realtime Database location and
mirrors it onto a Resolume Arena composition via its HTTP API.

Firebase is the desired-state authority. The daemon never writes back to
Firebase; it only reads the ``state`` child and applies it to Resolume.

Design notes:
  * Only the exact string values "on" and "off" are valid desired states.
    Missing, null, malformed or unknown values cause no Resolume request.
  * Every fresh stream connection delivers the current value as an initial
    "put" event, which replays the desired state on startup and after
    reconnects.
  * Resolume failures retry indefinitely with bounded exponential backoff.
    A newer Firebase value supersedes any failed operation still awaiting
    retry, so stale requests are never applied after the state has moved on.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
from collections.abc import Mapping
from dataclasses import dataclass

import requests

logger = logging.getLogger("perimeter_control")

VALID_STATES = ("on", "off")

DEFAULT_FIREBASE_URL = (
    "https://vikes-match-clock-firebase.firebaseio.com/states/vikuti/"
    "perimeter/state"
)
DEFAULT_RESOLUME_BASE_URL = "http://localhost:80/api/v1"
DEFAULT_RESOLUME_COLUMN = 1
DEFAULT_REQUEST_TIMEOUT = 10.0
DEFAULT_INITIAL_BACKOFF = 1.0
DEFAULT_MAX_BACKOFF = 60.0

RESOLUME_OFF_PATH = "/composition/disconnect-all"
RESOLUME_ON_PATH = "/composition/columns/{column}/connect"


@dataclass(frozen=True)
class Config:
    firebase_url: str
    resolume_base_url: str
    resolume_column: int
    request_timeout: float
    initial_backoff_seconds: float
    max_backoff_seconds: float


def _env_float(environ: Mapping[str, str], key: str, default: float) -> float:
    raw = environ.get(key)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning(
            "Ignoring non-numeric %s=%r, using default %s", key, raw, default
        )
        return default


def _env_int(environ: Mapping[str, str], key: str, default: int) -> int:
    raw = environ.get(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "Ignoring non-numeric %s=%r, using default %s", key, raw, default
        )
        return default


def load_config(environ: Mapping[str, str] | None = None) -> Config:
    """Build the daemon configuration from environment variables."""
    environ = environ if environ is not None else os.environ
    return Config(
        firebase_url=environ.get(
            "PERIMETER_FIREBASE_URL", DEFAULT_FIREBASE_URL
        ),
        resolume_base_url=environ.get(
            "PERIMETER_RESOLUME_BASE_URL", DEFAULT_RESOLUME_BASE_URL
        ),
        resolume_column=_env_int(
            environ, "PERIMETER_RESOLUME_COLUMN", DEFAULT_RESOLUME_COLUMN
        ),
        request_timeout=_env_float(
            environ, "PERIMETER_REQUEST_TIMEOUT", DEFAULT_REQUEST_TIMEOUT
        ),
        initial_backoff_seconds=_env_float(
            environ,
            "PERIMETER_INITIAL_BACKOFF_SECONDS",
            DEFAULT_INITIAL_BACKOFF,
        ),
        max_backoff_seconds=_env_float(
            environ, "PERIMETER_MAX_BACKOFF_SECONDS", DEFAULT_MAX_BACKOFF
        ),
    )


def setup_logging() -> None:
    """Send operational events to stdout and warnings/errors to stderr."""
    logger.setLevel(logging.INFO)
    logger.propagate = False
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(logging.INFO)
    stdout_handler.setFormatter(formatter)
    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setLevel(logging.WARNING)
    stderr_handler.setFormatter(formatter)
    logger.addHandler(stdout_handler)
    logger.addHandler(stderr_handler)


def iter_sse_events(lines):
    """Yield ``(event_type, data)`` tuples from an SSE line iterator.

    Supports both the standard ``event:``/``data:`` framing and the legacy
    ``put: {...}`` / ``patch: {...}`` single-line framing used by Firebase.
    Keepalive comment lines (starting with ``:``) are ignored.
    """
    event_type = None
    data_lines = []

    def flush():
        nonlocal event_type, data_lines
        if event_type is not None or data_lines:
            yield (event_type or "message", "\n".join(data_lines))
        event_type = None
        data_lines = []

    for line in lines:
        if line == "":
            for item in flush():
                yield item
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_type = line[len("event:") :].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())
        elif line.startswith("put:") or line.startswith("patch:"):
            for item in flush():
                yield item
            name, _, payload = line.partition(":")
            yield (name.strip(), payload.strip())
        # "id:", "retry:" and unrecognized lines are ignored.

    for item in flush():
        yield item


def extract_state(payload: dict) -> object:
    """Return the desired perimeter state from an SSE event payload.

    The payload comes from a stream on the ``state`` child, so ``path == "/"`
    normally carries the scalar state value directly. The handler also accepts
    a whole-node payload (``{"enabled": ..., "state": ...}``) and nested
    ``/state`` paths for robustness.
    """
    if not isinstance(payload, dict):
        return None
    path = payload.get("path", "/")
    data = payload.get("data")
    if path == "/state":
        return data
    if isinstance(data, dict):
        return data.get("state")
    if path in ("/", ""):
        return data
    return None


class ResolumeClient:
    """Thin wrapper around Resolume Arena's HTTP API."""

    def __init__(self, base_url: str, column: int, timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.column = column
        self.timeout = timeout

    def apply_state(self, state: str) -> None:
        if state == "on":
            url = (
                f"{self.base_url}{RESOLUME_ON_PATH.format(column=self.column)}"
            )
        elif state == "off":
            url = f"{self.base_url}{RESOLUME_OFF_PATH}"
        else:
            raise ValueError(f"unknown perimeter state: {state!r}")
        response = requests.post(url, timeout=self.timeout)
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(
                f"Resolume {url} returned HTTP {response.status_code}"
            )


class PerimeterController:
    """Reads Firebase events and drives Resolume in a worker thread."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.resolume = ResolumeClient(
            config.resolume_base_url,
            config.resolume_column,
            config.request_timeout,
        )
        self._desired_state: str | None = None
        self._condition = threading.Condition()
        self._stop = threading.Event()

    # -- desired state --------------------------------------------------

    def _read_desired(self) -> str | None:
        with self._condition:
            return self._desired_state

    def _set_desired(self, state: str) -> None:
        with self._condition:
            self._desired_state = state
            self._condition.notify()

    def shutdown(self) -> None:
        self._stop.set()
        with self._condition:
            self._condition.notify_all()

    # -- event handling --------------------------------------------------

    def _handle_event(self, data: str) -> None:
        try:
            payload = json.loads(data)
        except ValueError as exc:
            logger.warning("Ignoring malformed event payload: %s", exc)
            return
        state = extract_state(payload)
        self._on_desired_state(state)

    def _on_desired_state(self, state: object) -> None:
        if not isinstance(state, str) or state not in VALID_STATES:
            logger.warning("Ignoring invalid perimeter state: %r", state)
            return
        logger.info("New desired perimeter state: %s", state)
        self._set_desired(state)

    # -- Firebase stream --------------------------------------------------

    @staticmethod
    def _response_lines(response) -> object:
        for line in response.iter_lines(decode_unicode=True):
            yield line.rstrip("\r")

    def _stream_forever(self) -> None:
        url = f"{self.config.firebase_url}.json"
        headers = {"Accept": "text/event-stream"}
        logger.info("Connecting to Firebase stream: %s", url)
        with requests.get(
            url,
            stream=True,
            timeout=self.config.request_timeout,
            headers=headers,
        ) as response:
            if response.status_code != 200:
                raise ConnectionError(
                    f"Firebase returned HTTP {response.status_code}"
                )
            logger.info("Firebase stream connected")
            for event, data in iter_sse_events(self._response_lines(response)):
                if event in ("put", "patch"):
                    self._handle_event(data)

    # -- Resolume application ----------------------------------------------

    def _applicator_loop(self) -> None:
        while not self._stop.is_set():
            with self._condition:
                while self._desired_state is None and not self._stop.is_set():
                    self._condition.wait()
                if self._stop.is_set():
                    break
                target = self._desired_state
                self._desired_state = None
            if target is None:
                continue
            self._apply_with_retries(target)

    def _apply_with_retries(self, target: str) -> None:
        backoff = self.config.initial_backoff_seconds
        while not self._stop.is_set():
            with self._condition:
                if self._desired_state is not None:
                    logger.info(
                        "Superseded by newer state before applying %s", target
                    )
                    return
            try:
                self.resolume.apply_state(target)
            except Exception as exc:  # noqa: BLE001 - retry loop
                logger.error(
                    "Failed to apply state %s to Resolume: %s", target, exc
                )
                with self._condition:
                    if self._desired_state is not None:
                        logger.info(
                            "Superseded by newer state during retry of %s",
                            target,
                        )
                        return
                    self._condition.wait(timeout=backoff)
                backoff = min(backoff * 2, self.config.max_backoff_seconds)
                continue
            logger.info("Applied state %s to Resolume", target)
            return

    # -- lifecycle ----------------------------------------------------------

    def run(self) -> None:
        applicator = threading.Thread(
            target=self._applicator_loop,
            name="resolume-applicator",
            daemon=True,
        )
        applicator.start()
        while not self._stop.is_set():
            try:
                self._stream_forever()
                logger.info("Firebase stream disconnected")
            except Exception as exc:  # noqa: BLE001 - reconnect loop
                logger.error("Firebase stream error: %s", exc)
            self._sleep_backoff()

    def _sleep_backoff(self) -> None:
        self._stop.wait(self.config.initial_backoff_seconds)


def main() -> None:
    setup_logging()
    config = load_config()
    controller = PerimeterController(config)
    try:
        controller.run()
    except KeyboardInterrupt:
        controller.shutdown()
        logger.info("Shutting down")


if __name__ == "__main__":
    main()
