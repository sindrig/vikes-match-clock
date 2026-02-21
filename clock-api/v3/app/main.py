import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import matches, weather

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="Clock API v3")

v3 = APIRouter(prefix="/v3")
v3.include_router(matches.router, tags=["matches"])
v3.include_router(weather.router)


@v3.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(v3)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
