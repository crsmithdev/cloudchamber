"""Biber D1-D6 over the passage pool: fit, score, label, report."""

from __future__ import annotations

import json
import statistics

from . import biber
from .store import now

DIMS = ("d1", "d2", "d3", "d4", "d5", "d6")


def fit_and_score(con, refit: bool = False, drift_warn: float = 0.20) -> dict:
    rows = con.execute("SELECT id, text FROM passages").fetchall()
    if not rows:
        raise SystemExit("facets: the pool is empty; run `extract read` and `extract segment` first")
    backend = biber.probe()
    feats = {r["id"]: biber.features(r["text"]) for r in rows}
    prior = con.execute("SELECT backend, n, stats FROM facet_fit WHERE id = 1").fetchone()
    if prior and not refit:
        if prior["backend"] != backend:
            raise SystemExit(f"facets: pool was fitted with {prior['backend']}, live backend is {backend}; pass --refit")
        stats = json.loads(prior["stats"])
        if abs(len(rows) - prior["n"]) / max(1, prior["n"]) > drift_warn:
            print(f"  ! pool has {len(rows)} passages, fit was over {prior['n']} (>{int(drift_warn*100)}% drift); consider --refit")
    else:
        stats = biber.fit(list(feats.values()))
        con.execute("INSERT OR REPLACE INTO facet_fit (id, backend, n, stats, fitted_at) VALUES (1, ?, ?, ?, ?)",
                    (backend, len(rows), json.dumps(stats), now()))
    scored = []
    for r in rows:
        f = biber.facets(feats[r["id"]], stats)
        con.execute("UPDATE passages SET d1=?, d2=?, d3=?, d4=?, d5=?, d6=?, voice=?, mode=? WHERE id=?",
                    (*[f.get(d) for d in DIMS], f.get("voice"), f.get("mode"), r["id"]))
        scored.append(f)
    con.commit()
    return {"backend": backend, "n": len(rows), "refit": bool(refit or not prior), "scored": scored}


def report(scored: list[dict]) -> str:
    lines = ["dimension  range            skew    closest other"]
    cols = {d: [s[d] for s in scored if s.get(d) is not None] for d in DIMS}
    for d in DIMS:
        v = cols[d]
        if len(v) < 2:
            continue
        m, sd = statistics.mean(v), statistics.pstdev(v) or 1.0
        skew = sum(((x - m) / sd) ** 3 for x in v) / len(v)
        best = max(((_corr(v, cols[o]), o) for o in DIMS if o != d and len(cols[o]) == len(v)), default=(0, "-"))
        lines.append(f"{d:9s}  {min(v):+.2f} .. {max(v):+.2f}   {skew:+.2f}   {best[1]} {best[0]:+.2f}")
    cells = {}
    for s in scored:
        cells[f"{s.get('voice')}/{s.get('mode')}"] = cells.get(f"{s.get('voice')}/{s.get('mode')}", 0) + 1
    lines.append("cells: " + ", ".join(f"{k} {v}" for k, v in sorted(cells.items())))
    return "\n".join(lines)


def _corr(a, b):
    ma, mb = statistics.mean(a), statistics.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return num / den if den else 0.0
