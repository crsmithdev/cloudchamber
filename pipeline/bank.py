"""The banks.

Two append-friendly JSONL stores under `extracted/`, and nothing else:

  examples.jsonl   the passage pool. One line per passage, keyed by a stable
                   id derived from source + text, so re-harvesting the same
                   material does not churn ids.
  themes.jsonl     drafted themes, same shape.

**There is no decision layer.** Keep/pass/maybe and the append-only trail that
carried them were removed on 2026-09-03, to be re-added later. Both banks are
pools as they stand: everything in them is in play, and nothing records a
verdict about anything.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Iterable, Iterator

OUT = Path("extracted")
EXAMPLES = "examples.jsonl"
THEMES = "themes.jsonl"


def _root(root: str | Path | None) -> Path:
    p = Path(root) if root else OUT
    p.mkdir(parents=True, exist_ok=True)
    return p


def read_jsonl(path: str | Path) -> Iterator[dict]:
    path = Path(path)
    if not path.exists():
        return iter(())

    def gen():
        with path.open(encoding="utf-8") as fh:
            for i, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    print(f"  ! {path}:{i} unparseable, skipped")

    return gen()


def append_jsonl(path: str | Path, rows: Iterable[dict]) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("a", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n


def write_jsonl(path: str | Path, rows: Iterable[dict]) -> int:
    """Atomic full rewrite. Used for the pool, never for decisions."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    n = 0
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
                n += 1
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return n


def _row(obj) -> dict:
    return asdict(obj) if is_dataclass(obj) else dict(obj)


class Bank:
    """The example pool plus its decision history."""

    def __init__(self, root: str | Path | None = None, pool: str = EXAMPLES):
        self.root = _root(root)
        self.pool_path = self.root / pool

    # --- pool ---------------------------------------------------------

    def load(self) -> dict[str, dict]:
        return {r["id"]: r for r in read_jsonl(self.pool_path) if "id" in r}

    def merge(self, passages: Iterable) -> tuple[int, int]:
        """Add new passages, refresh signals on ones already banked.

        Returns (added, refreshed). Text is never overwritten — the id is
        derived from it, so a changed text is a different passage. Neither are
        `facets`: they come from `pipeline facets`, which the harvester knows
        nothing about, and a re-harvest that blanked them would silently empty
        every coverage bucket in the bank.
        """
        existing = self.load()
        added = refreshed = 0
        now = _now()
        for p in passages:
            r = _row(p)
            pid = r["id"]
            if pid in existing:
                keep_first = existing[pid].get("first_seen", now)
                keep_facets = existing[pid].get("facets") or {}
                existing[pid].update(
                    {k: v for k, v in r.items() if k != "text"}
                )
                existing[pid]["first_seen"] = keep_first
                if keep_facets:
                    existing[pid]["facets"] = keep_facets
                existing[pid]["last_seen"] = now
                refreshed += 1
            else:
                r["first_seen"] = r["last_seen"] = now
                existing[pid] = r
                added += 1
        write_jsonl(self.pool_path, existing.values())
        return added, refreshed

    # --- decisions ----------------------------------------------------

    def stats(self) -> dict:
        pool = self.load()
        return {
            "pool": len(pool),
            "sources": len({p.get("source_id", "") for p in pool.values()}),
            "facetted": sum(1 for p in pool.values() if p.get("facets")),
        }


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
