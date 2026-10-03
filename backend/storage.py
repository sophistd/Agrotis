"""Source snapshots: writable local cache plus optional regional platform cache."""
import base64
import json
import logging
import os
from pathlib import Path
import shutil
import tempfile
import zlib

SEED_DIR = Path(__file__).resolve().parents[1] / "data"

def data_directory():
    if not os.environ.get("VERCEL"):
        return SEED_DIR
    directory = Path(tempfile.gettempdir()) / "agrotis-data-v1"
    directory.mkdir(exist_ok=True)
    for name in ("orbit-catalog.json", "observations.json"):
        destination = directory / name
        if not destination.exists():
            shutil.copyfile(SEED_DIR / name, destination)
    return directory


def platform_cache():
    if not os.environ.get("VERCEL"):
        return None
    from vercel.functions import RuntimeCache
    return RuntimeCache(namespace="agrotis-public-snapshots-v1")


def read_snapshot(path):
    local = json.loads(path.read_text(encoding="utf-8"))
    try:
        cache = platform_cache()
        encoded = cache.get(path.name) if cache else None
        if encoded:
            shared = json.loads(zlib.decompress(base64.b64decode(encoded)))
            if shared.get("last_attempt_at", shared.get("captured_at", "")) > local.get("last_attempt_at", local.get("captured_at", "")):
                return shared
    except Exception:
        logging.warning("Agrotis shared snapshot cache unavailable; retaining local source timestamps")
    return local


def write_snapshot(path, value):
    raw = json.dumps(value, ensure_ascii=False).encode()
    # Unique temporary files avoid collisions between different worker processes.
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        file.write(raw)
        temporary = Path(file.name)
    temporary.replace(path)
    try:
        cache = platform_cache()
        if cache:
            encoded = base64.b64encode(zlib.compress(raw)).decode()
            if len(encoded) > 1_900_000:
                raise ValueError("Snapshot exceeds regional cache item budget")
            cache.set(path.name, encoded, {"ttl": 7 * 86400, "name": "Agrotis " + path.name})
    except Exception:
        logging.warning("Agrotis shared snapshot write unavailable; successful local snapshot retained")
