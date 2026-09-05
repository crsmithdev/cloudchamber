"""Cut a story into passages by position-stratified random draw.

A story of W words yields clamp(round(W/1000), 3, 30) passages. The prose
blocks are divided into that many strata of roughly equal word count; in each
stratum one window is drawn at random: a run of consecutive paragraphs, 150 to
400 words, starting and ending on a paragraph boundary. A window overlapping an
already drawn one by more than half its tokens is redrawn. The RNG is seeded, so
the same story and seed give the same passages. No score decides anything.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from .doc import Doc, passage_id

MIN_WORDS = 150
MAX_WORDS = 400
PER_1000 = 1.0
FLOOR, CAP = 3, 30
MAX_OVERLAP = 0.5
TRIES_PER_STRATUM = 12


@dataclass
class Passage:
    id: str
    story_id: str
    text: str
    words: int
    stratum: int
    position: float
    seed: int
    withheld: bool = False


def quota(words: int) -> int:
    return max(FLOOR, min(CAP, round(words / 1000 * PER_1000)))


def _windows_from(blocks: list, start: int) -> list[tuple[int, int]]:
    """Every (start, end) block span from `start` that lands in 150..400 words."""
    out, total = [], 0
    for end in range(start, len(blocks)):
        total += blocks[end].words
        if total > MAX_WORDS:
            break
        if total >= MIN_WORDS:
            out.append((start, end + 1))
    return out


def _overlap(a: tuple[int, int], b: tuple[int, int], blocks) -> float:
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    if lo >= hi:
        return 0.0
    shared = sum(blocks[i].words for i in range(lo, hi))
    return shared / max(1, min(sum(blocks[i].words for i in range(*a)), sum(blocks[i].words for i in range(*b))))


def _withheld(text: str) -> bool:
    return "█" in text or "[REDACTED]" in text.upper() or "[DATA EXPUNGED]" in text.upper()


def cut(doc: Doc, seed: int = 0) -> list[Passage]:
    blocks = [b for b in doc.blocks if b.kind in ("prose", "quote") and b.words > 0]
    total = sum(b.words for b in blocks)
    if not blocks or total < MIN_WORDS:
        return []
    n = quota(total)
    rng = random.Random(f"{doc.source_id}:{seed}")
    # strata by cumulative words
    bounds, acc, k = [0], 0, 1
    for i, b in enumerate(blocks):
        acc += b.words
        if acc >= total * k / n and k < n:
            bounds.append(i + 1)
            k += 1
    bounds.append(len(blocks))
    chosen: list[tuple[int, int, int]] = []
    for s in range(len(bounds) - 1):
        lo, hi = bounds[s], bounds[s + 1]
        starts = list(range(lo, hi)) or [lo]
        for _ in range(TRIES_PER_STRATUM):
            st = rng.choice(starts)
            opts = _windows_from(blocks, st)
            if not opts:
                continue
            span = rng.choice(opts)
            if all(_overlap(span, (a, b), blocks) <= MAX_OVERLAP for a, b, _ in chosen):
                chosen.append((span[0], span[1], s))
                break
    # A stratum that sits inside one oversized paragraph yields nothing. Fill
    # the quota from anywhere the prose allows before giving up on it.
    tries = 0
    while len(chosen) < n and tries < TRIES_PER_STRATUM * n:
        tries += 1
        st = rng.randrange(len(blocks))
        opts = _windows_from(blocks, st)
        if not opts:
            continue
        span = rng.choice(opts)
        if all(_overlap(span, (a, b), blocks) <= MAX_OVERLAP for a, b, _ in chosen):
            stratum = next(s for s in range(len(bounds) - 1) if bounds[s] <= st < bounds[s + 1])
            chosen.append((span[0], span[1], stratum))
    out = []
    for a, b, s in sorted(chosen):
        text = "\n\n".join(blk.text for blk in blocks[a:b])
        out.append(Passage(passage_id(doc.source_id, text), doc.source_id, text, len(text.split()),
                           s, round(a / max(1, len(blocks) - 1), 4), seed, _withheld(text)))
    return out
