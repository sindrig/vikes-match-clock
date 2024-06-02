import dataclasses
import datetime
import json
import urllib.parse
import urllib.request

import bs4
import requests
from src.client import ksi_client
from src.models import Error, Match, MatchListMatch, Team


class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return super().default(o)


# def get_report(match_id: str):
#     players = ksi_client.get_players(match_id)
#     if players and "error" not in players:
#         if str(home_team) not in players:
#             players[str(home_team)] = []
#         if str(away_team) not in players:
#             players[str(away_team)] = []
#         result["matches"][match.match_id] = {
#             "players": players,
#             "group": match.group,
#             "sex": match.sex,
#         }


def clock_main(query, context):
    date = get_date(query)
    try:
        home_team = int(query["homeTeam"])
        away_team = int(query["awayTeam"])
        pitch_id = int(query["pitchId"])
    except KeyError:
        return {
            "error": {
                "key": "BAD_INPUT",
                "text": "homeTeam or awayTeam missing: {query}",
            }
        }
    except ValueError:
        return {
            "error": {
                "key": "BAD_INPUT",
                "text": "homeTeam and awayTeam must be integers",
            }
        }
    pitch_id = None
    matches = ksi_client.get_matches(home_team, away_team, date, pitch_id)
    if not matches:
        return no_match_found(home_team, away_team)
    elif isinstance(matches, dict):
        if "error" in matches:
            return matches
        raise ValueError(f"Unknown matches {matches}")
    return {
        "matches": [
            {
                "group": match.group,
                "starts": match.starts,
                "id": match.match_id,
                "home": match.home_team,
                "away": match.away_team,
            }
            for match in matches
        ]
    }


def get_date(query):
    if "date" in query:
        return datetime.datetime.strptime(query["date"], "%Y-%m-%d").date()
    else:
        return datetime.date.today()


def get_team(cell: bs4.Tag) -> Team:
    name = cell.text.strip()
    team_link = cell.find("a")
    team_id = None
    if team_link and isinstance(team_link, bs4.Tag):
        parsed = urllib.parse.urlparse(team_link.attrs["href"])
        qs = urllib.parse.parse_qs(parsed.query)
        team_id = qs["lid"][0]
    assert team_id is not None
    return Team(name=name, id=int(team_id))


def get_matches(query: dict):
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
                time=time,
                home=home_team,
                away=away_team,
                match_id=match_id,
            )


def respond(status_code: int, body: dict):
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
            return respond(200, clock_main(query, context))
    return respond(400, {"error": "Action not found"})


if __name__ == "__main__":
    print(
        lambda_handler(
            # {"queryStringParameters": {"location": 2621}},
            {"queryStringParameters": {"location": "102", "action": "get-matches"}},
            # {"queryStringParameters": {"matchId": "102", "action": "get-report"}},
            {},
        )
    )
