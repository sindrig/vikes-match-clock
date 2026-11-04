import copy
import json
from pathlib import Path

import pytest
import respx

from tests.roster_data import lineup, match, player, roster_cases

BASE_URL = "https://api-ksi.analyticom.de"
HISTORY_PATH = "/api/live/team/1/matches/paginated/past/0"
BASELINE = json.loads(
    (Path(__file__).parent / "fixtures" / "roster_baseline.json").read_text()
)


@pytest.mark.asyncio
@pytest.mark.parametrize("case", roster_cases(), ids=lambda case: case["name"])
async def test_complete_roster_matches_captured_baseline(ksi_client, case):
    payload = (
        {"result": case["history"]}
        if case["history_envelope"]
        else case["history"]
    )
    with respx.mock as upstream:
        upstream.get(f"{BASE_URL}{HISTORY_PATH}").respond(200, json=payload)
        for match_id in case["fetched"]:
            upstream.get(
                f"{BASE_URL}/api/live/match/{match_id}/lineups"
            ).respond(200, json=case["lineups"][str(match_id)])

        result = await ksi_client.resolve_roster(
            case["starters"], case["substitutes"]
        )
        requests = [call.request for call in upstream.calls]

    assert result.model_dump(mode="json") == BASELINE[case["name"]]
    assert [request.url.path for request in requests] == [
        HISTORY_PATH,
        *[f"/api/live/match/{mid}/lineups" for mid in case["fetched"]],
    ]
    assert dict(requests[0].url.params) == {
        "page": "1",
        "pageSize": "10",
        "teamIdFilter": "1",
    }


@pytest.mark.asyncio
@respx.mock
async def test_resolving_only_remaining_substitute_stops_before_older_match(
    ksi_client,
):
    history = [match(1, 15, 1, 2), match(2, 8, 2, 1), match(3, 1, 1, 2)]
    respx.get(f"{BASE_URL}{HISTORY_PATH}").respond(200, json=history)
    respx.get(f"{BASE_URL}/api/live/match/1/lineups").respond(
        200,
        json={
            "home": lineup([player(n, f"New {n}", n) for n in range(1, 12)]),
            "away": lineup([]),
        },
    )
    respx.get(f"{BASE_URL}/api/live/match/2/lineups").respond(
        200,
        json={
            "home": lineup([]),
            "away": lineup(
                [player(9, "Old Nine", 99), player(12, "Reserve", 12)]
            ),
        },
    )

    result = await ksi_client.resolve_roster(list(range(1, 12)), [12])

    assert [p.person.name for p in result.players] == [
        *[f"New {n}" for n in range(1, 12)],
        "Reserve",
    ]
    assert result.players[-1].startingLineup is False
    assert len(respx.calls) == 3


@pytest.mark.asyncio
@respx.mock
async def test_duplicate_number_in_newest_lineup_keeps_first_player(
    ksi_client,
):
    case = copy.deepcopy(roster_cases()[3])
    case["lineups"]["101"]["home"]["players"].insert(
        9, player(9, "Later Duplicate", 9999, captain=True, goalkeeper=True)
    )
    respx.get(f"{BASE_URL}{HISTORY_PATH}").respond(200, json=case["history"])
    respx.get(f"{BASE_URL}/api/live/match/101/lineups").respond(
        200, json=case["lineups"]["101"]
    )

    result = await ksi_client.resolve_roster(
        case["starters"], case["substitutes"]
    )

    assert result.model_dump(mode="json") == BASELINE[case["name"]]


@pytest.mark.asyncio
@respx.mock
async def test_equal_match_dates_preserve_upstream_order(ksi_client):
    case = copy.deepcopy(roster_cases()[1])
    case["history"][0]["dateTimeUTC"] = "2026-06-15T14:00:00Z"
    respx.get(f"{BASE_URL}{HISTORY_PATH}").respond(200, json=case["history"])
    for match_id in (102, 101):
        respx.get(f"{BASE_URL}/api/live/match/{match_id}/lineups").respond(
            200, json=case["lineups"][str(match_id)]
        )

    result = await ksi_client.resolve_roster(
        case["starters"], case["substitutes"]
    )

    assert result.players[0].person.name == "Old Keeper"
    nine = next(p for p in result.players if p.shirtNumber == 9)
    assert nine.person.id == 2009
    assert nine.captain is True
    assert nine.goalkeeper is True
    assert [call.request.url.path for call in respx.calls][1:] == [
        "/api/live/match/102/lineups",
        "/api/live/match/101/lineups",
    ]


@pytest.mark.asyncio
@respx.mock
async def test_history_cache_is_local_to_one_client(ksi_client):
    route = respx.get(f"{BASE_URL}{HISTORY_PATH}").respond(200, json=[])

    first = await ksi_client.get_past_matches()
    second = await ksi_client.get_past_matches()

    assert first is second
    assert route.call_count == 1
