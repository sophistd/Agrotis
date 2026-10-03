import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

from backend import orbits
from backend.main import app


def test_snapshot_keeps_failed_sources_and_capture_time():
    prior = orbits.load_orbits()
    snapshot = orbits.build_snapshot({g: "TimeoutError" for g in orbits.GROUPS}, prior)
    assert {r["norad_id"] for r in snapshot["items"]} == {r["norad_id"] for r in prior["items"]}
    assert snapshot["captured_at"] == prior["captured_at"]
    assert all(s["status"] == "refresh_failed" for s in snapshot["sources"])
    assert snapshot["items"][0]["captured_at"] == prior["items"][0]["captured_at"]


def test_cache_avoids_duplicate_download(monkeypatch, tmp_path):
    cached = orbits.load_orbits()
    cached["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    path = tmp_path / "orbits.json"
    path.write_text(json.dumps(cached))
    monkeypatch.setattr(orbits, "DATA_PATH", path)
    monkeypatch.setattr(orbits, "_download", lambda _: pytest.fail("Fresh cache must not download"))
    assert orbits.refresh_orbits()["refresh_status"] == "cached"


def test_invalid_orbit_is_rejected():
    example = dict(orbits.load_orbits()["items"][0]["omm"])
    example["MEAN_MOTION"] = float("nan")
    with pytest.raises(ValueError):
        orbits.validate_elements(json.dumps([example]).encode())


def test_catalog_api_preserves_elements_and_candidates():
    response = TestClient(app).get("/api/v1/satellites")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == len({r["norad_id"] for r in data["items"]})
    assert any(r["norad_id"] == 25544 and r["omm"]["EPOCH"] for r in data["items"])
    assert all(c["identity_mapping"] == "unresolved" and c["satcat"]["DECAY_DATE"] for c in data["tiange_candidates"])
