import json
from datetime import datetime, timezone
from collections import Counter

import pytest
from fastapi.testclient import TestClient
from backend import observations as obs
from backend.main import app

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def fireball(values=None):
    return {"signature": {"version": "1.2"}, "count": "1", "fields": ["date", "energy", "impact-e", "lat", "lat-dir", "lon", "lon-dir", "alt", "vel"], "data": [values or ["2026-09-15 11:26:13", "2.2", "0.079", "37.6", "S", "161.6", "W", "37", None]]}


def event(geometry):
    return {"events": [{"id": "EONET_TEST", "title": "Test", "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_TEST", "categories": [{"id": "wildfires"}], "sources": [], "geometry": geometry}]}


def isolate(monkeypatch, tmp_path, old=False):
    data = obs.load_observations()
    data["last_attempt_at"] = "2020-01-01T00:00:00Z" if old else datetime.now(timezone.utc).isoformat()
    path = tmp_path / "observations.json"
    path.write_text(json.dumps(data))
    monkeypatch.setattr(obs, "SNAPSHOT", path)
    monkeypatch.setattr(obs, "DATA_DIR", tmp_path)
    return data, path


def test_catalog_http_contract_keeps_actual_associations():
    result = TestClient(app).get("/api/v1/observations")
    assert result.status_code == 200
    data = result.json()
    assert set(Counter(r["domain"] for r in data["records"])) == {"earth", "moon", "meteors", "comets"}
    assert len({r["id"] for r in data["records"]}) == len(data["records"])
    assert all(not r["observer_ids"] for r in data["records"] if r["source_id"] in {"eonet", "cneos"})
    assert any(p["norad_id"] == 20580 and "moon" in p["domains"] for p in data["observers"])
    assert next(r for r in data["records"] if r["id"] == "HST-MOON-2005")["observed_at"].startswith("2005-08-21")


def test_fireball_peak_location_units_and_anonymous_sensor():
    r = obs.fireball_records(fireball(), NOW)[0]
    assert r["location"]["latitude"] == -37.6
    assert r["location"]["longitude"] == -161.6
    assert r["location"]["altitude_km"] == 37
    assert "非陨石落点" in r["location"]["label"]
    assert r["metrics"][0]["value"] == 2.2 and r["metrics"][0]["unit"] == "×10¹⁰ J"
    assert r["metrics"][1]["kind"] == "estimated"
    assert r["observer_ids"] == []


def test_missing_location_and_altitude_are_not_zero():
    r = obs.fireball_records(fireball(["2026-09-15 11:26:13", "2.2", "0.079", None, None, None, None, None, None]), NOW)[0]
    assert r["location"] is None
    assert r["metrics"][2]["value"] is None


@pytest.mark.parametrize("version", ["1.0", "2.0", None])
def test_api_version_change_stops_interpretation(version):
    data = fireball()
    data["signature"]["version"] = version
    with pytest.raises(ValueError):
        obs.fireball_records(data, NOW)


def test_future_fireball_is_excluded():
    data = fireball()
    data["data"][0][0] = "2026-10-02 00:00:00"
    assert obs.fireball_records(data, NOW) == []


def test_eonet_point_axis_order_and_future_geometry():
    r = obs.eonet_records(event([{"date": "2026-09-30T00:00:00Z", "type": "Point", "coordinates": [120, -30]}, {"date": "2026-10-02T00:00:00Z", "type": "Point", "coordinates": [1, 2]}]), NOW)[0]
    assert r["location"]["latitude"] == -30 and r["location"]["longitude"] == 120
    assert r["observed_at"].startswith("2026-09-30")
    assert r["kind"] == "reported" and r["observer_ids"] == []


def test_eonet_polygon_does_not_invent_point():
    r = obs.eonet_records(event([{"date": "2026-09-30T00:00:00Z", "type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 0]]]}]), NOW)[0]
    assert r["location"] is None


def test_cache_does_not_repeat_public_requests(monkeypatch, tmp_path):
    isolate(monkeypatch, tmp_path)
    monkeypatch.setattr(obs, "download", lambda _: pytest.fail("Fresh cache must not download"))
    assert TestClient(app).post("/api/v1/observations/refresh").json()["refresh_status"] == "cached"


def test_failure_keeps_records_source_capture_and_hash(monkeypatch, tmp_path):
    prior, path = isolate(monkeypatch, tmp_path, old=True)
    def unavailable(_):
        raise TimeoutError()
    monkeypatch.setattr(obs, "download", unavailable)
    result = obs.refresh_observations()
    assert result["records"] == prior["records"]
    for source in result["sources"]:
        before = next(s for s in prior["sources"] if s["id"] == source["id"])
        assert source["captured_at"] == before["captured_at"]
        assert source.get("sha256") == before.get("sha256")
        if source["id"] != "curated":
            assert source["status"] == "refresh_failed"
    assert json.loads(path.read_text())["records"] == prior["records"]
    assert obs.refresh_observations()["refresh_status"] == "cached"


def test_success_replaces_only_that_feed_after_raw_save(monkeypatch, tmp_path):
    prior, _ = isolate(monkeypatch, tmp_path, old=True)
    def partial(url):
        if "fireball" in url:
            return json.dumps(fireball()).encode()
        raise TimeoutError()
    monkeypatch.setattr(obs, "download", partial)
    result = obs.refresh_observations()
    assert len([r for r in result["records"] if r["source_id"] == "cneos"]) == 1
    assert [r for r in result["records"] if r["source_id"] == "eonet"] == [r for r in prior["records"] if r["source_id"] == "eonet"]
    assert (tmp_path / "cneos-observations-response.json").exists()
    assert next(s for s in result["sources"] if s["id"] == "cneos")["sha256"]


def test_requests_are_bounded_by_current_date():
    urls = obs.feed_urls(NOW)
    assert "end=2026-10-01" in urls["eonet"]
    assert "date-max=2026-10-01" in urls["cneos"]
