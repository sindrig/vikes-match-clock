import datetime
import typing
from collections import defaultdict, namedtuple

from suds.client import Client

from .models import ErrorDict, Player

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
Match = namedtuple(
    "Match",
    (
        "match_id",
        "group",
        "sex",
    ),
)


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
        return {
            "id": player.LeikmadurNumer,
            "number": number,
            "name": player.LeikmadurNafn.strip(),
            "role": player.StadaNafn,
            "show": player.StadaNafn in STARTER_ROLES,
        }

    def get_matches(self, home_team, away_team, date, back_days=15):
        result = self.client.service.FelogLeikir(
            FelagNumer=home_team,
            DagsFra=date - datetime.timedelta(back_days),
            DagsTil=date + datetime.timedelta(10),
            Kyn="",
            FlokkurNumer="",
            VollurNumer="",
        )

        if hasattr(result, "Villa"):
            return {
                "error": {
                    "key": "UPSTREAM_ERROR",
                    "text": result.Villa,
                }
            }
        gameArray = result.ArrayFelogLeikir
        if not gameArray:
            return
        games = gameArray.FelogLeikir
        matches: typing.List[Match] = []
        for game in games:
            print(game.MotKyn, ":", game.FelagHeimaNafn, "-", game.FelagUtiNafn)
            if game.FelagHeimaNumer == home_team and game.FelagUtiNumer == away_team:
                print("Found match: %s" % (game.LeikurNumer,))
                matches.append(
                    Match(
                        game.LeikurNumer,
                        game.Flokkur,
                        sex_map.get(game.MotKyn, "kk"),
                    )
                )
        return matches

    def get_players(self, match_id) -> dict[str, list[Player]] | ErrorDict:
        game = self.client.service.LeikurLeikmenn(LeikurNumer=match_id)
        result = defaultdict(list)
        captains = {}
        if not game.ArrayLeikurLeikmenn:
            return {
                "error": {
                    "key": "NO_PLAYERS",
                    "text": "No players found for game %s" % (match_id,),
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
                and captains[club_id]["number"] < player_dict["number"]
            ):
                result[club_id].append(captains[club_id])
                del captains[club_id]
            if player_dict["role"] == "Fyrirliði":
                captains[club_id] = player_dict
            else:
                result[club_id].append(player_dict)
        return result


ksi_client = KsiClient()
