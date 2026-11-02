import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import dependencies
from app.routers import matches, weather

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if getattr(app.state, "ksi_key_lookups", None) is not None:
        raise RuntimeError("KSI key lookup lifecycle is already running")
    lookups = dependencies.KsiKeyLookups(dependencies.KSI_KEY_LOOKUP_CAPACITY)
    app.state.ksi_key_lookups = lookups
    try:
        yield
    finally:
        try:
            await lookups.close()
        finally:
            del app.state.ksi_key_lookups


app = FastAPI(title="Clock API v3", lifespan=lifespan)

v3 = APIRouter(prefix="/v3")
v3.include_router(matches.router, tags=["matches"])
v3.include_router(weather.router)


@v3.get("/health", operation_id="health_check")
def health_check():
    return {"status": "ok"}


app.include_router(v3)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
