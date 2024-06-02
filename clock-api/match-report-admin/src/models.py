import dataclasses
import datetime
import typing


@dataclasses.dataclass
class Match:
    match_id: int
    group: str
    sex: str
    starts: datetime.datetime
    home_team: str
    away_team: str


@dataclasses.dataclass
class Team:
    name: str
    id: int | None


@dataclasses.dataclass
class MatchListMatch:
    date: str
    time: str
    home: Team
    away: Team
    match_id: int | None


@dataclasses.dataclass
class Error:
    error: dict[str, str]


@dataclasses.dataclass
class Person:
    id: int | str
    name: str
    role: str
    show: bool


@dataclasses.dataclass
class Player(Person):
    number: int


@dataclasses.dataclass
class MatchReport:
    players: dict[int, list[Player]]
