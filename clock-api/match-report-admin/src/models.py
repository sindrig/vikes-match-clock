import dataclasses
import typing


class Person(typing.TypedDict):
    id: int | str
    name: str
    role: str
    show: bool


class Player(Person):
    number: int


class Referee(typing.TypedDict):
    name: str
    role: str


class ErrorDict(typing.TypedDict):
    error: dict[str, str]


@dataclasses.dataclass
class MatchInfo:
    match_name: str
    home_team_name: str
    home_team: typing.Sequence[Person | Player]
    away_team_name: str
    away_team: typing.Sequence[Person | Player]
    refs: list[Referee] | None = None
