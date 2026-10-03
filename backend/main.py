import os
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import API_VERSION
from .catalog import find_event, load_dataset
from .models import GeometryRequest, OrbitRequest
from .science import ScienceInputError, propagate_orbit, simulate_geometry
from .orbits import load_orbits, refresh_orbits
from .observations import load_observations, refresh_observations

app = FastAPI(title="Agrotis 科学验证 API", version=API_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["https://agrotis.infoark.xyz", "https://agrotis.pages.dev"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)


@app.exception_handler(ScienceInputError)
async def science_input_error(_request, exc):
    return JSONResponse(status_code=422, content={"error": "SCIENCE_INPUT_INVALID", "detail": str(exc)})


@app.get("/api/v1/health")
def health():
    return {"version": API_VERSION, "mode": "versioned-file-validation", "telemetry_connected": False, "revision": os.environ.get("VERCEL_GIT_COMMIT_SHA", "local")}


@app.get("/api/v1/events")
def events():
    return load_dataset("events")


@app.get("/api/v1/events/{event_id}")
def event(event_id: str):
    item = find_event(event_id)
    if item is None:
        raise HTTPException(status_code=404, detail="事件不存在")
    return item


@app.get("/api/v1/catalog")
def catalog():
    return load_dataset("catalog")


@app.get("/api/v1/satellites")
def satellites(response: Response):
    response.headers["Cache-Control"] = "public, max-age=0, s-maxage=60"
    return refresh_orbits() if os.environ.get("VERCEL") else load_orbits()


@app.post("/api/v1/satellites/refresh")
def refresh_satellites():
    return refresh_orbits()


@app.get("/api/v1/observations")
def observations(response: Response):
    response.headers["Cache-Control"] = "public, max-age=0, s-maxage=60"
    return refresh_observations() if os.environ.get("VERCEL") else load_observations()


@app.post("/api/v1/observations/refresh")
def update_observations():
    return refresh_observations()


@app.post("/api/v1/analyses/orbit")
def orbit(request: OrbitRequest):
    return propagate_orbit(request)


@app.post("/api/v1/analyses/geometry")
def geometry(request: GeometryRequest):
    return simulate_geometry(request)
