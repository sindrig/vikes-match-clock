"""Pydantic models for match data from the Analyticom KSI API."""

from datetime import datetime

from pydantic import BaseModel


class Person(BaseModel):
    """A person (player, official, etc.)."""

    id: int
    name: str
    firstName: str | None = None
    lastName: str | None = None


class Team(BaseModel):
    """A football team."""

    id: int
    name: str
    shortName: str | None = None
    logo: str | None = None
    imageUrl: str | None = None


class Result(BaseModel):
    """Score result for a team in a match."""

    regular: int | None = None
    overtime: int | None = None
    penalty: int | None = None


class MatchPhase(BaseModel):
    """Phase of a match (e.g. first half, second half)."""

    id: int
    name: str


class Competition(BaseModel):
    """A football competition/league."""

    id: int
    name: str
    shortName: str | None = None


class Facility(BaseModel):
    """A stadium or facility where a match is played."""

    id: int
    name: str
    city: str | None = None


class Match(BaseModel):
    """A football match."""

    id: int
    homeTeam: Team
    awayTeam: Team
    homeTeamResult: Result | None = None
    awayTeamResult: Result | None = None
    homeTeamRedCards: int | None = None
    awayTeamRedCards: int | None = None
    liveStatus: str  # SCHEDULED|CANCELED|POSTPONED|RUNNING|PLAYED
    minute: int | None = None
    currentMinute: str | None = None
    dateTimeUTC: datetime
    round: int | None = None
    status: str | None = None
    statusDescription: str | None = None
    currentMatchPhase: MatchPhase | None = None
    competition: Competition
    facility: Facility | None = None
    attendance: int | None = None
    showEvents: bool | None = None
    allowDetail: bool | None = None


class TeamPlayer(BaseModel):
    """A player in a team lineup."""

    shirtNumber: int | None = None
    captain: bool = False
    goalkeeper: bool = False
    startingLineup: bool = False
    person: Person


class MatchAndTeamOfficial(BaseModel):
    """An official associated with a match or team."""

    person: Person
    role: str | None = None


class TeamLineup(BaseModel):
    """Lineup for a single team."""

    players: list[TeamPlayer] = []
    officials: list[MatchAndTeamOfficial] = []


class LineupsResponse(BaseModel):
    """Lineups response containing home and away team lineups."""

    home: TeamLineup
    away: TeamLineup


class MatchEventType(BaseModel):
    """Type of match event (goal, card, substitution, etc.)."""

    id: int
    name: str


class MatchEvent(BaseModel):
    """An event that occurred during a match."""

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
