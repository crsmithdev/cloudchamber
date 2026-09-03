"""`pipeline facets` — score the pool on Biber's D1 and D2.

A dimension score is a sum of standardised feature rates, so it only exists
relative to a corpus. That makes this a second pass over the whole pool rather
than something `harvest` can compute per passage on the way past.

The corpus statistics are written to `extracted/facet-stats.json` and reused
by default. That is the point: a later harvest adds passages and scores them
against the same baseline instead of silently re-basing every number in the
bank. `--refit` is the deliberate re-baseline, and it says so when it runs.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import biber
from .bank import Bank, write_jsonl

STATS = "facet-stats.json"


def load_stats(out_dir: Path) -> dict | None:
    path = Path(out_dir) / STATS
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"  ! {path} unparseable; refitting")
        return None


def save_stats(out_dir: Path, stats: dict) -> Path:
    path = Path(out_dir) / STATS
    path.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return path


def score(
    root: str | Path = ".",
    out: str | Path | None = None,
    pool: str = "exemplars.jsonl",
    refit: bool = False,
    extremes: int = 0,
) -> dict:
    out_dir = Path(out or Path(root) / "extracted")
    bank = Bank(out_dir, pool=pool)
    rows = bank.load()
    if not rows:
        raise SystemExit(f"{out_dir / pool} is empty. Run `pipeline harvest` first.")

    print(f"backend: {biber.BACKEND}   passages: {len(rows)}")
    feats = {pid: biber.features(r.get("text", "")) for pid, r in rows.items()}

    stats = None if refit else load_stats(out_dir)
    if stats and stats.get("backend") != biber.BACKEND:
        print(f"  ! stats were fitted with {stats['backend']!r}, running "
              f"{biber.BACKEND!r}. Refitting — the two are not comparable.")
        stats = None
    if stats is None:
        stats = biber.fit(list(feats.values()))
        path = save_stats(out_dir, stats)
        print(f"fitted over {stats['n']} passages -> {path}")
    else:
        print(f"reusing stats fitted over {stats['n']} passages "
              f"({out_dir / STATS})")
        grew = len(rows) / max(1, stats["n"])
        if grew > 1.2 or grew < 0.8:
            print(f"  ! the pool is now {len(rows)} — {grew:.1f}x what these "
                  f"stats were fitted over. A baseline from a different "
                  f"corpus is not a baseline. Consider --refit, and re-read "
                  f"the extremes afterwards.")

    for pid, row in rows.items():
        row["facets"] = biber.facets(feats[pid], stats)
    write_jsonl(bank.pool_path, rows.values())

    dist = distribution(rows.values())
    print()
    report(dist, len(rows))
    if extremes:
        print()
        show_extremes(rows.values(), extremes)
    return {"stats": stats, "distribution": dist}


def distribution(rows) -> dict[str, int]:
    counts = {c: 0 for c in biber.CELLS}
    for r in rows:
        counts[biber.cell(r.get("facets"))] = (
            counts.get(biber.cell(r.get("facets")), 0) + 1
        )
    return counts


def report(dist: dict[str, int], total: int) -> None:
    """The 9-cell grid, voice down the side and mode across."""
    width = max(len(v) for v in biber.VOICE_LABELS) + 2
    head = " " * width + "".join(f"{m:>16s}" for m in biber.MODE_LABELS)
    print(head)
    for v in biber.VOICE_LABELS:
        cells = "".join(f"{dist.get(f'{v}/{m}', 0):>16d}" for m in biber.MODE_LABELS)
        print(f"{v:<{width}s}{cells}")
    empty = [c for c in biber.CELLS if not dist.get(c)]
    other = {k: n for k, n in dist.items() if k not in biber.CELLS and n}
    print(f"\n{total} passages, {len(biber.CELLS) - len(empty)}/9 cells filled")
    if empty:
        print(f"  empty: {', '.join(empty)}")
    if other:
        print(f"  outside the grid: {other}")


def show_extremes(rows, n: int) -> None:
    """Print the ends of each dimension.

    Non-optional in practice. The last time these were eyeballed the top of D1
    was raw CSS, which is how two SCP stripper bugs were found. A dimension
    that has never had its extremes read is a number nobody has checked.
    """
    rows = [r for r in rows if r.get("facets")]
    for dim, low_label, high_label in (
        ("d1", "informational", "involved"),
        ("d2", "non-narrative", "narrative"),
    ):
        ordered = sorted(rows, key=lambda r: r["facets"][dim])
        for label, group in ((low_label, ordered[:n]),
                             (high_label, list(reversed(ordered[-n:])))):
            print(f"\n=== {dim} {label} " + "=" * 40)
            for r in group:
                text = " ".join(r.get("text", "").split())
                print(f"  {r['facets'][dim]:+.2f}  {r.get('source_id','')}"
                      f"  {r.get('words',0)}w")
                print(f"        {text[:150]}...")
