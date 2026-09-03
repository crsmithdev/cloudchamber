"""The banks, and the decision trail.

Three append-friendly JSONL stores under `extracted/`:

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

OUT = Path("extracted")
EXEMPLARS = "exemplars.jsonl"
DECISIONS = "decisions.jsonl"
THEMES = "themes.jsonl"
THEME_DECISIONS = "theme-decisions.jsonl"


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

    def record(self, passage_id: str, verdict: str, note: str = "",
               method: str = "manual", extra: dict | None = None) -> None:
        """Append one verdict. Never overwrites an earlier one.

        `method` says how the verdict was reached — `manual`, `triage`,
        `compare` — because they are not the same evidence. A `compare` keep
        means "best of the five on that screen", which is a ranking, not an
        absolute judgement, and Part 3 has to be able to tell them apart.
        """
        if verdict not in {"keep", "pass", "maybe"}:
            raise ValueError(f"verdict must be keep/pass/maybe, got {verdict!r}")
        row = {
            "id": passage_id,
            "verdict": verdict,
            "note": note,
            "method": method,
            "at": _now(),
        }
        if extra:
            row.update(extra)
        append_jsonl(self.decisions_path, [row])

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

    def stats(self, target_per_cell: int = 0, block: int = 50) -> dict:
        """State of the bank, and progress toward a stop rule.

        `pipeline review` is not aiming to label the whole pool — 944 passages
        at 30-60s each is 8-15 hours, and the pool grows several-fold once the
        PDFs are harvested. The stop condition is the marginal keep rate going
        flat, or every facet cell holding enough keeps. Both need the decision
        order, which is why `decisions.jsonl` is appended and never sorted.
        """
        pool = self.load()
        v = self.verdicts()
        counts = {"keep": 0, "pass": 0, "maybe": 0}
        for r in v.values():
            counts[r.get("verdict", "pass")] = counts.get(r.get("verdict", "pass"), 0) + 1

        by_cell: dict[str, int] = {}
        for pid, p in pool.items():
            if v.get(pid, {}).get("verdict") != "keep":
                continue
            c = _cell(p.get("facets"))
            by_cell[c] = by_cell.get(c, 0) + 1

        out = {
            "pool": len(pool),
            "labelled": len(v),
            "unlabelled": len(pool) - len(v),
            **counts,
            "kept_by_facet": by_cell,
            "keep_rate": self.keep_rate(block),
            "sources": len({p.get("source_id", "") for p in pool.values()}),
            "facetted": sum(1 for p in pool.values() if p.get("facets")),
        }
        if target_per_cell:
            from .biber import CELLS

            out["target_per_cell"] = target_per_cell
            out["cells_short"] = {
                c: target_per_cell - by_cell.get(c, 0)
                for c in CELLS
                if by_cell.get(c, 0) < target_per_cell
            }
        return out

    def keep_rate(self, block: int = 50) -> list[float]:
        """Keep rate per consecutive block of `block` verdicts, in order.

        Flat or falling across the last few blocks is the signal to stop: the
        pool is sorted by score, so a keep rate that has stopped declining
        means the sort has stopped helping.
        """
        verdicts = [r.get("verdict") for r in read_jsonl(self.decisions_path)
                    if r.get("verdict")]
        rates = []
        for i in range(0, len(verdicts) - block + 1, block):
            chunk = verdicts[i:i + block]
            rates.append(round(sum(1 for x in chunk if x == "keep") / len(chunk), 3))
        return rates


def _cell(facet: dict | None) -> str:
    """`biber.cell`, inlined to keep bank.py free of the import."""
    if not isinstance(facet, dict) or not facet:
        return "(unscored)"
    return f"{facet.get('voice', '?')}/{facet.get('mode', '?')}"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
