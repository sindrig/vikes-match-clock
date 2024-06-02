import datetime
import typing
from collections import defaultdict

from suds.client import Client

from .models import Error, Match, Player

WSDL_URL = "http://www2.ksi.is/vefthjonustur/mot.asmx?WSDL"

STARTER_ROLES = [
    "Markmaður",
    "Leikmaður",
    "Fyrirliði",
    "Fyrirliði/markmaður",
]

sex_map = {
    0: "kvk",
    1: "kk",
}


def player_sort_key(p):
    n = int(p.TreyjuNumer) if p.TreyjuNumer else 999
    if p.StadaNafn in STARTER_ROLES:
        if "markmaður" in p.StadaNafn.lower():
            return n / 100000
        return n / 100
    return n


class KsiClient:
    def __init__(self):
        self.client = Client(WSDL_URL, timeout=10)

    def get_player(self, player) -> Player:
        if player.TreyjuNumer:
            number = int(player.TreyjuNumer)
        else:
            number = 0
        return Player(
            id=player.LeikmadurNumer,
            number=number,
            name=player.LeikmadurNafn.strip(),
            role=player.StadaNafn,
            show=player.StadaNafn in STARTER_ROLES,
        )

    def get_matches(
        self, home_team: int, away_team: int, date: datetime.date, pitch_id: int
    ) -> list[Match] | Error:
        result = self.client.service.FelogLeikir(
            FelagNumer=home_team,
            DagsFra=date,
            DagsTil=date + datetime.timedelta(1),
            Kyn="",
            FlokkurNumer="",
            VollurNumer=pitch_id,
        )

        if hasattr(result, "Villa"):
            return Error(
                {
                    "key": "UPSTREAM_ERROR",
                    "text": result.Villa,
                }
            )
        gameArray = result.ArrayFelogLeikir
        if not gameArray:
            return []
        games = gameArray.FelogLeikir
        matches: typing.List[Match] = []
        for game in games:
            print(game.MotKyn, ":", game.FelagHeimaNafn, "-", game.FelagUtiNafn)
            if game.FelagHeimaNumer == home_team and game.FelagUtiNumer == away_team:
                print("Found match: %s" % (game.LeikurNumer,))
                matches.append(
                    Match(
                        match_id=game.LeikurNumer,
                        group=game.Flokkur,
                        sex=sex_map.get(game.MotKyn, "kk"),
                        starts=game.LeikDagur,
                        home_team=game.FelagHeimaNafn,
                        away_team=game.FelagUtiNafn,
                    )
                )
        return matches

    def get_players(self, match_id) -> dict[int, list[Player]] | Error:
        game = self.client.service.LeikurLeikmenn(LeikurNumer=match_id)
        result: dict[int, list[Player]] = defaultdict(list)
        captains: dict[str, Player] = {}
        if not game.ArrayLeikurLeikmenn:
            return Error(
                {
                    "key": "NO_PLAYERS",
                    "text": "No players found for game %s" % (match_id,),
                }
            )
        for player in sorted(
            game.ArrayLeikurLeikmenn.LeikurLeikmenn,
            key=player_sort_key,
        ):
            club_id = player.FelagNumer
            player_dict = self.get_player(player)
            if club_id in captains and captains[club_id].number < player_dict.number:
                result[club_id].append(captains[club_id])
                del captains[club_id]
            if player_dict.role == "Fyrirliði":
                captains[club_id] = player_dict
            else:
                result[club_id].append(player_dict)
        return result


ksi_client = KsiClient()
