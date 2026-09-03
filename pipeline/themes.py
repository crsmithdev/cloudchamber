"""Theme extraction — the second path.

A theme is not prose. It is a mechanism, a structural move, a way a setting
justifies its own cruelty. Themes seed *what gets made*; exemplars condition
*how it reads*. They come from two intakes:

  local     mined from the same original sources the passages come from.
            Structural, no model, no network. Produces candidates, not
            conclusions — same cull as the passages.

  research  for settings whose source fiction is too large to hold (setting-c, setting-b). Code cannot do this: it emits a research
            brief, a Claude session does the reading against online reference
            material, and the result is banked with `pipeline themes --ingest`.

Both land in `extracted/themes.jsonl` with the same decision mechanics as the
exemplar bank, so a theme Chris passes on stays passed and the trail survives.

This is the weakest component in the pipeline. It matches the grammatical
shapes a mechanism takes, which means it will hand back sentences that are
merely procedural. Cull hard.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from . import sources
from .bank import THEME_DECISIONS, THEMES, Bank, _now
from .doc import Doc

# --- local extraction -----------------------------------------------------
# Sentences that state how a thing works, who it is done to, or what it costs.
# These are the shapes a mechanism takes in prose, not a topic model.

MECHANISM = re.compile(
    r"\b(?:in order to|so that|which means|the effect is|the result is|"
    r"designed to|intended to|functions? (?:as|by)|operates? by|works? by|"
    r"is achieved by|requires? that|only if|unless|until such time|"
    r"is to be|must first|before .{0,40} can)\b",
    re.I,
)
COST = re.compile(
    r"\b(?:at the cost of|in exchange for|the price|pays? for|forfeit|"
    r"sacrific\w+|surrender\w*|gives? up|is lost|no longer able|permanently)\b",
    re.I,
)
NORMALIZED = re.compile(
    r"\b(?:routine|routinely|standard|customary|as usual|as scheduled|"
    r"annually|each year|every .{0,12}(?:day|week|month|year)|"
    r"normal(?:ly)?|expected|unremarkable|in the ordinary course)\b",
    re.I,
)
# Who it is done to, and at what size.
SUBJECT = re.compile(
    r"\b(?:subjects?|personnel|residents|population|civilians|inhabitants|"
    r"employees|patients|children|anyone who|those who|whoever|the pursuant|"
    r"participants?|candidates?|applicants?)\b",
    re.I,
)
# The thing cannot be undone, refused, or left.
IRREVERSIBLE = re.compile(
    r"\b(?:cannot be|irreversib\w+|permanent\w*|no way to|unable to (?:leave|stop|"
    r"refuse|reverse|undo)|for the rest of|remains? in|never again|"
    r"without pause|indefinitely)\b",
    re.I,
)

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")


def theme_id(source_id: str, text: str) -> str:
    norm = " ".join(text.lower().split())
    return "t" + hashlib.sha1(f"{source_id}\x00{norm}".encode()).hexdigest()[:11]


def _facets(sentence: str) -> list[str]:
    f = []
    if MECHANISM.search(sentence):
        f.append("mechanism")
    if COST.search(sentence):
        f.append("cost")
    if NORMALIZED.search(sentence):
        f.append("normalized")
    if SUBJECT.search(sentence):
        f.append("subject")
    if IRREVERSIBLE.search(sentence):
        f.append("irreversible")
    return f


def from_doc(doc: Doc, max_per_doc: int = 40) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for b in doc.blocks:
        if b.kind not in ("prose", "quote", "list"):
            continue
        for sent in SENT_SPLIT.split(b.text):
            sent = sent.strip()
            if not (40 <= len(sent) <= 400):
                continue
            facets = _facets(sent)
            # One facet is admissible but weak; mechanism is the load-bearing
            # one, so a lone non-mechanism facet is dropped as noise.
            if not facets:
                continue
            if len(facets) == 1 and facets[0] != "mechanism":
                continue
            tid = theme_id(doc.source_id, sent)
            if tid in seen:
                continue
            seen.add(tid)
            out.append({
                "id": tid,
                "label": " + ".join(facets),
                "text": sent,
                "facets": facets,
                "source_id": doc.source_id,
                "title": doc.title,
                "author": doc.author,
                "license": doc.license,
                "origin": doc.origin,
                "intake": "local",
                "position": b.position,
                "score": round(min(1.0, 0.30 + 0.18 * len(facets)), 4),
            })
            if len(out) >= max_per_doc:
                return out
    return out


def harvest_local(root: str | Path = ".", only: list[str] | None = None,
                  out: str | Path | None = None) -> dict:
    from .harvest import docs_for

    root = Path(root)
    bank = Bank(out or root / "extracted", pool=THEMES, decisions=THEME_DECISIONS)
    rows: list[dict] = []
    for src in sources.load(root):
        if only and src.id not in only:
            continue
        if not src.themes or src.reader == "research":
            continue
        docs = docs_for(src, root)
        found = 0
        for d in docs:
            got = from_doc(d)
            rows.extend(got)
            found += len(got)
        if docs:
            print(f"{src.id}: {len(docs)} docs -> {found} theme candidates")
    added, refreshed = bank.merge(rows)
    print(f"\nthemes: +{added} new, {refreshed} refreshed")
    return {"added": added, "refreshed": refreshed}


# --- research intake ------------------------------------------------------

BRIEF = """# THEME RESEARCH BRIEF — {sid}

