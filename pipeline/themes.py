"""Theme extraction — the second path.

A theme is not prose and it is not a span of a source. It is one sentence
carrying a mechanism and a turn: *the body altered to meet a written
specification, and the specification is a purchasing document.* Themes seed
**what gets made**; examples condition **how it reads**.

The shape is not invented here. `playbook.md` §2-§5 is the only seed format in
this project with evidence behind it — twenty-five stories came out of it — and
`GRAIN` below is that bank measured. `research/themes.md` §11 has the numbers
and the argument, including why a labelled `mechanism / subject / cost` record
was tried and rejected: a frame has nowhere to put the turn, and two frames
will not combine the way playbook §1.1 needs two entries to.

**Local sentence extraction is gone.** It matched grammatical shapes over
sentences and banked the sentence, which is extractive where the task is
abstractive: the target string does not occur in the source. Measured over the
432 rows it produced, 53% carried a proper noun welding them to their article,
61% contained unresolved deixis, and not one signature spanned two documents.
`research/themes.md` §1 is the post-mortem.

So there is one intake, and a model drafts into it:

  brief     `pipeline themes --brief <source>` emits a drafting brief — the
            grain spec, real §2 bullets as few-shot, and what to read.
  ingest    a session drafts against the brief and writes JSON;
            `--ingest` validates every row and banks what passes.

Validation is split deliberately. `check()` enforces the properties that hold
for **every** §2 bullet — no proper nouns, no leading deixis, one sentence, in
the length band. `audit()` compares a whole bank against the properties that
are *distributional* in §2 — a turn in 63%, a named subject in 40%, a cost in
17% — because a per-row rule for those would be tighter than the evidence.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from . import sources
from .bank import THEME_DECISIONS, THEMES, Bank, _now
from .doc import Doc

# --- the grain, measured off playbook §2 ----------------------------------
# 376 bullets. Regenerate with `pipeline themes --audit --playbook`.

GRAIN = {
    # §2 runs p10 15 / p90 32 / max 50. The band is wider than that on both
    # sides: "the institution's memory-erasure apparatus revealed to run on
    # ground-up people" is nine words and is a theme. Calibrated so §2 itself
    # passes at 99% — a validator that rejects its own reference corpus is
    # measuring the validator.
    "min_words": 9,
    "max_words": 44,
    "median_words": 21,
    "turn_rate": 0.63,      # distributional, not a per-row rule
    "subject_rate": 0.40,
    "cost_rate": 0.17,
}

# A turn: the clause that makes a working thing the mechanism. §1.3 calls it
# the slate's signature.
TURN = re.compile(r"(?:\band the \b|\bso that\b|\brather than\b|\bbut \b|, and |: |"
                  r"\bwhich is\b|\band it \b|—)", re.I)
WHO = re.compile(
    r"\b(?:who|whoever|subjects?|bod(?:y|ies)|persons?|people|staff|patients?|"
    r"children|survivors?|victims?|anyone|residents|population|believers|"
    r"clerk|man|woman|families|inhabitants|personnel|crew|worker)\b", re.I)
COST = re.compile(
    r"\b(?:cost|price|pays?|paid|lose|loses|lost|forfeit|never|permanent(?:ly)?|"
    r"forever|cannot|can't|no longer|irreversible|nothing left|leaves?|left)\b", re.I)
# A capitalised word that is not opening a sentence: a name welded to a source.
PROPER = re.compile(r"(?<![.!?:]\s)(?<!^)\b[A-Z][a-z]{2,}\b", re.M)
LEADING_DEIXIS = re.compile(
    r"^\s*(?:this|that|these|those|it|its|they|them|their|he|his|she|her|such)\b", re.I)
SENTENCES = re.compile(r"[.!?](?:\s|$)")
# Designations the SCP corpus is full of and which are never portable.
DESIGNATION = re.compile(r"\b(?:SCP|MTF|GOI|Item|Site|Procedure|Protocol|Document|"
                         r"Addendum|Class)[-\s]?[-\w]*\d", re.I)


def theme_id(source_id: str, text: str) -> str:
    norm = " ".join(text.lower().split())
    return "t" + hashlib.sha1(f"{source_id}\x00{norm}".encode("utf-8")).hexdigest()[:11]


# --- acceptance -----------------------------------------------------------


def check(text: str) -> list[str]:
    """Reasons this is not a theme. Empty list means it passes.

    Only the properties that are universal in playbook §2 are enforced here.
    The distributional ones live in `audit`.
    """
    t = (text or "").strip()
    if not t:
        return ["empty"]
    bad = []
    n = len(t.split())
    if n < GRAIN["min_words"]:
        bad.append(f"too short ({n}w, min {GRAIN['min_words']})")
    if n > GRAIN["max_words"]:
        bad.append(f"too long ({n}w, max {GRAIN['max_words']}) — compress to one sentence")
    # Two is allowed: §2's second sentence is usually the turn — "It has been
    # tried once, and it worked."
    if len([s for s in SENTENCES.split(t) if s.strip()]) > 2:
        bad.append("more than two sentences")
    if LEADING_DEIXIS.match(t):
        bad.append("opens on a deictic — not self-contained")
    if DESIGNATION.search(t):
        bad.append("carries a designation (SCP-nnnn, Site-nn) — not portable")
    names = [m for m in PROPER.findall(t)]
    if names:
        bad.append(f"carries a proper noun ({', '.join(sorted(set(names))[:3])}) — not portable")
    return bad


def measure(texts: list[str]) -> dict:
    """The six numbers that define the grain, over any set of lines."""
    n = len(texts) or 1
    lens = sorted(len(t.split()) for t in texts) or [0]
    return {
        "n": len(texts),
        "median_words": lens[len(lens) // 2],
        "p10_words": lens[len(lens) // 10],
        "p90_words": lens[int(len(lens) * 0.9)],
        "turn_rate": sum(1 for t in texts if TURN.search(t)) / n,
        "subject_rate": sum(1 for t in texts if WHO.search(t)) / n,
        "cost_rate": sum(1 for t in texts if COST.search(t)) / n,
        "proper_rate": sum(1 for t in texts if PROPER.search(t)) / n,
        "deictic_rate": sum(1 for t in texts if LEADING_DEIXIS.match(t)) / n,
    }


def playbook_bullets(root: str | Path = ".") -> list[str]:
    """The §2 bank, as the reference distribution."""
    text = (Path(root) / "playbook.md").read_text(encoding="utf-8")
    body = text[text.find("# 2. THEME BANK"):text.find("# 3. DREAD")]
    out = []
    for line in re.findall(r"^- (.+)$", body, re.M):
        line = re.sub(r"`\[[^\]]+\]`", "", line).strip()
        if len(line.split()) > 3:
            out.append(line)
    return out


def audit(root: str | Path = ".", out: str | Path | None = None) -> dict:
    """Compare the banked themes against playbook §2 on the same measures."""
    bank = Bank(out or Path(root) / "extracted", pool=THEMES, decisions=THEME_DECISIONS)
    banked = [r.get("text", "") for r in bank.load().values()]
    ref = measure(playbook_bullets(root))
    got = measure(banked) if banked else None

    print(f"{'':<22}{'playbook §2':>14}{'banked':>14}")
    rows = [("n", "n", "{:.0f}"), ("median words", "median_words", "{:.0f}"),
            ("p10 / p90", None, None),
            ("carries a turn", "turn_rate", "{:.0%}"),
            ("names a subject", "subject_rate", "{:.0%}"),
            ("implies a cost", "cost_rate", "{:.0%}"),
            ("proper nouns", "proper_rate", "{:.0%}"),
            ("opens deictic", "deictic_rate", "{:.0%}")]
    for label, key, fmt in rows:
        if key is None:
            r = f"{ref['p10_words']}–{ref['p90_words']}"
            g = f"{got['p10_words']}–{got['p90_words']}" if got else "—"
            print(f"{label:<22}{r:>14}{g:>14}")
            continue
        r = fmt.format(ref[key])
        g = fmt.format(got[key]) if got else "—"
        print(f"{label:<22}{r:>14}{g:>14}")
    if not banked:
        print("\nnothing banked. `pipeline themes --brief <source>` to start.")
    return {"playbook": ref, "banked": got}


# --- the drafting brief ---------------------------------------------------

BRIEF = """# THEME BRIEF — {sid}

