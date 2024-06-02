import base64
import datetime
import itertools
import json
import traceback
import urllib.request
from string import Template
from urllib.parse import urlparse

from src.client import ksi_client
from src.errors import ApiError
from src.models import ErrorDict, MatchInfo
from src.uefa import get_match as get_uefa_match
from src.xlsx import match_to_xlsx

VIKES = "103"


def no_match_found(home_team, away_team) -> ErrorDict:
    return {
        "error": {
            "key": "NO_MATCH_FOUND",
            "text": "No match found for these teams (%s-%s)"
            % (
                home_team,
                away_team,
            ),
        }
    }


def get_date(query):
    if "date" in query:
        return datetime.datetime.strptime(query["date"], "%Y-%m-%d").date()
    else:
        return datetime.date.today()


def clock_main(query, context):
    date = get_date(query)
    try:
        home_team = int(query["homeTeam"])
        away_team = int(query["awayTeam"])
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
    matches = ksi_client.get_matches(home_team, away_team, date)
    if not matches:
        return no_match_found(home_team, away_team)
    elif isinstance(matches, dict):
        if "error" in matches:
            return matches
        raise ValueError(f"Unknown matches {matches}")
    result = {
        "matches": {},
    }
    for match in matches:
        try:
            players = ksi_client.get_players(match.match_id)
            if players and "error" not in players:
                if str(home_team) not in players:
                    players[str(home_team)] = []
                if str(away_team) not in players:
                    players[str(away_team)] = []
                result["matches"][match.match_id] = {
                    "players": players,
                    "group": match.group,
                    "sex": match.sex,
                }
        except Exception:
            pass
    if not result["matches"]:
        return no_match_found(home_team, away_team)
    return result


def lambda_handler(json_input, context):
    print(json_input)
    errors = ""
    match = None
    query = json_input["queryStringParameters"] or {}
    try:
        if "debug" in query:
            errors = urllib.request.urlopen("https://api.ipify.org").read().decode()
        elif "homeTeam" in query and "awayTeam" in query:
            data = clock_main(query, context)
            return {
                "statusCode": 200,
                "body": json.dumps(data),
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                },
            }
        elif "download" in query:
            if query["download"].isdigit():
                try:
                    info = ksi_client.get_players(query["download"])
                    if "error" in info:
                        errors = str(info)
                    else:
                        (
                            (home_team_name, home_team),
                            (
                                away_team_name,
                                away_team,
                            ),
                        ) = info.items()
                        match = MatchInfo(
                            match_name=query["download"],
                            home_team_name=home_team_name,
                            away_team_name=away_team_name,
                            home_team=home_team,
                            away_team=away_team,
                        )

                except Exception:
                    traceback.print_exc()
                    errors = "Match not found"
            else:
                parsed_url = urlparse(query["download"])
                if parsed_url.netloc.endswith("uefa.com"):
                    parts = list(
                        itertools.chain(
                            *[part.split("-") for part in parsed_url.path.split("/")]
                        )
                    )
                    for part in parts:
                        if part.isdigit():
                            try:
                                match = get_uefa_match(part)
                            except ApiError as e:
                                errors = e
                            break
                    else:
                        errors = "No match found in query"
                else:
                    errors = f"Unknown url to download: {query['download']}"
            if match:
                buffer = match_to_xlsx(match)
                return {
                    "statusCode": 200,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "*",
                        "Content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "Content-Disposition": f'attachment; filename="{match.match_name}.xlsx"',
                    },
                    "isBase64Encoded": True,
                    "body": base64.b64encode(buffer),
                }
        with open("index.html", "r") as f:
            return {
                "statusCode": 200,
                "body": Template(f.read()).substitute(errors=errors),
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "text/html; charset=utf-8",
                },
            }

    except ApiError:
        return {
            "statusCode": 500,
            "body": str(ApiError),
            "headers": {
                "Access-Control-Allow-Origin": "*",
            },
        }


if __name__ == "__main__":
    print(
        lambda_handler(
            {
                "queryStringParameters": {
                    "download": "https://www.uefa.com/european-qualifiers/match/2036448--iceland-vs-luxembourg/"
                }
            },
            {},
        )
    )
