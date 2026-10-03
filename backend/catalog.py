import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def load_dataset(name: str) -> dict:
    if name not in {"events", "catalog"}:
        raise ValueError("未知数据集")
    return json.loads((DATA_DIR / f"{name}.json").read_text(encoding="utf-8"))


def find_event(event_id: str) -> dict | None:
    return next((x for x in load_dataset("events")["items"] if x["id"] == event_id), None)
