"""python -m pipeline <command>"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import facets as facets_mod
from . import harvest as harvest_mod
from . import review as review_mod
from . import sample as sample_mod
from . import serve as serve_mod
from . import themes as themes_mod
from .bank import THEME_DECISIONS, THEMES, Bank
from . import biber
from .biber import CELLS


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pipeline", description="Fog Belt seeding pipeline")
    ap.add_argument("--root", default=".", help="repo root (default: cwd)")
    ap.add_argument("--out", default=None, help="override the extracted/ directory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser("harvest", help="extract passages from sources into the bank")
    h.add_argument("--only", nargs="*", help="source ids to run")
    h.add_argument("--min-score", type=float, default=0.0)
    h.add_argument("--per-doc", type=int, default=12,
                   help="best N passages per source document (default 12)")

    f = sub.add_parser("facets", help="score the pool on Biber D1/D2")
    f.add_argument("--refit", action="store_true",
                   help="re-fit the corpus statistics instead of reusing them")
    f.add_argument("--extremes", type=int, default=0, metavar="N",
                   help="print the N passages at each end of each dimension")
    # No --themes: a Biber dimension over a one-sentence theme is noise, and
    # themes.jsonl already uses `facets` for something else entirely.

    r = sub.add_parser("review", help="cull the pool: keep / pass / maybe")
    r.add_argument("--triage", action="store_true",
                   help=f"first ~{review_mod.TRIAGE_WORDS} words only; x expands")
    r.add_argument("--compare", action="store_true",
                   help="five at a time, pick the best; ties encouraged")
    r.add_argument("--themes", action="store_true",
                   help="dense multi-select over the theme bank")
    r.add_argument("--batch", type=int, default=5, help="screen size for --compare")
    r.add_argument("--per-screen", type=int, default=20,
                   help="screen size for --themes")
    r.add_argument("--facet", metavar="Q",
                   help="a cell (involved/narrative), a dimension=label pair "
                        "(persuasion=persuasive), or an unambiguous label "
                        "(abstract). `--facet ?` lists them all.")
    r.add_argument("--withheld", action="store_true",
                   help="only passages carrying the withheld flag")
    r.add_argument("--order", choices=review_mod.ORDERS, default="score")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--min-score", type=float, default=0.0)

    v = sub.add_parser("serve", help="the cull in a browser: ledger / deck / bench")
    v.add_argument("--port", type=int, default=3002,
                   help="first port to try (default 3002; walks up if busy)")
    v.add_argument("--no-open", action="store_true", help="do not open a browser")

    sub.add_parser("export", help="write kept passages to extracted/exemplars.md")

    d = sub.add_parser("draw", help="draw a generation packet")
    d.add_argument("-n", "--exemplars", type=int, default=6)
    d.add_argument("-t", "--themes", type=int, default=2)
    d.add_argument("--temperature", type=float, default=0.85)
    d.add_argument("--no-coverage", action="store_true")
    d.add_argument("--include-unlabelled", action="store_true")
    d.add_argument("--facet", metavar="Q",
                   help="same query language as `review --facet`")
    d.add_argument("--order-by", choices=sample_mod.ORDERINGS, default="d1",
                   help="render order of the drawn set (default: ascending d1)")
    d.add_argument("--seed", type=int)
    d.add_argument("--json", action="store_true", help="emit the packet as JSON")

    t = sub.add_parser("themes", help="draft themes into the bank, and audit the grain")
    t.add_argument("--brief", metavar="SOURCE_ID",
                   help="emit a drafting brief for a session to work against")
    t.add_argument("--ingest", metavar="FILE", help="validate and bank drafted themes")
    t.add_argument("--source", help="source id for --ingest")
    t.add_argument("--force", action="store_true",
                   help="bank rows that fail validation (they will not be portable)")
    t.add_argument("--audit", action="store_true",
                   help="compare the banked themes against the playbook §2 grain")

    s = sub.add_parser("stats", help="state of the banks")
    s.add_argument("--json", action="store_true")
    s.add_argument("--target", type=int, default=0, metavar="N",
                   help="keeps wanted per facet cell; reports what is short")

    a = ap.parse_args(argv)
    root = Path(a.root)
    out = a.out

    if a.cmd == "harvest":
        harvest_mod.harvest(root, only=a.only, min_score=a.min_score,
                            per_doc=a.per_doc, out=out)

    elif a.cmd == "facets":
        facets_mod.score(root, out=out, refit=a.refit, extremes=a.extremes)

    elif a.cmd == "review":
        if a.triage and a.compare:
            sys.exit("--triage and --compare are different modes; pick one")
        _check_facet(a.facet)
        if a.themes:
            review_mod.review_themes(root, out=out, per_screen=a.per_screen,
                                     limit=a.limit)
        else:
            mode = "triage" if a.triage else "compare" if a.compare else "full"
            review_mod.review(root, out=out, facet=a.facet, order=a.order,
                              limit=a.limit, min_score=a.min_score, mode=mode,
                              batch=a.batch, withheld=a.withheld)

    elif a.cmd == "serve":
        serve_mod.serve(root, out=out, port=a.port, open_browser=not a.no_open)

    elif a.cmd == "export":
        review_mod.export(root, out=out)

    elif a.cmd == "draw":
        _check_facet(a.facet)
        packet = sample_mod.draw(
            root, out=out, n_exemplars=a.exemplars, n_themes=a.themes,
            temperature=a.temperature, coverage=not a.no_coverage,
            include_unlabelled=a.include_unlabelled, facet=a.facet,
            order_by=a.order_by, seed=a.seed,
        )
        if a.json:
            print(json.dumps(packet, ensure_ascii=False, indent=2))
        else:
            print(sample_mod.render(packet))
            if packet.get("path"):
                print(f"\n<!-- packet: {packet['path']} -->")

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
            sys.exit("themes needs --brief <source>, --ingest <file>, or --audit. "
                     "Local sentence extraction was removed; see research/themes.md.")

    elif a.cmd == "stats":
        sd = Path(a.out) if a.out else root / "extracted"
        ex = Bank(sd).stats(target_per_cell=a.target)
        th = Bank(sd, pool=THEMES, decisions=THEME_DECISIONS).stats()
        if a.json:
            print(json.dumps({"exemplars": ex, "themes": th}, indent=2))
        else:
            for name, st in (("exemplars", ex), ("themes", th)):
                print(f"{name}: pool {st['pool']}  keep {st['keep']}  "
                      f"pass {st['pass']}  maybe {st['maybe']}  "
                      f"unlabelled {st['unlabelled']}  sources {st['sources']}")
                if st.get("artifacts"):
                    print(f"    {st['artifacts']} flagged as extraction artifacts "
                          f"— a stripper bug, not a verdict")
                if st["keep_rate"]:
                    tail = "  ".join(f"{r:.0%}" for r in st["keep_rate"][-8:])
                    print(f"    keep rate per 50: {tail}")
                for k, v in sorted(st["kept_by_facet"].items(), key=lambda x: -x[1]):
                    print(f"    {k:32s} {v}")
                if st.get("cells_short"):
                    print(f"    short of {st['target_per_cell']}/cell: "
                          + ", ".join(f"{c} (-{n})"
                                      for c, n in st["cells_short"].items()))


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
