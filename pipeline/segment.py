"""Cut a Doc into candidate passages.

Passages are windows of consecutive blocks, 150-400 words, always beginning
and ending at a paragraph boundary. Windows overlap: a passage worth keeping
should not be missed because a fixed grid happened to split it. Overlap is
what makes the pool generous, which is the design — Chris culls, so recall
matters more than precision here.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .doc import Block, Doc, passage_id

MIN_WORDS = 150
MAX_WORDS = 400
# How many differently-sized windows to emit from the same starting block.
# 3 gives a short / medium / long reading of the same opening without
# flooding the pool with near-duplicates.
VARIANTS_PER_START = 3


@dataclass
class Passage:
    id: str
    text: str
    source_id: str
    title: str
    author: str = ""
    license: str = ""
    origin: str = ""
    words: int = 0
    position: float = 0.0  # where in the source it sits, 0.0-1.0
    block_span: tuple[int, int] = (0, 0)
    kinds: list[str] = field(default_factory=list)
    signals: dict = field(default_factory=dict)
    withheld: bool = False
    # Filled by `pipeline facets`, not by the harvester: a Biber dimension is
    # a z-score against the whole pool and cannot be computed one passage at a
    # time. Empty until that second pass runs.
    facets: dict = field(default_factory=dict)
    score: float = 0.0

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["block_span"] = list(self.block_span)
        return d


def _harvestable(b: Block) -> bool:
    """Headings and bare lists are structure, not prose."""
    return b.kind in ("prose", "quote")


def windows(doc: Doc) -> list[Passage]:
    blocks = doc.blocks
    idx = [i for i, b in enumerate(blocks) if _harvestable(b)]
    if not idx:
        return []

    out: list[Passage] = []
    seen: set[str] = set()

    for si, start in enumerate(idx):
        acc: list[int] = []
        total = 0
        emitted = 0

        for j in idx[si:]:
            # Stop a window at a heading: a heading between two paragraphs
            # means the second paragraph belongs to a different movement.
            if acc and any(
                blocks[k].kind == "heading" for k in range(acc[-1] + 1, j)
            ):
                break

            acc.append(j)
            total += blocks[j].words

            if total > MAX_WORDS:
                # A single block over the cap is emitted truncated at a
                # sentence boundary rather than discarded — long paragraphs
                # are common in the Datlow material and often the best prose.
                if len(acc) == 1:
                    p = _make(doc, acc, truncate=True)
                    if p and p.id not in seen:
                        seen.add(p.id)
                        out.append(p)
                break

            if total >= MIN_WORDS:
                p = _make(doc, acc)
                if p and p.id not in seen:
                    seen.add(p.id)
                    out.append(p)
                emitted += 1
                if emitted >= VARIANTS_PER_START:
                    break

    return out


def _truncate_at_sentence(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    clipped = " ".join(words[:max_words])
    # Back off to the last sentence-ending punctuation so the passage does
    # not end mid-clause.
    for end in range(len(clipped) - 1, int(len(clipped) * 0.5), -1):
        if clipped[end] in ".!?" and (end + 1 == len(clipped) or clipped[end + 1] in ' "\''):
            return clipped[: end + 1]
    return clipped


def _make(doc: Doc, block_idx: list[int], truncate: bool = False) -> Passage | None:
    blocks = [doc.blocks[i] for i in block_idx]
    text = "\n\n".join(b.text for b in blocks).strip()
    if truncate:
        text = _truncate_at_sentence(text, MAX_WORDS)
    n = len(text.split())
    if n < MIN_WORDS:
        return None
    return Passage(
        id=passage_id(doc.source_id, text),
        text=text,
        source_id=doc.source_id,
        title=doc.title,
        author=doc.author,
        license=doc.license,
        origin=doc.origin,
        words=n,
        position=round(sum(b.position for b in blocks) / len(blocks), 4),
        block_span=(block_idx[0], block_idx[-1]),
        kinds=sorted({b.kind for b in blocks}),
    )