*Emitted by `pipeline themes --brief {sid}`. A session reads the source and
drafts themes into JSON; `pipeline themes --ingest <file> --source {sid}`
validates and banks them. Nothing here is banked automatically.*

## What a theme is

One sentence carrying **a mechanism and a turn**. The turn is the move
playbook §1.3 calls the slate's signature: take a real thing that works — good,
audited, effective, not in doubt — and make it the mechanism.

These are real entries from playbook §2, the bank that produced the slate.
Match this grain. Do not summarise them, do not explain them, do not write
about them.

{shots}

## Hard rules — a row failing any of these is rejected on ingest

- **{lo}–{hi} words**, one sentence. The §2 median is {med}.
- **No proper nouns and no designations.** Not `SCP-2718`, not `Site-19`, not
  `Factory Financial Management`. A theme carrying its source's names drags a
  generation call back toward that article instead of seeding a new one.
- **Self-contained.** No opening *this* / *it* / *the subject* with the
  antecedent left in the article.

## Draft by answering these, then compress

Answer them for yourself; **do not** write them out as fields. The compressed
sentence is the artefact — a labelled record has nowhere to put the turn.

1. **mechanism** — the process, stated as a process.
2. **subject** — who it is done to, and at what scale.
3. **cost** — what is given up, and whether it returns.
4. **normalisation** — how the setting makes it ordinary.

