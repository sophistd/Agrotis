from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from threading import Lock
from urllib.request import Request, urlopen

from .storage import data_directory, read_snapshot, write_snapshot

DATA_PATH = data_directory() / "orbit-catalog.json"
GROUPS = {"stations": "空间站", "science": "科学卫星", "weather": "气象卫星"}
REFRESH_SECONDS = 7200
MAX_BYTES = 4_000_000
_lock = Lock()


def source_url(group):
    return f"https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON"


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def load_orbits():
    if not DATA_PATH.exists():
        return {"version": "public-orbits/1", "items": [], "sources": [], "status": "unavailable"}
    return read_snapshot(DATA_PATH)


def validate_elements(raw):
    items = json.loads(raw)
    if not isinstance(items, list) or not items:
        raise ValueError("来源没有可用轨道元素")
    for item in items:
        for field in ["MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"]:
            if not math.isfinite(float(item[field])):
                raise ValueError("来源包含非法轨道数值")
        if int(item["NORAD_CAT_ID"]) <= 0 or float(item["MEAN_MOTION"]) <= 0 or not 0 <= float(item["ECCENTRICITY"]) < 1:
            raise ValueError("来源包含非法轨道元素")
        datetime.fromisoformat(item["EPOCH"].removesuffix("Z")).replace(tzinfo=timezone.utc)
    return items


def build_snapshot(raw_groups, previous=None):
    previous = previous or {"sources": [], "items": []}
    now = utc_now()
    merged, sources = {}, []
    for group, label in GROUPS.items():
        raw = raw_groups.get(group)
        if isinstance(raw, bytes):
            elements = validate_elements(raw)
            source = {"group": group, "label": label, "url": source_url(group), "captured_at": now,
                      "sha256": hashlib.sha256(raw).hexdigest(), "count": len(elements), "status": "available"}
        else:
            prior = next((s for s in previous["sources"] if s["group"] == group), {})
            source = {**prior, "group": group, "label": label, "url": source_url(group), "status": "refresh_failed", "error": str(raw or "未取得来源"), "attempted_at": now}
            elements = [item["omm"] for item in previous["items"] if group in item["groups"]]
        sources.append(source)
        for omm in elements:
            key = str(omm["NORAD_CAT_ID"])
            if key not in merged:
                merged[key] = {"norad_id": int(key), "name": omm["OBJECT_NAME"], "object_id": omm.get("OBJECT_ID", ""), "groups": [],
                               "epoch": omm["EPOCH"].removesuffix("Z") + "Z", "source_url": source_url(group), "captured_at": source.get("captured_at"), "omm": omm}
            merged[key]["groups"].append(group)
    captured = max((s.get("captured_at", "") for s in sources), default="") or previous.get("captured_at", now)
    return {"version": "public-orbits/1", "captured_at": captured, "refresh_after_seconds": REFRESH_SECONDS,
            "last_attempt_at": now, "kind": "computed", "position_method": "SGP4 / WGS72; TEME → GMST approximate Earth-fixed display",
            "valid_window_hours": 72, "sources": sources, "items": list(merged.values()),
            "tiange_candidates": previous.get("tiange_candidates", [])}


def _download(group):
    try:
        request = Request(source_url(group), headers={"User-Agent": "Tiange-Observatory/1.0 public-orbit-demo"})
        with urlopen(request, timeout=12) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("来源响应超过大小限制")
        validate_elements(raw)
        return group, raw
    except Exception as exc:
        return group, f"{type(exc).__name__}: {exc}"


def refresh_orbits():
    with _lock:
        old = load_orbits()
        stamp = old.get("last_attempt_at") or old.get("captured_at")
        if stamp and (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() < REFRESH_SECONDS:
            return {**old, "refresh_status": "cached", "refresh_message": "公开源刷新间隔为两小时，已使用本地已取得的数据。"}
        with ThreadPoolExecutor(max_workers=3) as pool:
            raw = dict(pool.map(_download, GROUPS))
        snapshot = build_snapshot(raw, old)
        write_snapshot(DATA_PATH, snapshot)
        return {**snapshot, "refresh_status": "refreshed"}
