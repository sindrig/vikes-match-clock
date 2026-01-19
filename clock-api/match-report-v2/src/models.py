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
    competition: str
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


@dataclasses.dataclass
class PlayerMatch:
    """A potential match for a searched player name."""

    id: int
    name: str
    number: int
    confidence: float  # 0-100 score from fuzzy matching


@dataclasses.dataclass
class PlayerSearchResult:
    """Result of searching for a single player name."""

    search_name: str
    matches: list[PlayerMatch]
