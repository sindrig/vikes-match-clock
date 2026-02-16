"""Weather API router."""

from fastapi import APIRouter

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/")
async def get_weather():
    """Get weather forecast."""
    pass
