from fastapi import APIRouter, HTTPException

from app.dependencies import get_weather_api_key
from app.models.weather import WeatherResponse
from app.services.weather import get_weather

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/", response_model=WeatherResponse)
async def get_weather_endpoint(lat: float, lon: float):
    api_key = get_weather_api_key()
    try:
        return await get_weather(lat, lon, api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
