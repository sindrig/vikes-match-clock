"""Matches API router."""

from fastapi import APIRouter

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/")
async def list_matches():
    """List upcoming matches."""
    pass
