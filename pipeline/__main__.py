"""python -m pipeline <command>

Five commands. Harvest the pool, score it, draft themes into the theme bank,
draw a packet, see what is there.

There is no `review`, `serve` or `export`: the decision layer — keep, pass,
maybe, and the append-only trail under them — was removed on 2026-09-03 and
will be re-added later. Both banks are pools as they stand, and `draw` samples
the whole of them.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import facets as facets_mod
from . import harvest as harvest_mod
from . import sample as sample_mod
from . import themes as themes_mod
from .bank import EXAMPLES, THEMES, Bank
from . import biber


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pipeline", description="Fog Belt seeding pipeline")
    ap.add_argument("--root", default=".", help="repo root (default: cwd)")
    ap.add_argument("--out", default=None, help="override the extracted/ directory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser("harvest", help="extract passages from sources into the bank")
    h.add_argument("--only", nargs="*", help="source ids to run")
    h.add_argument("--min-score", type=float, default=0.0)
    h.add_argument("--per-1000", type=float, default=1.0, dest="per_1000",
                   help="passages per 1000 words of story (default 1.0, "
                        "clamped to 3-30 per story)")

    f = sub.add_parser("facets", help="score the pool on Biber D1-D6")
    f.add_argument("--refit", action="store_true",
                   help="re-fit the corpus statistics instead of reusing them")
    f.add_argument("--extremes", type=int, default=0, metavar="N",
                   help="print the N passages at each end of each dimension")

    t = sub.add_parser("themes", help="draft themes into the bank, and audit the grain")
    t.add_argument("--brief", metavar="SOURCE_ID",
                   help="emit a drafting brief for a session to work against")
    t.add_argument("--ingest", metavar="FILE", help="validate and bank drafted themes")
    t.add_argument("--source", help="source id for --ingest")
    t.add_argument("--force", action="store_true",
                   help="bank rows that fail validation (they will not be portable)")
    t.add_argument("--audit", action="store_true",
                   help="compare the banked themes against pipeline/grain.md")

    d = sub.add_parser("draw", help="draw a generation packet")
    d.add_argument("-n", "--examples", type=int, default=6)
    d.add_argument("-t", "--themes", type=int, default=2)
    d.add_argument("--temperature", type=float, default=0.85)
    d.add_argument("--no-coverage", action="store_true")
    d.add_argument("--facet", metavar="Q",
                   help="a cell (involved/narrative), a dimension=label pair, or "
                        "an unambiguous label. `--facet ?` lists them.")
    d.add_argument("--order-by", choices=sample_mod.ORDERINGS, default="d1",
                   help="render order of the drawn set (default: ascending d1)")
    d.add_argument("--seed", type=int)
    d.add_argument("--json", action="store_true", help="emit the packet as JSON")

    sub.add_parser("stats", help="what is in the banks")

    a = ap.parse_args(argv)
    root = Path(a.root)
    out = a.out

    if a.cmd == "harvest":
        harvest_mod.harvest(root, only=a.only, min_score=a.min_score,
                            per_1000=a.per_1000, out=out)

    elif a.cmd == "facets":
        facets_mod.score(root, out=out, refit=a.refit, extremes=a.extremes)

    elif a.cmd == "themes":
        if a.brief:
            print(themes_mod.brief(a.brief, root))
        elif a.ingest:
            if not a.source:
                sys.exit("--ingest needs --source <id>")
            themes_mod.ingest(a.ingest, a.source, root, out=out, force=a.force)
        elif a.audit:
            themes_mod.audit(root, out=out)
        else:
            sys.exit("themes needs --brief <source>, --ingest <file>, or --audit.")

    elif a.cmd == "draw":
        _check_facet(a.facet)
        packet = sample_mod.draw(
            root, out=out, n_examples=a.examples, n_themes=a.themes,
            temperature=a.temperature, coverage=not a.no_coverage,
            facet=a.facet, order_by=a.order_by, seed=a.seed,
        )
        if a.json:
            print(json.dumps(packet, ensure_ascii=False, indent=2))
        else:
            print(sample_mod.render(packet))
            if packet.get("path"):
                print(f"\n<!-- packet: {packet['path']} -->")

    elif a.cmd == "stats":
        sd = Path(a.out) if a.out else root / "extracted"
        for name, pool in (("examples", EXAMPLES), ("themes", THEMES)):
            st = Bank(sd, pool=pool).stats()
            print(f"{name:<9} pool {st['pool']:>5}  sources {st['sources']:>4}  "
                  f"facetted {st['facetted']:>5}")


def _check_facet(query: str | None) -> None:
    """Fail loudly on an unusable --facet rather than returning nothing."""
    if not query:
        return
    if query == "?":
        for dim in biber.ALL_DIMENSIONS:
            name, labels = biber.LABELS[dim]
            print(f"  {dim}  {name:<12s} {' | '.join(labels)}")
        print(f"\n  cells: {biber.CELLS[0]} … ({len(biber.CELLS)} of them)")
        print("  queries: a cell, dimension=label, or an unambiguous label")
        sys.exit(0)
    clash = biber.ambiguous(query)
    if clash:
        sys.exit(f"{query!r} is a label on more than one dimension "
                 f"({', '.join(clash)}). Say which: {clash[0]}={query}")


if __name__ == "__main__":
    main()
