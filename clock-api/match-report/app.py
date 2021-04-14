import datetime
import json
import urllib.request
from collections import defaultdict, namedtuple
from suds.client import Client

WSDL_URL = 'http://www2.ksi.is/vefthjonustur/mot.asmx?WSDL'
VIKES = '103'

Match = namedtuple(
    'Match',
    (
        'match_id',
        'group',
    ),
)

STARTER_ROLES = [
    'Markmaður',
    'Leikmaður',
    'Fyrirliði',
    'Fyrirliði/markmaður',
]


def player_sort_key(p):
    n = int(p.TreyjuNumer) if p.TreyjuNumer else 999
    if p.StadaNafn in STARTER_ROLES:
        if 'markmaður' in p.StadaNafn.lower():
            return n / 100000
        return n / 100
    return n


class KsiClient:
    def __init__(self):
        self.client = Client(WSDL_URL, timeout=10)

    def get_player(self, player):
        if player.TreyjuNumer:
            number = int(player.TreyjuNumer)
        else:
            number = 0
        return {
            'number': number,
            'name': player.LeikmadurNafn.strip(),
            'role': player.StadaNafn,
            'show': player.StadaNafn in STARTER_ROLES,
        }

    def get_matches(self, home_team, away_team, date):
        result = self.client.service.FelogLeikir(
            FelagNumer=home_team,
            DagsFra=date - datetime.timedelta(15),
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
                game.FelagHeimaNumer == home_team
                and game.FelagUtiNumer == away_team
            ):
                print('Found match: %s' % (game.LeikurNumer,))
                matches.append(Match(game.LeikurNumer, game.Flokkur))
        return matches

    def get_players(self, match_id):
        game = self.client.service.LeikurLeikmenn(LeikurNumer=match_id)
        result = defaultdict(list)
        captains = {}
        if not game.ArrayLeikurLeikmenn:
            return {
                'error': {
                    'key': 'NO_PLAYERS',
                    'text': 'No players found for game %s' % (match_id,),
                }
            }
        for player in sorted(
            game.ArrayLeikurLeikmenn.LeikurLeikmenn,
            key=player_sort_key,
        ):
            club_id = str(player.FelagNumer)
            player_dict = self.get_player(player)
            if (
                club_id in captains
                and captains[club_id]['number'] < player_dict['number']
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
            'text': 'No match found for these teams (%s-%s)'
            % (
                home_team,
                away_team,
            ),
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
    ksi_client = KsiClient()
    matches = ksi_client.get_matches(home_team, away_team, date)
    if not matches:
        return no_match_found(home_team, away_team)
    elif isinstance(matches, dict) and 'error' in matches:
        return matches
    result = {
        'matches': {},
    }
    for match in matches:
        players = ksi_client.get_players(match.match_id)
        if players and 'error' not in players:
            if str(home_team) not in players:
                players[str(home_team)] = []
            if str(away_team) not in players:
                players[str(away_team)] = []
            result['matches'][match.match_id] = {
                'players': players,
                'group': match.group,
            }
    if not result['matches']:
        return no_match_found(home_team, away_team)
    return result


def lambda_handler(json_input, context):
    query = json_input['queryStringParameters']
    if 'debug' in query:
        data = {
            'ip': urllib.request.urlopen('https://api.ipify.org')
            .read()
            .decode()
        }
    else:
        data = main(query, context)
    return {
        'statusCode': 200,
        'body': json.dumps(data),
        'headers': {
            'Access-Control-Allow-Origin': '*',
        },
    }
