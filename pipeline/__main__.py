"""python -m pipeline <command>"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import harvest as harvest_mod
from . import review as review_mod
from . import sample as sample_mod
from . import themes as themes_mod
from .bank import THEME_DECISIONS, THEMES, Bank


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pipeline", description="Fog Belt seeding pipeline")
    ap.add_argument("--root", default=".", help="repo root (default: cwd)")
    ap.add_argument("--seeds", default=None, help="override seeds/ directory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser("harvest", help="extract passages from sources into the bank")
    h.add_argument("--only", nargs="*", help="source ids to run")
    h.add_argument("--min-score", type=float, default=0.0)
    h.add_argument("--per-doc", type=int, default=12,
                   help="best N passages per source document (default 12)")

    r = sub.add_parser("review", help="cull the pool: keep / pass / maybe")
    r.add_argument("--tag", help="only passages carrying this failure tag")
    r.add_argument("--order", choices=["score", "random", "source"], default="score")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--min-score", type=float, default=0.0)

    sub.add_parser("export", help="write kept passages to seeds/exemplars.md")

    d = sub.add_parser("draw", help="draw a generation packet")
    d.add_argument("-n", "--exemplars", type=int, default=6)
    d.add_argument("-t", "--themes", type=int, default=2)
    d.add_argument("--temperature", type=float, default=0.85)
    d.add_argument("--no-coverage", action="store_true")
    d.add_argument("--include-unlabelled", action="store_true")
    d.add_argument("--tag")
    d.add_argument("--seed", type=int)
    d.add_argument("--json", action="store_true", help="emit the packet as JSON")

    t = sub.add_parser("themes", help="theme extraction, both intakes")
    t.add_argument("--only", nargs="*")
    t.add_argument("--research", metavar="SOURCE_ID", help="emit a research brief")
    t.add_argument("--ingest", metavar="FILE", help="bank themes from a research session")
    t.add_argument("--source", help="source id for --ingest")

    s = sub.add_parser("stats", help="state of the banks")
    s.add_argument("--json", action="store_true")

    a = ap.parse_args(argv)
    root = Path(a.root)
    seeds = a.seeds

    if a.cmd == "harvest":
        harvest_mod.harvest(root, only=a.only, min_score=a.min_score,
                            per_doc=a.per_doc, seeds=seeds)

    elif a.cmd == "review":
        review_mod.review(root, seeds=seeds, tag=a.tag, order=a.order,
                          limit=a.limit, min_score=a.min_score)

    elif a.cmd == "export":
        review_mod.export(root, seeds=seeds)

    elif a.cmd == "draw":
        packet = sample_mod.draw(
            root, seeds=seeds, n_exemplars=a.exemplars, n_themes=a.themes,
            temperature=a.temperature, coverage=not a.no_coverage,
            include_unlabelled=a.include_unlabelled, tag=a.tag, seed=a.seed,
        )
        if a.json:
            print(json.dumps(packet, ensure_ascii=False, indent=2))
        else:
            print(sample_mod.render(packet))
            if packet.get("path"):
                print(f"\n<!-- packet: {packet['path']} -->")

    elif a.cmd == "themes":
        if a.research:
            print(themes_mod.research_brief(a.research, root))
        elif a.ingest:
            if not a.source:
                sys.exit("--ingest needs --source <id>")
            themes_mod.ingest(a.ingest, a.source, root, seeds=seeds)
        else:
            themes_mod.harvest_local(root, only=a.only, seeds=seeds)

    elif a.cmd == "stats":
        sd = Path(seeds) if seeds else root / "seeds"
        ex = Bank(sd).stats()
        th = Bank(sd, pool=THEMES, decisions=THEME_DECISIONS).stats()
        if a.json:
            print(json.dumps({"exemplars": ex, "themes": th}, indent=2))
        else:
            for name, st in (("exemplars", ex), ("themes", th)):
                print(f"{name}: pool {st['pool']}  keep {st['keep']}  "
                      f"pass {st['pass']}  maybe {st['maybe']}  "
                      f"unlabelled {st['unlabelled']}  sources {st['sources']}")
                if st["kept_by_tag"]:
                    for k, v in sorted(st["kept_by_tag"].items(), key=lambda x: -x[1]):
                        print(f"    {k:20s} {v}")


if __name__ == "__main__":
    main()
