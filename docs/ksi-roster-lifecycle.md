# KSI request lifetime and roster resolution

Issue #249 uses one `KsiClient` and its owned `httpx.AsyncClient` for each
FastAPI request. `get_ksi_client` yields the client, then closes it on the
same event loop after success, errors, timeout, or cancellation. The
client's history cache is request-local. The existing lazy SSM client and
successful API-key caches retain their process lifetime; no lineup or
roster cache is shared between requests.

## Budget and failure behavior

The dependency starts one absolute 10-second work deadline before
admission. That deadline covers admission, key lookup and all endpoint work,
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
does not block the event loop. The application lifespan explicitly owns
one `KsiKeyLookups` on its serving asyncio loop. A child task acquires its
`asyncio.BoundedSemaphore`, checks closure and absolute expiry, then marks
itself admitted without suspending between these steps. Python 3.12's
semaphore reserves capacity for notified waiters, forwards reservations
on cancellation and keeps surviving waiters in FIFO order. Each admitted
child uses a private, uncontended one-token AnyIO limiter for physical
worker offload and keeps its semaphore permit until that offload finishes
or raises. Submission failure also returns the permit.

The caller awaits the child through `asyncio.shield`. Caller timeout or
cancellation removes unadmitted children promptly without cancelling
admitted owners or releasing their capacity. Strong task references and
completion callbacks cover cancellation before the coroutine starts and
retrieve late exceptions. After the key result, a cancellation checkpoint
and explicit absolute-expiry check precede HTTP construction. The deadline
never resets and a background lookup never constructs an HTTP client.

Shutdown closes admission before suspending, cancels queued children and
drains admitted owners on their loop. AnyIO shielding plus a retrying
`asyncio.shield` wait defers repeated native `Task.cancel()` until the
drain completes, then propagates that cancellation. The owner stays in
application state during drain; overlapping lifespans are rejected. A
subsequent lifespan creates fresh state, including on a new TestClient
loop. Tests enter the actual lifespan because HTTPX ASGI transport alone
does not run it.

### Deliberate capacity contract

KSI SSM admission has fixed capacity **C=40 per serving loop**, initially
matching the former nominal default limit. Tests configure C directly to
one or two. KSI offloads no longer borrow default AnyIO tokens. Changing
the default limit **G** does not resize C: unrelated default-limited work
retains G and combined nominal admission is **C+G**. This is not a proven
global thread bound. The pinned default AnyIO limiter's inherited races
remain outside this scoped repair, and weather's synchronous key lookup
is outside the KSI gate. Multiple loops, processes and Lambda instances
multiply capacity. No framework upgrade, private AnyIO patch or new cache
is involved.

Python cannot stop a synchronous SSM call already running. It may finish
and populate the existing successful-key cache, but no HTTP client is
constructed after its request has ended. The lazy shared SSM client uses
two-second connect and read timeouts with standard retries capped at two
total attempts (the first call and at most one retry). This leaves room
within the ten-second work budget for normal SDK connection/read waits
and retry backoff. These are per-operation limits, not a hard wall-clock
bound on DNS, credential discovery, or trickling response bodies;
capacity stays occupied if synchronous work outlasts the caller. A
permanently stuck call permanently holds a slot and can prevent graceful
drain; process termination is the final boundary. No new
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

The shared SSM/key functions also serve weather. The bounded SDK settings
apply to that shared client; separate successful-key caches, failure
retries on subsequent lookups, and lazy import/health/export behavior are
preserved. Weather request handling is outside this change.

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

