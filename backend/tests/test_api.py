from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_does_not_claim_telemetry():
    assert client.get("/api/v1/health").json()["telemetry_connected"] is False


def test_events_preserve_sources_and_geometry_gap():
    events = client.get("/api/v1/events").json()["items"]
    assert len(events) == 3
    assert all(e["sources"] and e["tiange_geometry"] == "unavailable" for e in events)
    assert all(e["light_curve"] is None for e in events)


def test_unknown_event_is_404():
    assert client.get("/api/v1/events/not-an-event").status_code == 404


def test_bad_geometry_is_rejected():
    assert client.post("/api/v1/analyses/geometry", json={}).status_code == 422


def test_geometry_api_keeps_simulation_identity():
    r = client.post("/api/v1/analyses/geometry", json={"positions_km":[[7000,0,0]],"source_direction":[1,0,0],"coordinate_frame":"ITRS","at":"2023-03-07T15:44:06Z"})
    assert r.status_code == 200
    assert r.json()["kind"] == "simulated"
    assert r.json()["satellites"][0]["actual_detection"] == "unknown"
