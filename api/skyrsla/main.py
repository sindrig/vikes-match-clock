import argparse
import datetime
import pprint
from collections import defaultdict
from suds.client import Client

WSDL_URL = 'http://www2.ksi.is/vefthjonustur/mot.asmx?WSDL'
VIKES = '103'

client = Client(WSDL_URL)


def get_player(player):
    return {
        'number': player.TreyjuNumer,
        'name': player.LeikmadurNafn.strip(),
        'role': player.StadaNafn,
    }


def get_match_id(home_team, away_team, date):
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
            'error': result.Villa,
        }
    games = result.ArrayFelogLeikir.FelogLeikir
    for game in games:
        print(game.FelagHeimaNafn, '-', game.FelagUtiNafn)
        if (
            game.FelagHeimaNumer == home_team and
            game.FelagUtiNumer == away_team
        ):
            print('Found match: %s' % (game.LeikurNumer, ))
            return game.LeikurNumer


def handler(json_input, context, date=None):
    date = date or datetime.date.today()
    try:
        home_team = int(json_input['homeTeam'])
        away_team = int(json_input['awayTeam'])
    except ValueError:
        return {
            'error': 'homeTeam and awayTeam must be integers'
        }
    match_id = get_match_id(home_team, away_team, date)
    if not match_id:
        return {
            'error': 'No match found for these teams (%s-%s)' % (
                home_team, away_team,
            )
        }
    elif isinstance(match_id, dict) and 'error' in match_id:
        return match_id
    game = client.service.LeikurLeikmenn(LeikurNumer=match_id)
    result = defaultdict(list)
    for player in game.ArrayLeikurLeikmenn.LeikurLeikmenn:
        result[player.FelagNafn].append(get_player(player))
    return dict(result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('home_team', type=int)
    parser.add_argument('away_team', type=int)
    args = parser.parse_args()
    pprint.pprint(
        handler(
            {'homeTeam': args.home_team, 'awayTeam': args.away_team},
            None
        )
    )
