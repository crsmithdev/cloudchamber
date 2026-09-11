"""SQLite access for the extraction side. Schema is shared with app/."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = Path("app/pipeline/store/schema.sql")
# Mirrors SCHEMA_VERSION in app/pipeline/store/db.ts, which owns migrations.
SCHEMA_VERSION = 8


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def open_db(root: Path, path: str | None = None) -> sqlite3.Connection:
    db = Path(path or os.environ.get("CLOUDCHAMBER_DB") or root / "data" / "cloudchamber.db")
    db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    fresh = con.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verdicts'").fetchone() is None
    con.executescript((root / SCHEMA).read_text(encoding="utf-8"))
    if fresh:
        con.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    version = con.execute("PRAGMA user_version").fetchone()[0]
    if version < SCHEMA_VERSION:
        raise SystemExit(f"store {db} is at schema version {version}, need {SCHEMA_VERSION}: run any `cloudchamber` command to migrate it")
    return con
