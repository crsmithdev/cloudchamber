"""`pipeline facets` — score the pool on Biber's six dimensions.

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
import statistics
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

    backend = biber.probe()
    cov = biber.coverage(backend)
    thin = {d: c for d, c in cov.items() if c < 1.0}
    print(f"backend: {backend}   passages: {len(rows)}")
    if thin:
        print("  feature coverage: "
              + "  ".join(f"{d} {c:.0%}" for d, c in sorted(thin.items())))
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
    print()
    spread(rows.values(), biber.scored_dimensions(stats))
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


def spread(rows, dims) -> None:
    """Per-dimension diagnostics: range, skew, and nearest neighbour.

    Not tercile counts — those are 1/3 each by construction, and a mean of 0
    and sd of 1 are guaranteed by the standardisation. What is not guaranteed
    is that a dimension separates anything, or that it separates anything the
    others do not. So: the observed range, the skew (a heavily one-sided
    dimension is mostly absent with a tail of spikes, and its low tercile is
    a squeeze rather than a pole), and the largest correlation with any other
    dimension. A dimension that is 0.9 with its neighbour is a second copy of
    it, and `PLAN.md` Part 3 should drop it.
    """
    rows = [r for r in rows if r.get("facets")]
    if not rows:
        return
    vals = {d: [r["facets"][d] for r in rows if d in r["facets"]] for d in dims}
    print(f"{'dimension':<14s}{'range':>16s}{'skew':>8s}   closest other")
    for dim in dims:
        v = vals[dim]
        if not v:
            continue
        name = biber.LABELS[dim][0]
        sd = statistics.pstdev(v) or 1.0
        mean = statistics.mean(v)
        skew = sum(((x - mean) / sd) ** 3 for x in v) / len(v)
        near, r = "", 0.0
        for other in dims:
            if other == dim or len(vals[other]) != len(v):
                continue
            c = _corr(v, vals[other])
            if abs(c) > abs(r):
                near, r = biber.LABELS[other][0], c
        rng = f"{min(v):+.2f} .. {max(v):+.2f}"
        print(f"{name:<14s}{rng:>16s}{skew:>+8.2f}   {near} {r:+.2f}")


def _corr(a: list[float], b: list[float]) -> float:
    ma, mb = statistics.mean(a), statistics.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return num / den if den else 0.0


def report(dist: dict[str, int], total: int) -> None:
    """The 9-cell coverage grid, voice down the side and mode across."""
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
    that has never had its extremes read is a number nobody has checked — and
    with six of them there are now twelve ends, not four.
    """
    rows = [r for r in rows if r.get("facets")]
    if not rows:
        return
    present = [d for d in biber.ALL_DIMENSIONS if d in rows[0]["facets"]]
    for dim in present:
        _, labels = biber.LABELS[dim]
        ordered = sorted(rows, key=lambda r: r["facets"][dim])
        for label, group in ((labels[0], ordered[:n]),
                             (labels[2], list(reversed(ordered[-n:])))):
            print(f"\n=== {dim} {label} " + "=" * 40)
            for r in group:
                text = " ".join(r.get("text", "").split())
                print(f"  {r['facets'][dim]:+.2f}  {r.get('source_id','')}"
                      f"  {r.get('words',0)}w")
                print(f"        {text[:150]}...")
