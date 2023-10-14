import base64
import datetime
import json
import urllib.request

from .client import ksi_client
from .xlsx import ApiError, match_to_xlsx

VIKES = '103'


def no_match_found(home_team, away_team):
    return {
        'error': {
            'key': 'NO_MATCH_FOUND',
            'text': 'No match found for these teams (%s-%s)'
            % (
                home_team,
                away_team,
            ),
        }
    }


def main(query, context):
    if 'date' in query:
        date = datetime.datetime.strptime(query['date'], '%Y-%m-%d').date()
    else:
        date = datetime.date.today()
    try:
        home_team = int(query['homeTeam'])
        away_team = int(query['awayTeam'])
    except KeyError:
        return {
            'error': {
                'key': 'BAD_INPUT',
                'text': 'homeTeam or awayTeam missing: {query}',
            }
        }
    except ValueError:
        return {
            'error': {
                'key': 'BAD_INPUT',
                'text': 'homeTeam and awayTeam must be integers',
            }
        }
    matches = ksi_client.get_matches(home_team, away_team, date)
    if not matches:
        return no_match_found(home_team, away_team)
    elif isinstance(matches, dict):
        if 'error' in matches:
            return matches
        raise ValueError(f'Unknown matches {matches}')
    result = {
        'matches': {},
    }
    for match in matches:
        try:
            players = ksi_client.get_players(match.match_id)
            if players and 'error' not in players:
                if str(home_team) not in players:
                    players[str(home_team)] = []
                if str(away_team) not in players:
                    players[str(away_team)] = []
                result['matches'][match.match_id] = {
                    'players': players,
                    'group': match.group,
                    'sex': match.sex,
                }
        except:
            pass
    if not result['matches']:
        return no_match_found(home_team, away_team)
    return result


def lambda_handler(json_input, context):
    print(json_input)
    query = json_input['queryStringParameters'] or {}
    try:
        if 'debug' in query:
            data = {
                'ip': urllib.request.urlopen('https://api.ipify.org')
                .read()
                .decode()
            }
        elif 'homeTeam' in query and 'awayTeam' in query:
            data = main(query, context)
        elif 'download' in query:
            buffer = match_to_xlsx(query['download'])
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': "*",
                    'Access-Control-Allow-Methods': "*",
                    'Content-type': "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    'Content-Disposition': f'attachment; filename="{query["download"]}.xlsx"',
                },
                'isBase64Encoded': True,
                'body': base64.b64encode(buffer),
            }
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'BAD_INPUT', 'query': query}),
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                },
            }
        return {
            'statusCode': 200,
            'body': json.dumps(data),
            'headers': {
                'Access-Control-Allow-Origin': '*',
            },
        }
    except ApiError:
        return {
            'statusCode': 500,
            'body': str(ApiError),
            'headers': {
                'Access-Control-Allow-Origin': '*',
            },
        }


if __name__ == '__main__':
    print(
        lambda_handler(
            {'queryStringParameters': {'homeTeam': 103, 'awayTeam': 220}},
            {},
        )
    )