Then write one sentence that *implies* all four without listing them.

## Two kill tests

- **Persistence.** Would this recur across more than one story? A property of
  exactly one article is a detail, not a theme.
- **Motific use.** Is the mechanism what the source is *about*, or something it
  merely mentions? An article that names a sacrifice is not an article whose
  mechanism is sacrifice.

## What to read

{notes}

{lines}

## Output

A JSON array. `text` is the only required field.

```json
[
  {{"text": "The criterion is nine years old, arbitrary, and load-bearing: raise it and the whole series restarts at one.",
    "note": "optional — what in the source this abstracts"}}
]
```

Aim for 6–12. Fewer good ones beats more.
"""


def brief(source_id: str, root: str | Path = ".", shots: int = 8) -> str:
    import random

    bullets = playbook_bullets(root)
    picked = random.SystemRandom().sample(bullets, min(shots, len(bullets)))
    shot_text = "\n".join(f"> {b}" for b in picked)
    for src in sources.load(root):
        if src.id == source_id:
            lines = "\n".join(f"- {q}" for q in getattr(src, "research", []) or [])
            if src.kind == "setting":
                lines += (
                    f"\n\nRead `sources/summaries/{src.id}.md` and `sources/settings/{src.id}.md` "
                    "in full first. A theme abstracts from what the lore file's §5 "
                    "documents and §8 leaves open; nothing in its §7 seeds anything, "
                    "and the setting's nouns stay in the lore file, not in the theme."
                )
            return BRIEF.format(
                sid=src.id, notes=src.notes or "", lines=lines, shots=shot_text,
                lo=GRAIN["min_words"], hi=GRAIN["max_words"], med=GRAIN["median_words"])
    raise SystemExit(f"no source {source_id!r}; check sources.toml")


# --- ingest ---------------------------------------------------------------


def ingest(path: str | Path, source_id: str, root: str | Path = ".",
           out: str | Path | None = None, force: bool = False) -> int:
    """Validate drafted themes and bank the ones that pass."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("themes", [])

    rows, rejected = [], []
    for item in data:
        text = (item.get("text") if isinstance(item, dict) else str(item) or "").strip()
        bad = check(text)
        if bad and not force:
            rejected.append((text, bad))
            continue
        rows.append({
            "id": theme_id(source_id, text),
            "text": text,
            "note": (item.get("note") or "").strip() if isinstance(item, dict) else "",
            "source_id": source_id,
            "title": item.get("title", source_id) if isinstance(item, dict) else source_id,
            "intake": "drafted",
            "drafted_at": _now(),
        })

    if rejected:
        print(f"{len(rejected)} rejected:")
        for text, bad in rejected:
            print(f"  - {'; '.join(bad)}")
            print(f"    {text[:96]}")
    if not rows:
        print("nothing banked.")
        return 0

    bank = Bank(out or Path(root) / "extracted", pool=THEMES, decisions=THEME_DECISIONS)
    added, refreshed = bank.merge(rows)
    print(f"banked {len(rows)} for {source_id}: +{added} new, {refreshed} refreshed")
    m = measure([r["text"] for r in rows])
    print(f"  median {m['median_words']}w  turn {m['turn_rate']:.0%}  "
          f"subject {m['subject_rate']:.0%}  cost {m['cost_rate']:.0%}"
          f"   (§2: {GRAIN['median_words']}w / {GRAIN['turn_rate']:.0%} / "
          f"{GRAIN['subject_rate']:.0%} / {GRAIN['cost_rate']:.0%})")
    return added


def from_doc(doc: Doc, max_per_doc: int = 40) -> list[dict]:
    """Removed. Kept as a named failure so the mistake is not repeated.

    Local sentence extraction banked spans of the source as themes. See the
    module docstring and `research/themes.md` §1.
    """
    raise NotImplementedError(
        "local sentence extraction was removed on 2026-09-03: it is extractive "
        "where the task is abstractive. Use `pipeline themes --brief <source>`."
    )
