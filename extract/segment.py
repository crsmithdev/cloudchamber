"""Cut a story into passages by position-stratified random draw.

A story of W words yields clamp(round(W/1000), 3, 30) passages. The prose
blocks are divided into that many strata of roughly equal word count; in each
stratum one window is drawn at random: a run of consecutive paragraphs, 150 to
400 words, starting and ending on a paragraph boundary. A window overlapping an
already drawn one by more than half its tokens is redrawn. Windows are anchored to
paragraph content by hash, so a reader fix that changes one paragraph moves only
the windows that touch it. No score decides anything.
"""

from __future__ import annotations

import hashlib
import re
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
    suspect: list[str] | None = None    # artifact-screen reasons, None when clean


# --- artifact screen ------------------------------------------------------
# Deterministic marks for the residue a reader leaves. A mark is a reason to
# look, not a verdict: the queue serves suspects first and Chris decides.

_TERMINAL = re.compile(r"""[.!?…:;"'”’)\]*_—-]\s*$""")
_LOWER_START = re.compile(r"^[a-z]")
_DROPCAP = re.compile(r"^(?![IAO] )[A-Z] [a-z]{2,}")           # "T he door" but not "I am", "A man", "O lord"
_HYPHEN = re.compile(r"[a-z]- [a-z]")                          # "some- thing": a line-end hyphen the reflow kept
_OCR = re.compile(r"[~|¬]|[a-z]\d[a-z]")                       # scan glyphs; "wa1k"
_MARKUP = re.compile(r"\[\[|\]\]|##|@@|\|\|")

SUSPECT_REASONS = ("join", "dropcap", "hyphen", "ocr", "markup")


def suspects(text: str) -> list[str]:
    """Reasons a passage looks like reader residue, in SUSPECT_REASONS order; empty when clean."""
    paras = [p for p in text.split("\n\n") if p.strip()]
    found = set()
    for a, b in zip(paras, paras[1:]):
        if not _TERMINAL.search(a) and _LOWER_START.match(b):
            found.add("join")
    for p in paras:
        if _DROPCAP.match(p):
            found.add("dropcap")
    if _HYPHEN.search(text):
        found.add("hyphen")
    if _OCR.search(text):
        found.add("ocr")
    if _MARKUP.search(text):
        found.add("markup")
    return [r for r in SUSPECT_REASONS if r in found]


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


def _rank(seed: int, text: str, salt: str = "") -> str:
    return hashlib.sha1(f"{seed}|{salt}|{text}".encode()).hexdigest()


def cut(doc: Doc, seed: int = 0) -> list[Passage]:
    """Windows anchored to content, not to position counts. Within a stratum the
    start paragraph is the one whose hash of (seed, text) ranks lowest, and the
    window length is chosen by hash of the start paragraph too. So when a reader
    fix changes one paragraph, only the windows touching it move; every other
    story's passages and most of this story's keep their ids, and the verdicts
    on them stay attached without inheritance."""
    blocks = [b for b in doc.blocks if b.kind in ("prose", "quote") and b.words > 0]
    total = sum(b.words for b in blocks)
    if not blocks or total < MIN_WORDS:
        return []
    n = quota(total)
    bounds, acc, k = [0], 0, 1
    for i, b in enumerate(blocks):
        acc += b.words
        if acc >= total * k / n and k < n:
            bounds.append(i + 1)
            k += 1
    bounds.append(len(blocks))
    ranked = sorted(range(len(blocks)), key=lambda i: _rank(seed, blocks[i].text))
    chosen: list[tuple[int, int, int]] = []

    def try_start(st: int, stratum: int) -> bool:
        opts = _windows_from(blocks, st)
        if not opts:
            return False
        span = opts[int(_rank(seed, blocks[st].text, "len"), 16) % len(opts)]
        if all(_overlap(span, (a, b), blocks) <= MAX_OVERLAP for a, b, _ in chosen):
            chosen.append((span[0], span[1], stratum))
            return True
        return False

    for s in range(len(bounds) - 1):
        lo, hi = bounds[s], bounds[s + 1]
        for st in (i for i in ranked if lo <= i < hi):
            if try_start(st, s):
                break
    # A stratum inside one oversized paragraph yields nothing; fill the quota
    # from the best-ranked starts anywhere before giving up on it.
    for st in ranked:
        if len(chosen) >= n:
            break
        if any(a == st for a, _, _ in chosen):
            continue
        stratum = next(x for x in range(len(bounds) - 1) if bounds[x] <= st < bounds[x + 1])
        try_start(st, stratum)
    out = []
    for a, b, s in sorted(chosen):
        text = "\n\n".join(blk.text for blk in blocks[a:b])
        out.append(Passage(passage_id(doc.source_id, text), doc.source_id, text, len(text.split()),
                           s, round(a / max(1, len(blocks) - 1), 4), seed, _withheld(text), suspects(text) or None))
    return out
