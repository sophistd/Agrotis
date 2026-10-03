import hashlib
import json
import math
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from .storage import data_directory, read_snapshot, write_snapshot

DATA_DIR = data_directory()
SNAPSHOT = DATA_DIR / "observations.json"
REFRESH_SECONDS = 3600
LOCK = threading.Lock()
CATEGORIES = {"wildfires": "野火", "severeStorms": "风暴", "floods": "洪水", "volcanoes": "火山", "seaLakeIce": "海冰", "drought": "干旱", "dustHaze": "沙尘", "landslides": "滑坡"}


def load_observations():
    return read_snapshot(SNAPSHOT)


def finite(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def timestamp(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("来源时间缺少时区")
    return date


def eonet_records(payload, now):
    if not isinstance(payload.get("events"), list):
        raise ValueError("EONET 响应缺少事件数组")
    items = []
    for event in payload["events"]:
        geometry = [g for g in event.get("geometry", []) if timestamp(g["date"]) <= now]
        if not geometry:
            continue
        latest = max(geometry, key=lambda g: g["date"])
        point = None
        if latest.get("type") == "Point":
            coords = latest.get("coordinates", [])
            if len(coords) == 2:
                lon, lat = map(finite, coords)
                if lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180:
                    point = {"latitude": lat, "longitude": lon, "altitude_km": None, "label": "EONET 事件参考点", "frame": "Earth geographic"}
        category = event.get("categories", [{}])[0].get("id", "other")
        items.append({"id": event["id"], "domain": "earth", "object_id": "earth", "title": event["title"], "category": CATEGORIES.get(category, "自然事件"), "observed_at": latest["date"], "date_precision": "source timestamp", "date_label": latest["date"][:10], "kind": "reported", "summary": "NASA EONET 汇编的自然事件，详细判断与位置来源可追溯到原始报告。", "observer_ids": [], "observer_label": "见原始报告，未统一披露卫星仪器", "location": point, "metrics": [], "source_id": "eonet", "sources": [{"label": "NASA EONET 原始记录", "url": event["link"]}] + [{"label": s["id"], "url": s["url"]} for s in event.get("sources", [])], "image": None, "note": "事件汇编不等于某颗卫星的直接观测；多边形区域没有被替换成虚构的点位。"})
    return items


def fireball_records(payload, now):
    if payload.get("signature", {}).get("version") != "1.2":
        raise ValueError("CNEOS API 版本变化，暂停解析")
    fields = payload.get("fields", [])
    if int(payload.get("count", 0)) == 0:
        return []
    if not {"date", "energy", "impact-e"}.issubset(fields):
        raise ValueError("CNEOS 字段不完整")
    items = []
    for values in payload.get("data", []):
        r = dict(zip(fields, values, strict=True))
        at = r["date"].replace(" ", "T") + "Z"
        if timestamp(at) > now:
            continue
        lat, lon, alt = finite(r.get("lat")), finite(r.get("lon")), finite(r.get("alt"))
        point = None
        if lat is not None and lon is not None and r.get("lat-dir") in {"N", "S"} and r.get("lon-dir") in {"E", "W"} and abs(lat) <= 90 and abs(lon) <= 180:
            point = {"latitude": lat * (-1 if r["lat-dir"] == "S" else 1), "longitude": lon * (-1 if r["lon-dir"] == "W" else 1), "altitude_km": alt if alt is not None and alt >= 0 else None, "label": "峰值亮度位置，非陨石落点", "frame": "Earth geographic"}
        metrics = [{"label": "辐射能量", "value": finite(r.get("energy")), "unit": "×10¹⁰ J", "kind": "reported"}, {"label": "估算撞击能量", "value": finite(r.get("impact-e")), "unit": "kt TNT", "kind": "estimated"}, {"label": "峰值亮度高度", "value": alt, "unit": "km", "kind": "reported"}]
        items.append({"id": "FIREBALL-" + at.replace(":", ""), "domain": "meteors", "object_id": "meteoroids", "title": at[:10] + " · 火流星", "category": "大气入射", "observed_at": at, "date_precision": "second", "date_label": at[:10], "kind": "reported", "summary": "美国政府传感器报告的火流星峰值亮度事件，JPL/CNEOS 提供公开记录。", "observer_ids": [], "observer_label": "美国政府传感器，具体卫星身份未公开", "location": point, "metrics": metrics, "source_id": "cneos", "sources": [{"label": "CNEOS 火流星目录", "url": "https://cneos.jpl.nasa.gov/fireballs/"}, {"label": "API 与字段定义", "url": "https://ssd-api.jpl.nasa.gov/doc/fireball.html"}], "image": None, "note": "火流星记录不是陨石回收或落点记录；能量有估算成分，不把未披露的传感器指定为 GOES。"})
    return items


def feed_urls(now):
    day = now.date().isoformat()
    start = (now - timedelta(days=90)).date().isoformat()
    return {"eonet": f"https://eonet.gsfc.nasa.gov/api/v3/events?status=all&limit=12&start={start}&end={day}", "cneos": f"https://ssd-api.jpl.nasa.gov/fireball.api?limit=16&sort=-date&date-max={day}"}


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "Tiange-local-demo/0.1"}), timeout=10) as response:
        raw = response.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError("来源响应超过大小上限")
    return raw


def refresh_observations():
    with LOCK:
        previous = load_observations()
        now = datetime.now(timezone.utc)
        attempt = previous.get("last_attempt_at", previous["captured_at"])
        if (now - timestamp(attempt)).total_seconds() < REFRESH_SECONDS:
            return {**previous, "refresh_status": "cached", "refresh_message": "保留已取得的来源快照，每小时最多刷新一次。"}
        records = list(previous["records"])
        sources = list(previous["sources"])
        for source_id, url in feed_urls(now).items():
            old_source = next(s for s in sources if s["id"] == source_id)
            try:
                raw = download(url)
                payload = json.loads(raw)
                incoming = (eonet_records if source_id == "eonet" else fireball_records)(payload, now)
                source = {"id": source_id, "url": url, "captured_at": now.isoformat(), "status": "available", "count": len(incoming), "sha256": hashlib.sha256(raw).hexdigest()}
                raw_path = DATA_DIR / f"{source_id}-observations-response.json"
                raw_tmp = raw_path.with_suffix(".tmp")
                raw_tmp.write_bytes(raw)
                raw_tmp.replace(raw_path)
                records = [r for r in records if r["source_id"] != source_id] + incoming
            except Exception as exc:
                source = {**old_source, "status": "refresh_failed", "error": type(exc).__name__, "last_attempt_at": now.isoformat()}
            sources = [s for s in sources if s["id"] != source_id] + [source]
        result = {**previous, "records": records, "sources": sources, "last_attempt_at": now.isoformat(), "captured_at": max(s["captured_at"] for s in sources), "refresh_status": "refreshed"}
        write_snapshot(SNAPSHOT, result)
        return result
