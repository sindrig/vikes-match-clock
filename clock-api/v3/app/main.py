"""FastAPI application with Mangum handler for AWS Lambda."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.routers import matches, weather

app = FastAPI(title="Clock API v3", root_path="/v3")

app.include_router(matches.router, tags=["matches"])
app.include_router(weather.router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Mangum handler for AWS Lambda
handler = Mangum(app, lifespan="off")
