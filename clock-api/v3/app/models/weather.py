from pydantic import BaseModel


class WeatherResponse(BaseModel):
    temp: float
    service: str
    main: dict
