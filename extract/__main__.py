"""python -m extract <read|segment|facets|embed> [--only ID ...] [--seed N] [--refit]

read      manifest sources -> stories (reading includes splitting)
segment   stories -> passages, position-stratified
facets    fit Biber D1-D6 over the pool and label every passage
embed     embed themes that have none (needs sentence-transformers)

With no --only, the dev subset from the manifest is read.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import facets as facets_mod
from . import manifest, pdf, scp, segment
from .store import now, open_db


def cmd_read(root: Path, con, args) -> None:
    srcs = manifest.select(manifest.load(root), args.only)
    dev_only = not args.only
    for s in srcs:
        files = s.files(root, dev_only=dev_only)
        if not files:
            print(f"{s.id}: no files match {s.path}")
            continue
        con.execute("INSERT OR REPLACE INTO sources (id, path, reader, genre, author, license, dev, read_at) VALUES (?,?,?,?,?,?,?,?)",
                    (s.id, s.path, s.reader, s.genre, s.author, s.license, int(s.dev), now()))
        con.execute("DELETE FROM passages WHERE story_id IN (SELECT id FROM stories WHERE source_id = ?)", (s.id,))
        con.execute("DELETE FROM stories WHERE source_id = ?", (s.id,))
        n = 0
        for f in files:
            if s.reader == "pdf":
                docs = pdf.read(f, s.id, author=s.author, genre=s.genre, manifest_stories=s.stories or None)
            else:
                docs = [scp.parse(f, source_prefix=s.id)]
            for ord_, d in enumerate(docs):
                text = "\n\n".join(b.text for b in d.blocks if b.kind in ("prose", "quote") and b.text.strip())
                con.execute("INSERT OR REPLACE INTO stories (id, source_id, ord, title, author, genre, words, text, locator, split_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (d.source_id, s.id, d.meta.get("ord", ord_), d.title, d.author or s.author, s.genre,
                             len(text.split()), text, d.meta.get("pages", f.name), d.meta.get("split_by", "single")))
                n += 1
        con.commit()
        print(f"{s.id}: {len(files)} file(s) -> {n} stories")


def cmd_segment(root: Path, con, args) -> None:
    q = "SELECT id, source_id, title, author, text FROM stories" + (" WHERE source_id IN (%s)" % ",".join("?" * len(args.only)) if args.only else "")
    rows = con.execute(q, args.only or []).fetchall()
    from .doc import Block, Doc
    total = 0
    for r in rows:
        doc = Doc(source_id=r["id"], title=r["title"], author=r["author"])
        doc.blocks = [Block(p) for p in r["text"].split("\n\n") if p.strip()]
        doc.finalize()
        con.execute("DELETE FROM passages WHERE story_id = ?", (r["id"],))
        ps = segment.cut(doc, seed=args.seed)
        for p in ps:
            con.execute("INSERT OR REPLACE INTO passages (id, story_id, text, words, stratum, position, seed, withheld, first_seen) VALUES (?,?,?,?,?,?,?,?,?)",
                        (p.id, p.story_id, p.text, p.words, p.stratum, p.position, p.seed, int(p.withheld), now()))
        total += len(ps)
    con.commit()
    print(f"{len(rows)} stories -> {total} passages (seed {args.seed})")


def cmd_facets(root: Path, con, args) -> None:
    res = facets_mod.fit_and_score(con, refit=args.refit)
    print(f"backend {res['backend']} · {res['n']} passages · {'refit' if res['refit'] else 'existing fit'}")
    print(facets_mod.report(res["scored"]))


def cmd_embed(root: Path, con, args) -> None:
    try:
        from sentence_transformers import SentenceTransformer
    except ModuleNotFoundError:
        raise SystemExit("embed: sentence-transformers is not installed (pip install --user --break-system-packages sentence-transformers)")
    import numpy as np
    if args.stdin:
        texts = json.load(sys.stdin)
        model = SentenceTransformer(args.model)
        vecs = model.encode(texts, normalize_embeddings=True)
        json.dump([[round(float(x), 6) for x in v] for v in vecs], sys.stdout)
        return
    rows = con.execute("SELECT id, text FROM themes WHERE embedding IS NULL").fetchall()
    if not rows:
        print("embed: nothing to do")
        return
    model = SentenceTransformer(args.model)
    vecs = model.encode([r["text"] for r in rows], normalize_embeddings=True)
    for r, v in zip(rows, vecs):
        con.execute("UPDATE themes SET embedding = ? WHERE id = ?", (np.asarray(v, dtype=np.float32).tobytes(), r["id"]))
    con.commit()
    print(f"embed: {len(rows)} themes with {args.model}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="extract", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="repo root")
    ap.add_argument("--db", default=None, help="sqlite path (default data/fogbelt.db or $FOGBELT_DB)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("read"); r.add_argument("--only", nargs="*")
    s = sub.add_parser("segment"); s.add_argument("--only", nargs="*"); s.add_argument("--seed", type=int, default=0)
    f = sub.add_parser("facets"); f.add_argument("--refit", action="store_true")
    e = sub.add_parser("embed"); e.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    e.add_argument("--stdin", action="store_true", help="embed a JSON array of texts from stdin; print vectors as JSON")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    con = open_db(root, args.db)
    {"read": cmd_read, "segment": cmd_segment, "facets": cmd_facets, "embed": cmd_embed}[args.cmd](root, con, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
