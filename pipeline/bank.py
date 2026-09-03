"""The banks, and the decision trail.

Three append-friendly JSONL stores under `seeds/`:

  exemplars.jsonl  the candidate pool. One line per passage, keyed by a stable
                   id derived from source + text, so re-harvesting the same
                   material does not orphan earlier decisions.
  decisions.jsonl  append-only. One line per verdict Chris gives. Never
                   rewritten, never deduplicated, never pruned — a passage he
                   passed on in March and kept in June is two rows, and the
                   sequence is the signal. This is the training trail.
  themes.jsonl     extracted themes, same shape, same decision mechanics.

Append-only matters. The pool can be rebuilt from the sources at any time;
the decisions cannot be rebuilt from anything.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Iterable, Iterator

SEEDS = Path("seeds")
EXEMPLARS = "exemplars.jsonl"
DECISIONS = "decisions.jsonl"
THEMES = "themes.jsonl"
THEME_DECISIONS = "theme-decisions.jsonl"


def _root(root: str | Path | None) -> Path:
    p = Path(root) if root else SEEDS
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
    """The exemplar pool plus its decision history."""

    def __init__(self, root: str | Path | None = None, pool: str = EXEMPLARS,
                 decisions: str = DECISIONS):
        self.root = _root(root)
        self.pool_path = self.root / pool
        self.decisions_path = self.root / decisions

    # --- pool ---------------------------------------------------------

    def load(self) -> dict[str, dict]:
        return {r["id"]: r for r in read_jsonl(self.pool_path) if "id" in r}

    def merge(self, passages: Iterable) -> tuple[int, int]:
        """Add new passages, refresh signals on ones already banked.

        Returns (added, refreshed). Text is never overwritten — the id is
        derived from it, so a changed text is a different passage.
        """
        existing = self.load()
        added = refreshed = 0
        now = _now()
        for p in passages:
            r = _row(p)
            pid = r["id"]
            if pid in existing:
                keep_first = existing[pid].get("first_seen", now)
                existing[pid].update(
                    {k: v for k, v in r.items() if k != "text"}
                )
                existing[pid]["first_seen"] = keep_first
                existing[pid]["last_seen"] = now
                refreshed += 1
            else:
                r["first_seen"] = r["last_seen"] = now
                existing[pid] = r
                added += 1
        write_jsonl(self.pool_path, existing.values())
        return added, refreshed

    # --- decisions ----------------------------------------------------

    def record(self, passage_id: str, verdict: str, note: str = "",
               method: str = "manual") -> None:
        """Append one verdict. Never overwrites an earlier one."""
        if verdict not in {"keep", "pass", "maybe"}:
            raise ValueError(f"verdict must be keep/pass/maybe, got {verdict!r}")
        append_jsonl(
            self.decisions_path,
            [{
                "id": passage_id,
                "verdict": verdict,
                "note": note,
                "method": method,
                "at": _now(),
            }],
        )

    def verdicts(self) -> dict[str, dict]:
        """Latest verdict per passage. The full history stays on disk."""
        latest: dict[str, dict] = {}
        for r in read_jsonl(self.decisions_path):
            if "id" in r:
                latest[r["id"]] = r
        return latest

    def history(self, passage_id: str) -> list[dict]:
        return [r for r in read_jsonl(self.decisions_path) if r.get("id") == passage_id]

    # --- views --------------------------------------------------------

    def kept(self) -> list[dict]:
        v = self.verdicts()
        return [p for pid, p in self.load().items() if v.get(pid, {}).get("verdict") == "keep"]

    def unlabelled(self) -> list[dict]:
        v = self.verdicts()
        return [p for pid, p in self.load().items() if pid not in v]

    def stats(self) -> dict:
        pool = self.load()
        v = self.verdicts()
        counts = {"keep": 0, "pass": 0, "maybe": 0}
        for r in v.values():
            counts[r.get("verdict", "pass")] = counts.get(r.get("verdict", "pass"), 0) + 1
        by_tag: dict[str, int] = {}
        for pid, p in pool.items():
            if v.get(pid, {}).get("verdict") != "keep":
                continue
            for t in p.get("tags", []) or ["(untagged)"]:
                by_tag[t] = by_tag.get(t, 0) + 1
        return {
            "pool": len(pool),
            "labelled": len(v),
            "unlabelled": len(pool) - len(v),
            **counts,
            "kept_by_tag": by_tag,
            "sources": len({p.get("source_id", "") for p in pool.values()}),
        }


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
