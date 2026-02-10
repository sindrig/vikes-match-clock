import dataclasses
import datetime
import json
import typing
import urllib.parse
import urllib.request

import bs4
import requests
from rapidfuzz import fuzz
from src.client import ksi_client, sex_map_reverse
from src.models import (
    Error,
    Match,
    MatchListMatch,
    MatchReport,
    PlayerMatch,
    PlayerSearchResult,
    Team,
)


class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return super().default(o)


def get_report(query: dict):
    try:
        match_id = int(query["matchId"])
    except KeyError:
        return {
            "error": {
                "key": "BAD_INPUT",
                "text": "matchId missing: {query}",
            }
        }
    except ValueError:
        return {
            "error": {
                "key": "BAD_INPUT",
                "text": "matchId must be integers",
            }
        }
    players = ksi_client.get_players(match_id=match_id)
    if isinstance(players, Error):
        return {"error": players}
    return MatchReport(players=players)


def get_date(query):
    if "date" in query:
        return datetime.datetime.strptime(query["date"], "%Y-%m-%d").date()
    else:
        return datetime.date.today()


def get_team(cell: bs4.Tag) -> Team:
    name = cell.text.strip().rstrip(".")
    team_link = cell.find("a")
    team_id = None
    if team_link and isinstance(team_link, bs4.Tag):
        parsed = urllib.parse.urlparse(team_link.attrs["href"])
        qs = urllib.parse.parse_qs(parsed.query)
        team_id = qs["lid"][0]
    assert team_id is not None
    return Team(name=name, id=int(team_id))


def get_matches(query: dict) -> typing.Generator[MatchListMatch, None, None]:
    date = get_date(query)
    location = query["location"]
    assert isinstance(location, str) and location.isdigit()
    r = requests.get(
        "https://www.ksi.is/mot/felog/leikir-felaga/",
        params={
            "Search": True,
            "felag": "",
            "vollur": query["location"],
            "flokkur": "",
            "kyn": "",
            "dagsfra": date.strftime("%d.%m.%Y"),
            "dagstil": date.strftime("%d.%m.%Y"),
        },
    )
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, "html.parser")
    matching_matches: dict[str, list[Match] | Error] = {}
    for row in soup.select("table tbody tr"):
        cells = row.select("td")
        if len(cells) < 2:
            continue
        match_link = cells[6].find("a")
        match_id = None
        time = cells[1].text.strip()
        home_team = get_team(cells[4])
        away_team = get_team(cells[5])
        if match_link and isinstance(match_link, bs4.Tag):
            parsed = urllib.parse.urlparse(match_link.attrs["href"])
            qs = urllib.parse.parse_qs(parsed.query)
            match_id = int(qs["leikur"][0])
        elif home_team.id and away_team.id:
            try:
                hours, minutes = map(int, time.split(":"))
            except ValueError:
                print("Could not parse time", time)
            else:
                cache_key = f"{home_team.id}-{away_team.id}"
                if cache_key not in matching_matches:
                    matching_matches[cache_key] = ksi_client.get_matches(
                        home_team=home_team.id,
                        away_team=away_team.id,
                        date=date,
                        pitch_id=int(location),
                    )
                matches = matching_matches[cache_key]

                if not isinstance(matches, Error):
                    for match in matches:
                        if (
                            match.starts.hour == hours
                            and match.starts.minute == minutes
                        ):
                            match_id = match.match_id
        if match_id:
            yield MatchListMatch(
                date=cells[0].text.strip(),
                competition=cells[2].text.strip(),
                time=time,
                home=home_team,
                away=away_team,
                match_id=match_id,
            )


def search_for_player(query: dict):
    name = query.get("playerName", "").lower()
    if not name:
        return {"error": "playerName parameter missing"}

    team = query.get("teamId")
    if not team or not team.isdigit():
        return {"error": "teamId parameter missing or invalid"}
    team = int(team)

    group = query.get("group")
    if not group:
        return {"error": "group parameter missing"}

    sex = query.get("sex")
    if not sex or sex not in sex_map_reverse:
        return {"error": "sex parameter missing or invalid"}

    matches = ksi_client.get_matches(
        home_team=team,
        group=group,
        sex=sex_map_reverse[sex],
        date=datetime.datetime.now() - datetime.timedelta(days=40),
        date_to=datetime.datetime.now(),
        away_team=None,
    )
    if isinstance(matches, Error):
        return {"error": matches}
    for match in matches:
        players = ksi_client.get_players(match_id=match.match_id)
        if not isinstance(players, Error):
            for player in players.get(team, []):
                if player.name.strip().lower() == name:
                    return player
    return {"error": "Player not found"}


