from datetime import datetime

from pydantic import BaseModel, field_validator, model_validator


class Person(BaseModel):
    id: int
    name: str
    firstName: str | None = None
    lastName: str | None = None


class Team(BaseModel):
    id: int
    name: str
    shortName: str | None = None
    logo: str | None = None
    imageUrl: str | None = None


class Result(BaseModel):
    regular: int | None = None
    overtime: int | None = None
    penalty: int | None = None


class MatchPhase(BaseModel):
    id: int
    name: str


class Competition(BaseModel):
    id: int
    name: str
    shortName: str | None = None


class Facility(BaseModel):
    id: int
    name: str
    city: str | None = None


class Match(BaseModel):
    id: int
    homeTeam: Team
    awayTeam: Team
    homeTeamResult: Result | None = None
    awayTeamResult: Result | None = None
    homeTeamRedCards: int | None = None
    awayTeamRedCards: int | None = None
    liveStatus: str
    minute: int | None = None
    currentMinute: str | None = None
    dateTimeUTC: datetime
    round: int | str | None = None
    status: str | None = None
    statusDescription: str | None = None
    currentMatchPhase: MatchPhase | None = None

    @field_validator("currentMatchPhase", mode="before")
    @classmethod
    def empty_dict_to_none(cls, v: object) -> object:
        if isinstance(v, dict) and not v:
            return None
        return v

    competition: Competition
    facility: Facility | None = None
    attendance: int | None = None
    showEvents: bool | None = None
    allowDetail: bool | None = None


class TeamPlayer(BaseModel):
    shirtNumber: int | None = None
    captain: bool = False
    goalkeeper: bool = False
    startingLineup: bool = False
    person: Person

    @model_validator(mode="before")
    @classmethod
    def flatten_to_nested(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        if "person" in data:
            return data
        result = dict(data)
        result["person"] = {
            "id": result.pop("personId", 0),
            "name": result.get("name", ""),
        }
        result["startingLineup"] = result.pop("starting", False)
        result["goalkeeper"] = result.pop("position", "") == "G"
        return result


class MatchAndTeamOfficial(BaseModel):
    person: Person
    role: str | None = None

    @model_validator(mode="before")
    @classmethod
    def flatten_to_nested(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        if "person" in data:
            return data
        result = dict(data)
        result["person"] = {
            "id": result.pop("personId", 0),
            "name": result.get("name", ""),
        }
        return result


class TeamLineup(BaseModel):
    players: list[TeamPlayer] = []
    officials: list[MatchAndTeamOfficial] = []


class LineupsResponse(BaseModel):
    home: TeamLineup
    away: TeamLineup


class MatchEventType(BaseModel):
    id: int
    name: str


class MatchEvent(BaseModel):
    eventId: int
    eventType: MatchEventType
    matchPhase: MatchPhase | None = None
    minute: int | None = None
    minuteFull: int | None = None
    stoppageTime: int | None = None
    displayMinute: str | None = None
    player: TeamPlayer | None = None
    player2: TeamPlayer | None = None
    club: Team | None = None
    homeTeam: bool | None = None
    orderNumber: int | None = None
    commentary: str | None = None
