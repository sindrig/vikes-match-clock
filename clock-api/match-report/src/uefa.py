import typing

import requests

from .errors import ApiError
from .models import MatchInfo, Person, Player, Referee


def get_match(match_id: str) -> MatchInfo:
    r = requests.get(f'https://match.uefa.com/v5/matches/{match_id}/lineups')
    r.raise_for_status()
    lineups = r.json()
    r = requests.get(
        f'https://match.uefa.com/v5/matches', params={'matchId': match_id}
    )
    r.raise_for_status()
    match_info = r.json()[0]
    return MatchInfo(
        match_name=match_info['id'],
        home_team_name=lineups['homeTeam']['team']['internationalName'],
        home_team=list(parse_team(lineups['homeTeam'])),
        away_team_name=lineups['awayTeam']['team']['internationalName'],
        away_team=list(parse_team(lineups['awayTeam'])),
        refs=[
            Referee(
                name=ref['person']['translations']['name']['EN'],
                role=ref['role'],
            )
            for ref in match_info['referees']
        ],
    )


def parse_team(team) -> typing.Generator[Person, None, None]:
    for key in ('field', 'bench', 'coaches'):
        show = key == 'field'
        for team_entry_obj in team[key]:
            if 'player' in team_entry_obj:
                player = team_entry_obj['player']
                yield Player(
                    id=player['id'],
                    name=player['internationalName'],
                    role=player['fieldPosition'],
                    number=team_entry_obj['jerseyNumber'],
                    show=show,
                )
            elif 'person' in team_entry_obj:
                person = team_entry_obj['person']
                yield Person(
                    id=person['id'],
                    name=person['translations']['name']['EN'],
                    role=team_entry_obj['role'],
                    show=show,
                )
            else:
                raise ApiError(f"Could not find persin in {team_entry_obj}")
