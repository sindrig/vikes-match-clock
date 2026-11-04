def player(number, name, person_id, **fields):
    return {
        "shirtNumber": number,
        "person": {
            "id": person_id,
            "name": name,
            "firstName": name.split()[0],
            "lastName": "Jónsson",
        },
        **fields,
    }


def match(match_id, day, home_id, away_id):
    return {
        "id": match_id,
        "homeTeam": {"id": home_id, "name": f"Team {home_id}"},
        "awayTeam": {"id": away_id, "name": f"Team {away_id}"},
        "dateTimeUTC": f"2026-06-{day:02}T14:00:00Z",
        "liveStatus": "FINISHED",
        "competition": {"id": 1, "name": "League"},
    }


def lineup(players):
    return {
        "players": players,
        "officials": [
            {"person": {"id": 99, "name": "Coach"}, "role": "COACH"}
        ],
    }


def roster_cases():
    newest = lineup(
        [
            player(
                13,
                "Newest Keeper",
                1013,
                goalkeeper=True,
                captain=True,
                startingLineup=False,
            ),
            player(9, "Newest Nine", 1009, startingLineup=False),
            player(7, "Newest Seven", 1007, captain=True, startingLineup=True),
            player(
                12,
                "Newest Twelve",
                1012,
                goalkeeper=True,
                startingLineup=True,
            ),
            player(None, "No Shirt", 9999),
            player(99, "Not Requested", 1099),
        ]
    )
    older = lineup(
        [
            player(13, "Old Keeper", 2013, startingLineup=True),
            player(9, "Old Nine", 2009, captain=True, goalkeeper=True),
            player(7, "Old Seven", 2007),
            player(2, "Older Two", 2002, captain=True),
            {
                "shirtNumber": 8,
                "personId": 2008,
                "name": "Flat Eight",
                "position": "G",
                "starting": False,
                "captain": True,
            },
        ]
    )
    oldest = lineup([player(n, f"Oldest {n}", 3000 + n) for n in range(1, 24)])
    opponent = lineup([player(9, "Opponent Nine", 9009, captain=True)])
    history = [
        match(102, 8, 1, 3),
        match(103, 1, 4, 1),
        match(104, 20, 5, 6),
        match(101, 15, 2, 1),
    ]
    lineups = {
        "101": {"home": opponent, "away": newest},
        "102": {"home": older, "away": opponent},
        "103": {"home": opponent, "away": oldest},
        "104": {"home": opponent, "away": opponent},
    }
    starters = [13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    return [
        {
            "name": "mixed-history",
            "starters": starters,
            "substitutes": [23, 12],
            "history": history,
            "lineups": lineups,
            "history_envelope": True,
            "fetched": [101, 102, 103],
        },
        {
            "name": "unresolved-with-flags",
            "starters": starters,
            "substitutes": [23, 12],
            "history": [m for m in history if m["id"] in (101, 102, 104)],
            "lineups": lineups,
            "history_envelope": False,
            "fetched": [101, 102],
        },
        {
            "name": "empty-history",
            "starters": starters,
            "substitutes": [],
            "history": [],
            "lineups": {},
            "history_envelope": True,
            "fetched": [],
        },
        {
            "name": "fully-resolved-newest",
            "starters": list(range(1, 12)),
            "substitutes": list(range(12, 24)),
            "history": [match(101, 30, 1, 2)]
            + [match(mid, 131 - mid, 1, 3) for mid in range(102, 111)],
            "lineups": {
                "101": {"home": oldest, "away": opponent},
                **{
                    str(mid): {"home": older, "away": opponent}
                    for mid in range(102, 111)
                },
            },
            "history_envelope": True,
            "fetched": [101],
        },
    ]
