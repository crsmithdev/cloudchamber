"""Harvest passages from sources into the exemplar bank.

Generous by design. The pool is meant to be larger than Chris wants to read in
one sitting; `pipeline review` is how it gets read down. Precision is his job,
recall is this file's job.
"""

from __future__ import annotations

from pathlib import Path

from . import read_pdf, read_scp, signals, sources
from .bank import Bank
from .doc import Block, Doc, clean_text, slugify
from .segment import Passage, windows


def read_markdown(path: Path, source_prefix: str = "md") -> Doc:
    """Plain markdown -> Doc. Headings become headings, everything else prose."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    doc = Doc(source_id=f"{source_prefix}/{slugify(path.stem)}", title=path.stem,
              origin=str(path), kind="criticism")
    for chunk in raw.split("\n\n"):
        c = chunk.strip()
        if not c:
            continue
        if c.startswith("#"):
            doc.blocks.append(Block(clean_text(c.lstrip("# ")), kind="heading"))
        elif c.startswith(("|", "```", "> ")):
            doc.blocks.append(Block(clean_text(c), kind="meta"))
        elif c.lstrip().startswith(("-", "*", "1.")):
            doc.blocks.append(Block(clean_text(c), kind="list"))
        else:
            doc.blocks.append(Block(clean_text(c), kind="prose"))
    return doc.finalize()


def docs_for(src: sources.Source, root: Path) -> list[Doc]:
    files = sources.resolve(src, root)
    out: list[Doc] = []
    for f in files:
        try:
            if src.reader == "scp":
                out.append(read_scp.parse(f, source_prefix=src.id))
            elif src.reader == "pdf":
                out.extend(read_pdf.parse(f, source_prefix=src.id, author=src.author))
            elif src.reader == "markdown":
                out.append(read_markdown(f, source_prefix=src.id))
        except Exception as e:
            print(f"  ! {f.name}: {type(e).__name__}: {e}")
    for d in out:
        if src.license and not d.license:
            d.license = src.license
        if src.author and not d.author:
            d.author = src.author
    return out


def score(p: Passage) -> Passage:
    s = signals.compute(p.text, p.position)
    ts = signals.tag_scores(s)
    p.signals = {**s, "tag_scores": ts}
    p.tags = signals.tags(ts)
    p.score = signals.register_score(s, ts)
    return p


def harvest(
    root: str | Path = ".",
    only: list[str] | None = None,
    min_score: float = 0.0,
    seeds: str | Path | None = None,
) -> dict:
    root = Path(root)
    bank = Bank(seeds or root / "seeds")
    all_passages: list[Passage] = []
    per_source: dict[str, int] = {}

    for src in sources.load(root):
        if only and src.id not in only:
            continue
        if not src.passages:
            continue
        if src.reader == "research":
            continue
        docs = docs_for(src, root)
        if not docs:
            print(f"{src.id}: no files matched {src.path!r}")
            continue
        found = 0
        for d in docs:
            for p in windows(d):
                p = score(p)
                if p.score >= min_score:
                    all_passages.append(p)
                    found += 1
        per_source[src.id] = found
        print(f"{src.id}: {len(docs)} docs -> {found} candidate passages")

    added, refreshed = bank.merge(all_passages)
    print(f"\nbank: +{added} new, {refreshed} refreshed, pool now {len(bank.load())}")
    return {"added": added, "refreshed": refreshed, "per_source": per_source}
