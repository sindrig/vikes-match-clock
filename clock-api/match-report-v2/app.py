import dataclasses
import datetime
import json
import typing
import urllib.parse
import urllib.request

import bs4
import requests
from src.client import ksi_client
from src.models import Error, Match, MatchListMatch, MatchReport, Team


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
    match query.get("action", "not-found"):
        case "get-matches":
            return respond(200, {"matches": list(get_matches(query))})
        case "get-report":
            return respond(200, get_report(query))
    return respond(400, {"error": "Action not found"})


if __name__ == "__main__":
    print(
        lambda_handler(
            # {"queryStringParameters": {"location": 2621}},
            # {"queryStringParameters": {"location": "102", "action": "get-matches"}},
            {"queryStringParameters": {"matchId": "638172", "action": "get-report"}},
            {},
        )
    )
