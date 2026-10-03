from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from . import API_VERSION
from .catalog import find_event, load_dataset
from .models import GeometryRequest, OrbitRequest
from .science import ScienceInputError, propagate_orbit, simulate_geometry
from .orbits import load_orbits, refresh_orbits
from .observations import load_observations, refresh_observations

app = FastAPI(title="Agrotis 科学验证 API", version=API_VERSION)


@app.exception_handler(ScienceInputError)
async def science_input_error(_request, exc):
    return JSONResponse(status_code=422, content={"error": "SCIENCE_INPUT_INVALID", "detail": str(exc)})


@app.get("/api/v1/health")
def health():
    return {"version": API_VERSION, "mode": "versioned-file-validation", "telemetry_connected": False}


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
def satellites():
    return load_orbits()


@app.post("/api/v1/satellites/refresh")
def refresh_satellites():
    return refresh_orbits()


@app.get("/api/v1/observations")
def observations():
    return load_observations()


@app.post("/api/v1/observations/refresh")
def update_observations():
    return refresh_observations()


@app.post("/api/v1/analyses/orbit")
def orbit(request: OrbitRequest):
    return propagate_orbit(request)


@app.post("/api/v1/analyses/geometry")
def geometry(request: GeometryRequest):
    return simulate_geometry(request)
