import argparse
import datetime
import pprint
import json
from collections import defaultdict, namedtuple
from suds.client import Client

WSDL_URL = 'http://www2.ksi.is/vefthjonustur/mot.asmx?WSDL'
VIKES = '103'

client = Client(WSDL_URL)
Match = namedtuple('Match', ('match_id', 'group', ))

STARTER_ROLES = [
    'Markmaður',
    'Leikmaður',
    'Fyrirliði',
    'Fyrirliði/markmaður',
]


def get_player(player):
    return {
        'number': player.TreyjuNumer and int(player.TreyjuNumer),
        'name': player.LeikmadurNafn.strip(),
        'role': player.StadaNafn,
        'show': player.StadaNafn in STARTER_ROLES,
    }


def get_matches(home_team, away_team, date):
    result = client.service.FelogLeikir(
        FelagNumer=home_team,
        DagsFra=date - datetime.timedelta(10),
        DagsTil=date + datetime.timedelta(10),
        Kyn='',
        FlokkurNumer='',
        VollurNumer='',
    )

    if hasattr(result, 'Villa'):
        return {
            'error': {
                'key': 'UPSTREAM_ERROR',
                'text': result.Villa,
            }
        }
    gameArray = result.ArrayFelogLeikir
    if not gameArray:
        return
    games = gameArray.FelogLeikir
    matches = []
    for game in games:
        print(game.FelagHeimaNafn, '-', game.FelagUtiNafn)
        if (
            game.FelagHeimaNumer == home_team and
            game.FelagUtiNumer == away_team
        ):
            print('Found match: %s' % (game.LeikurNumer, ))
            matches.append(Match(game.LeikurNumer, game.Flokkur))
    return matches


def player_sort_key(p):
    n = int(p.TreyjuNumer) if p.TreyjuNumer else 999
    if p.StadaNafn in STARTER_ROLES:
        if 'markmaður' in p.StadaNafn.lower():
            return n / 1000
        return n / 100
    return n


def get_players(match_id):
    game = client.service.LeikurLeikmenn(LeikurNumer=match_id)
    result = defaultdict(list)
    captains = {}
    if not game.ArrayLeikurLeikmenn:
        return {
            'error': {
                'key': 'NO_PLAYERS',
                'text': 'No players found for game %s' % (match_id, ),
            }
        }
    for player in sorted(
        game.ArrayLeikurLeikmenn.LeikurLeikmenn,
        key=player_sort_key,
    ):
        club_id = str(player.FelagNumer)
        player_dict = get_player(player)
        if (
            club_id in captains and
            captains[club_id]['number'] < player_dict['number']
        ):
            result[club_id].append(captains[club_id])
            del captains[club_id]
        if player_dict['role'] == 'Fyrirliði':
            captains[club_id] = player_dict
        else:
            result[club_id].append(player_dict)
    return dict(result)


def no_match_found(home_team, away_team):
    return {
        'error': {
            'key': 'NO_MATCH_FOUND',
            'text': 'No match found for these teams (%s-%s)' % (
                home_team, away_team,
            )
        }
    }


def main(json_input, context):
    date = datetime.date.today()
    try:
        home_team = int(json_input['homeTeam'])
        away_team = int(json_input['awayTeam'])
    except ValueError:
        return {
            'error': {
                'key': 'BAD_INPUT',
                'text': 'homeTeam and awayTeam must be integers',
            }
        }
    matches = get_matches(home_team, away_team, date)
    if not matches:
        return no_match_found(home_team, away_team)
    elif isinstance(matches, dict) and 'error' in matches:
        return matches
    result = {
        'matches': {},
    }
    for match in matches:
        players = get_players(match.match_id)
        if players and 'error' not in players:
            result['matches'][match.match_id] = {
                'players': players,
                'group': match.group,
            }
    if not result['matches']:
        return no_match_found(home_team, away_team)
    return result


def handler(json_input, context):

    if 'queryStringParameters' in json_input:
        json_input = json_input['queryStringParameters']
    data = main(json_input, context)
    return {
        # TODO think about other status codes
        'statusCode': 200,
        'body': json.dumps(data),
        'headers': {
            'Access-Control-Allow-Origin': '*',
        },
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('home_team', type=int)
    parser.add_argument('away_team', type=int)
    args = parser.parse_args()
    pprint.pprint(
        json.loads(
            handler(
                {'homeTeam': args.home_team, 'awayTeam': args.away_team},
                None
            )['body']
        )
    )