def _get_team_players(
    team_id: int, group: str, sex: str
) -> dict[int, tuple[str, int]] | Error:
    """
    Fetch all players from recent matches for a team.
    Returns dict mapping player_id -> (name, number).
    """
    matches = ksi_client.get_matches(
        home_team=team_id,
        group=group,
        sex=sex_map_reverse[sex],
        date=datetime.datetime.now() - datetime.timedelta(days=60),
        date_to=datetime.datetime.now(),
        away_team=None,
    )
    if isinstance(matches, Error):
        return matches

    all_players: dict[int, tuple[str, int]] = {}
    for match in matches:
        players = ksi_client.get_players(match_id=match.match_id)
        if not isinstance(players, Error):
            for player in players.get(team_id, []):
                all_players[player.id] = (player.name.strip(), player.number)
    return all_players


def batch_search_players(query: dict, body: dict) -> tuple[int, dict[str, typing.Any]]:
    team = query.get("teamId")
    if not team or not team.isdigit():
        return (400, {"error": "teamId parameter missing or invalid"})
    team_id = int(team)

    group = query.get("group")
    if not group:
        return (400, {"error": "group parameter missing"})

    sex = query.get("sex")
    if not sex or sex not in sex_map_reverse:
        return (400, {"error": "sex parameter missing or invalid"})

    player_names = body.get("playerNames", [])
    if not player_names or not isinstance(player_names, list):
        return (400, {"error": "playerNames array required in request body"})

    all_players = _get_team_players(team_id, group, sex)
    if isinstance(all_players, Error):
        return (502, {"error": all_players.error})

    if not all_players:
        return (404, {"error": "No players found in recent matches"})

    results: list[PlayerSearchResult] = []
    for search_name in player_names:
        if not isinstance(search_name, str):
            continue

        scored_matches: list[tuple[float, int, str, int]] = []
        for player_id, (name, number) in all_players.items():
            score = fuzz.token_sort_ratio(search_name.lower(), name.lower())
            scored_matches.append((score, player_id, name, number))

        scored_matches.sort(key=lambda x: -x[0])
        top_matches = [
            PlayerMatch(
                id=player_id,
                name=name,
                number=number,
                confidence=score,
            )
            for score, player_id, name, number in scored_matches[:5]
        ]

        results.append(PlayerSearchResult(search_name=search_name, matches=top_matches))

    return (200, {"results": results})


class IsDataclass(typing.Protocol):
    # as already noted in comments, checking for this attribute is currently
    # the most reliable way to ascertain that something is a dataclass
    __dataclass_fields__: typing.ClassVar[dict[str, typing.Any]]


def respond(status_code: int, body: dict | IsDataclass):
    return {
        "statusCode": status_code,
        "body": json.dumps(body, cls=EnhancedJSONEncoder),
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
        },
    }


def lambda_handler(json_input, context):
    print(json_input)
    query = json_input.get("queryStringParameters") or {}
    body = {}
    if json_input.get("body"):
        try:
            body = json.loads(json_input["body"])
        except json.JSONDecodeError:
            pass
    match query.get("action", "not-found"):
        case "get-matches":
            return respond(200, {"matches": list(get_matches(query))})
        case "get-report":
            return respond(200, get_report(query))
        case "search-for-player":
            return respond(200, search_for_player(query))
        case "batch-search-players":
            status, result = batch_search_players(query, body)
            return respond(status, result)
    return respond(400, {"error": "Action not found"})


if __name__ == "__main__":
    print(
        lambda_handler(
            # {"queryStringParameters": {"location": 2621}},
            # {"queryStringParameters": {"location": "102", "action": "get-matches"}},
            # {"queryStringParameters": {"matchId": "638172", "action": "get-report"}},
            {
                "queryStringParameters": {
                    "action": "search-for-player",
                    "playerName": "Karl Friðleifur Gunnarsson",
                    "teamId": "103",
                    "group": "Meistaraflokkur",
                    "sex": "kk",
                }
            },
            {},
        )
    )