The SSM capacity regression uses three waves of two cold requests with
KSI capacity C=2 and blocked mock SSM calls.
On `2eed63fc`, actual active workers grow **2 → 4 → 6** while every
request returns 504. With the repair, workers stay **2 → 2 → 2** and
every wave still completes at its shortened deadline. It also cancels
queued requests through both asyncio and AnyIO, checks that they never
reach SSM, then releases the first workers and verifies queued recovery.
Both late success and late failure are covered: successful keys remain
cached, failures allow retry, no late HTTP client is allocated, all
capacity and retained tasks are released, and no background exception
is left unhandled. JUnit output records worker counts and wave timings.
The R1 repair passed 93 tests, but R2 exposed a separate handoff defect in
the pinned AnyIO 3.7.1 limiter: a cancelled notified child could strand a
live waiter with zero workers. A real-worker completion probe on
`d1d732f7` returned 504 for that survivor; the repaired ordering returns
200 without another release or waiting for the queue to expire. R2 also
demonstrated an inherited fresh-arrival reservation race on both baseline
and that head (two actual workers at nominal capacity one). It was not
introduced by this PR. The new KSI gate prevents that ordering from
oversubscribing C; unrelated default-limited work retains the inherited
limitation.

`test_ssm_admission.py` ports the real-worker delivery ordering and tests
both cancellation/release callback orders at C=1/2, the actual deadline
callback, FIFO with head/middle/tail cancellation and multiple releases,
newcomer reservation, cancellation before child start and after admission
before submission, key-result/cancellation and absolute-expiry boundaries,
task/submission failures, independent KSI/default budgets, shutdown with
blocked workers and queued children, repeated native/AnyIO shutdown
cancellation, overlapping lifecycle rejection and fresh TestClient loops.
It asserts actual worker entries and peaks, retained tasks, waiters,
HTTP allocations, same-loop closure and retrieved background failures.
The existing late-success/failure waves also verify retry and successful
key-cache behavior. The repaired Python 3.12 suite passes **123 tests**
with one existing placeholder skipped and resource/runtime warnings
treated as errors. The real-worker handoff survivor completes in 2.8 ms
within its 250 ms budget; peak KSI workers remain one, and active workers,
waiters and retained tasks all drain to zero. The independent-pool test
holds one actual KSI worker and one actual default-limited worker
simultaneously at C=G=1. These are controlled local interleavings, not a
measurement of production race frequency.

The local uvicorn/TCP matrix also covers success, upstream status failure,
dropped connections, stalled headers, trickling bodies and malformed JSON
on all five KSI routes, plus asyncio/AnyIO cancellation on each route.
All 43 created HTTP clients and upstream connections close on their
creation loop. The unshortened request deadline returns 504 in 10.042 s.
A real botocore client against a loopback mock server retains two-second
connect/read limits, two total attempts, failure retry and separate
KSI/weather success caches. Four fixtures plus 1,000 seeded generated
rosters still match the baseline in every serialized field. No external
services are contacted by these checks.

`test_default_budget_closes_real_loopback_connection_before_gateway`
also opens a local TCP server on an ephemeral loopback port, accepts a
request without replying, and uses the unchanged production deadline.
It requires a 504 in under 12 seconds and observes the peer connection
closing. JUnit output records elapsed time and closure evidence. All
external services are mocked; the only TCP connection is loopback. The
repaired suite recorded a 504 after 10.014 seconds with the connection
closed.

Run from `clock-api/v3` with Python 3.12 and the development dependencies:

```bash
python -m pytest tests -q -W error::ResourceWarning -W error::RuntimeWarning
python -m black --check --line-length 79 --skip-string-normalization \
  app/dependencies.py app/main.py app/services/ksi.py tests/conftest.py \
  tests/test_dependencies.py tests/test_handler.py tests/test_integration.py \
  tests/test_openapi.py tests/roster_data.py tests/test_roster_resolution.py \
  tests/test_ksi_lifecycle.py tests/test_ssm_admission.py
```

Black 26.10.1 passes for all changed Python files. Checking the entire API
also flags the existing long `VEDUR_URL` assignment in `test_weather.py`,
which is unchanged from `3cb6f517`.

The existing offline OpenAPI test independently forbids AWS construction
and outbound sockets while exporting the schema and serving health, and
compares the export byte for byte with the tracked contract.
