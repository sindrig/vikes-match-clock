# KSI request lifetime and roster resolution

Issue #249 uses one `KsiClient` and its owned `httpx.AsyncClient` for each
FastAPI request. `get_ksi_client` yields the client, then closes it on the
same event loop after success, errors, timeout, or cancellation. The
client's history cache is request-local. The existing lazy SSM client and
successful API-key caches retain their process lifetime; no lineup or
roster cache is shared between requests.

## Budget and failure behavior

The dependency starts one 10-second work timer before looking up the
team's key. That timer covers the key lookup and all endpoint work,
including every history/lineup request and response-body read. It does
not reset for each upstream call. HTTPX also retains its 10-second
per-operation timeout. Cleanup has a separate one-second limit and is
shielded from cancellation, leaving one second of margin under API
Gateway's 12-second integration timeout. A cleanup timeout is logged.

| Condition                                    | Result                                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| All requested numbers found                  | Return immediately without older lineup requests           |
| Successful search exhausts available history | Return unresolved `#number` placeholders, with person ID 0 |
| Upstream non-success HTTP status             | 502, `Upstream API responded with <status>`                |
| Upstream transport failure                   | 502, `Upstream API request failed`                         |
| HTTPX timeout or shared work deadline        | 504, `KSI request timed out`                               |
| Request cancellation                         | Propagate cancellation after bounded cleanup               |

An upstream failure during a partially resolved search fails the entire
request. Placeholders represent missing history, so an incomplete failed
search does not produce a successful partial roster. Unexpected parsing
and validation errors retain their existing error behavior, with client
cleanup still performed.

The synchronous, cached SSM lookup runs in an AnyIO worker thread and
does not block the event loop. Cancellation stops waiting for the result;
Python cannot stop the synchronous SSM call already running in that
thread. It may finish and populate the existing successful-key cache,
but no HTTP client is constructed after its request has ended. No new
single-flight or cross-request cache semantics are introduced.

The timer begins when FastAPI enters the KSI dependency. Request upload,
Lambda cold start, and API Gateway overhead precede it. Async deadlines
are cooperative; they cannot preempt synchronous Python execution or an
unresponsive cleanup implementation. Cleanup that exceeds its limit is
best effort. No deployed latency or live upstream reliability claim is
made by the local tests.

## Resolution compatibility

The first page still requests ten past matches. Sort by `dateTimeUTC`
descending, retaining upstream order for ties. Discard matches belonging
to other teams before fetching their lineups. Search only the selected
team's home or away lineup. The first player found for each requested
shirt number wins, including duplicate numbers within one lineup. Stop
only after every starter and substitute number is resolved.

Output ordering remains: the first supplied starter, the other starters
in numeric order, then substitutes in numeric order. Historical captain,
goalkeeper, and complete person fields are retained; `startingLineup`
comes from the submitted starter/substitute lists. The first starter is
not assigned a new goalkeeper flag. Historical officials are still
excluded from resolved rosters; the lineups endpoint retains its
officials and flat/nested upstream parsing.

## Consumers and scope

All production consumers of `get_ksi_client` are the five routes in
`clock-api/v3/app/routers/matches.py`: matches, lineups, events, match
info, and roster resolution. No other production code constructs a
`KsiClient`. The fixture in `tests/conftest.py` owns and closes its test
client, and the dependency tests now enter the async generator as a
context manager. Existing endpoint overrides continue to work.

The shared SSM/key functions also serve weather; their implementation,
cache lifetime, failure retries, and lazy import/health/export behavior
are unchanged. Weather request handling is outside this change.

Frontend consumers are `TodaysMatches.tsx` (matches, info, lineups),
`TeamAssetController.tsx` (lineups), and `ResolveRosterModal.tsx`
(roster). `matchUtils.ts` consumes player flags and officials. Roster
resolution already uses `throwOnError: true`. Routes, parameters, models,
and the generated OpenAPI document are unchanged, so no generated SDK,
frontend, or workflow edits are required.

## Regression evidence

`tests/fixtures/roster_baseline.json` contains complete serialized results
captured from `3cb6f517`, using synthetic local data. Both direct service
and real-dependency API tests compare every field against those results.
They cover unsorted history, home/away selection, reused shirt numbers,
captain/goalkeeper/substitute flags, full person metadata, unresolved
placeholders, empty history, and all 23 requested numbers. A differential
run of that baseline service and the new service on the committed inputs
produced identical results:

| Scenario                                     | Baseline upstream requests | Updated upstream requests |
| -------------------------------------------- | -------------------------: | ------------------------: |
| Mixed history with unrelated match           |                          5 |                         4 |
| Unresolved numbers and historical flags      |                          4 |                         3 |
| Empty history                                |                          1 |                         1 |
| All numbers present in newest of ten matches |                         11 |                         2 |

Counts include the history request. They are mock request counts, not
production latency measurements. Unnecessary lineup paths are left
unmocked in the regression tests, so fetching them fails the test.

Lifecycle tests use the real FastAPI dependency and KSI service with a
mock HTTP transport. They check all five endpoints, cumulative deadlines,
partial-search failure, slow response bodies, malformed upstream data,
HTTP/transport errors, asyncio and AnyIO cancellation, bounded cleanup,
same-loop transport closure, and request isolation. SSM tests exercise
overlapping cold lookups, concurrent health requests, cached keys,
failure retries, and timeout/cancellation without late HTTP allocation.

`test_default_budget_closes_real_loopback_connection_before_gateway`
also opens a local TCP server on an ephemeral loopback port, accepts a
request without replying, and uses the unchanged production deadline.
It requires a 504 in under 12 seconds and observes the peer connection
closing. JUnit output records elapsed time and closure evidence. All
external services are mocked; the only TCP connection is loopback.

Run from `clock-api/v3` with Python 3.12 and the development dependencies:

```bash
python -m pytest tests -q
python -m black --check --line-length 79 --skip-string-normalization \
  app/dependencies.py app/services/ksi.py tests/test_dependencies.py \
  tests/roster_data.py tests/test_roster_resolution.py tests/test_ksi_lifecycle.py
```

Black 26.10.1 passes for all changed Python files. Checking the entire API
also flags the existing long `VEDUR_URL` assignment in `test_weather.py`,
which is unchanged from `3cb6f517`.

The existing offline OpenAPI test independently forbids AWS construction
and outbound sockets while exporting the schema and serving health, and
compares the export byte for byte with the tracked contract.
