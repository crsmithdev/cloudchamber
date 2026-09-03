"""Normalized document model.

Every source adapter — PDF, SCP wikidot, plain markdown — reduces to a Doc:
an ordered list of prose Blocks with provenance. Nothing downstream knows
or cares what the original format was.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, asdict
from typing import Iterator, Literal

BlockKind = Literal["prose", "quote", "heading", "list", "meta"]


@dataclass
class Block:
    """One paragraph-ish unit of text, with where it came from."""

    text: str
    kind: BlockKind = "prose"
    # Position within the document, 0.0 at the first block, 1.0 at the last.
    # The harvester uses this: endings behave differently from openings.
    position: float = 0.0
    # Page number for PDFs, section name for markup sources. Free-form.
    locator: str = ""

    @property
    def words(self) -> int:
        return len(self.text.split())


@dataclass
class Doc:
    """A normalized source document."""

    source_id: str  # stable, e.g. "scp/scp-2270" or "datlow-01/the-clay-party"
    title: str
    blocks: list[Block] = field(default_factory=list)
    author: str = ""
    license: str = ""
    origin: str = ""  # URL or file path the text came from
    kind: str = ""  # "fiction", "document", "criticism", "reference"
    meta: dict = field(default_factory=dict)

    def prose(self) -> Iterator[Block]:
        """Blocks that are actually prose — the only thing worth harvesting."""
        for b in self.blocks:
            if b.kind in ("prose", "quote"):
                yield b

    def word_count(self) -> int:
        return sum(b.words for b in self.blocks)

    def finalize(self) -> "Doc":
        """Assign positions once all blocks are in. Call before harvesting."""
        n = len(self.blocks)
        for i, b in enumerate(self.blocks):
            b.position = 0.0 if n <= 1 else i / (n - 1)
        return self

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# --- text hygiene shared by every adapter --------------------------------

_WS = re.compile(r"[ \t ]+")
_MULTINL = re.compile(r"\n{3,}")
# Soft hyphen, zero-width, and the private-use glyphs ebook converters leave.
_JUNK_CHARS = re.compile(r"[­​‌‍﻿-]")
_QUOTES = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "–": "-", "—": "--", "…": "...",
}


def clean_text(s: str, normalize_quotes: bool = False) -> str:
    """Whitespace and invisible-character hygiene.

    Quote normalization is OFF by default: exemplars are stored verbatim and
    typographic quotes are part of the prose. Turn it on only for signal
    computation, never for stored passage text.
    """
    s = _JUNK_CHARS.sub("", s)
    if normalize_quotes:
        for a, b in _QUOTES.items():
            s = s.replace(a, b)
    s = _WS.sub(" ", s)
    s = _MULTINL.sub("\n\n", s)
    return s.strip()


def passage_id(source_id: str, text: str) -> str:
    """Stable ID for a passage.

    Derived from source plus normalized text, so a re-harvest of the same
    material produces the same IDs and Chris's earlier keep/pass decisions
    still attach. This is what makes the decision trail durable across
    re-runs and across changes to the segmentation heuristics.
    """
    norm = " ".join(clean_text(text, normalize_quotes=True).lower().split())
    h = hashlib.sha1(f"{source_id}\x00{norm}".encode("utf-8")).hexdigest()
    return h[:12]


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:60] or "untitled"
