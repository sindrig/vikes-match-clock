from pydantic import BaseModel


class ParsedPlayer(BaseModel):
    name: str
    number: int | None = None


class ParsedLineup(BaseModel):
    players: list[ParsedPlayer]
