import json
from backend import storage

class Cache:
    def __init__(self):
        self.items = {}
    def get(self, key):
        return self.items.get(key)
    def set(self, key, value, options):
        assert options["ttl"] == 7 * 86400
        self.items[key] = value

def test_cold_worker_restores_successful_shared_snapshot(monkeypatch, tmp_path):
    cache = Cache()
    monkeypatch.setattr(storage, "platform_cache", lambda: cache)
    path = tmp_path / "orbits.json"
    old = {"captured_at": "2026-10-01T00:00:00Z", "items": [{"epoch": "2026-10-01"}]}
    fresh = {"captured_at": "2026-10-04T00:00:00Z", "items": [{"epoch": "2026-10-04"}]}
    storage.write_snapshot(path, fresh)
    path.write_text(json.dumps(old))
    assert storage.read_snapshot(path) == fresh

def test_cache_failure_preserves_source_time_and_local_success(monkeypatch, tmp_path):
    def broken():
        raise RuntimeError("unavailable")
    monkeypatch.setattr(storage, "platform_cache", broken)
    path = tmp_path / "snapshot.json"
    value = {"captured_at": "2026-10-01T00:00:00Z", "items": []}
    storage.write_snapshot(path, value)
    assert storage.read_snapshot(path) == value

def test_hosted_get_refreshes_due_catalog_and_exact_cors(monkeypatch):
    from fastapi.testclient import TestClient
    from backend import main
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(main, "refresh_orbits", lambda: {"items": [], "refresh_status": "refreshed"})
    client = TestClient(main.app)
    response = client.get("/api/v1/satellites", headers={"Origin": "https://agrotis.infoark.xyz"})
    assert response.json()["refresh_status"] == "refreshed"
    assert response.headers["access-control-allow-origin"] == "https://agrotis.infoark.xyz"
    response = client.get("/api/v1/health", headers={"Origin": "https://unrelated.example"})
    assert "access-control-allow-origin" not in response.headers