*Emitted by `pipeline themes --research {sid}`. No code fetched anything;
this is a job for a Claude session with web access.*

{notes}

## What to come back with

Themes, not summary. Each one is a mechanism, a structural move, or a way this
setting justifies what it does to people. One or two sentences each. No plot,
no lore recitation, no character names unless the name IS the mechanism.

A good theme states how something works and what it costs. "The Imperium
consumes a thousand psykers a day to keep the Astronomican lit, and the
logistics of that consumption are a civil service job" is a theme. "The
Imperium is grim and dark" is not.

## Lines of enquiry

{lines}

## Constraints

- Reference material only — wikis, published guides, faction primers. Not
  source fiction, which is too large to hold and mostly not free to copy.
- Do not paste long verbatim passages. Themes are abstractions; the verbatim
  path is the exemplar bank and it does not draw from here.
- Aim for 15-30 themes. Generous, because Chris culls.

## How to file the result

Write a JSON array to a file, then:

    python -m pipeline themes --ingest <file.json> --source {sid}

Each object needs `text` and optionally `label` and `facets`:

    [
      {{"text": "...", "label": "mechanism + normalized",
        "facets": ["mechanism", "normalized"]}}
    ]
"""


def research_brief(source_id: str, root: str | Path = ".") -> str:
    for src in sources.load(root):
        if src.id == source_id:
            lines = "\n".join(f"- {q}" for q in src.research) or "- (none configured)"
            return BRIEF.format(sid=src.id, notes=src.notes or "", lines=lines)
    raise SystemExit(f"no source {source_id!r}; check sources.toml")


def ingest(path: str | Path, source_id: str, root: str | Path = ".",
           out: str | Path | None = None) -> int:
    """Bank themes produced by a research session."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("themes", [])
    rows = []
    for item in data:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        rows.append({
            "id": theme_id(source_id, text),
            "label": item.get("label", "researched"),
            "text": text,
            "facets": item.get("facets", []),
            "source_id": source_id,
            "title": item.get("title", source_id),
            "author": "",
            "license": "",
            "origin": item.get("origin", ""),
            "intake": "research",
            "position": 0.0,
            "score": float(item.get("score", 0.6)),
            "researched_at": _now(),
        })
    bank = Bank(out or Path(root) / "extracted", pool=THEMES, decisions=THEME_DECISIONS)
    added, refreshed = bank.merge(rows)
    print(f"ingested {len(rows)} themes for {source_id}: +{added} new, {refreshed} refreshed")
    return added
