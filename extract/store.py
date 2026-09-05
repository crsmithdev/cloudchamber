"""SQLite access for the extraction side. Schema is shared with app/."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = Path("app/pipeline/store/schema.sql")


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def open_db(root: Path, path: str | None = None) -> sqlite3.Connection:
    db = Path(path or os.environ.get("FOGBELT_DB") or root / "data" / "fogbelt.db")
    db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript((root / SCHEMA).read_text(encoding="utf-8"))
    return con
