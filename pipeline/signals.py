"""Structural signals over a passage.

One job: score register fitness, so the pool sorts usefully. Everything here
is lexical and structural. No model reads anything. Every signal is a named,
inspectable number between 0 and 1 — when a passage sorts oddly you can see
exactly which term did it, which you cannot do with an embedding.

**The six failure tags used to live here and are gone.** They were coined in
one session, grounded in nothing, and steered the sort order: the
`0.30 * max(tag_scores)` term in `register_score` contributed a mean of 0.119,
was the largest positive term for 199 of 1,024 passages, and swapped 11 of the
top 12 when removed. An unvalidated taxonomy deciding what gets read first is
worse than no taxonomy. What describes a passage now is its Biber facets —
see `biber.py` and `research/tagging.md` — which are fitted to the corpus
rather than asserted over it.

`withheld` survives as a standalone flag, not as a tag. Redaction and elision
are a genuine register move and are cleanly detectable without a taxonomy
around them.

These are recall instruments, not verdicts.
"""

from __future__ import annotations

import re
import statistics

# --- lexicons -------------------------------------------------------------
# Deliberately small and concrete. A big lexicon fires on everything.

INTENSIFIER = {
    "very", "extremely", "incredibly", "utterly", "absolutely", "horribly",
    "terribly", "unbelievably", "shockingly", "amazingly", "truly", "really",
    "deeply", "profoundly", "immensely", "vastly", "hugely", "totally",
    "completely", "entirely", "desperately", "frantically", "violently",
    "brutally", "savagely", "unimaginable", "indescribable", "nightmarish",
    "eldritch", "unspeakable", "unfathomable", "monstrous", "horrific",
    "terrifying", "chilling", "haunting", "eerie", "sinister", "ominous",
}


WITHHOLDING = {
    "unknown", "unclear", "undetermined", "unable", "never", "no record",
    "not recorded", "not found", "missing", "absent", "redacted", "expunged",
    "withheld", "declined", "refused", "unavailable", "inconclusive",
    "unaccounted", "unidentified", "unreported", "silence", "silent",
    "nothing", "no further", "no comment", "no explanation",
}


WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
SENT = re.compile(r"[.!?](?:\s|$)")
NUMERAL = re.compile(r"\b\d[\d,.]*\b")
UNIT = re.compile(
    r"\b\d+(?:\.\d+)?\s?(?:mm|cm|m|km|kg|g|mg|ml|l|hz|db|°|percent|%|"
    r"hours?|minutes?|seconds?|days?|weeks?|months?|years?)\b",
    re.I,
)
PROPER = re.compile(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b", re.M)
ADVERB = re.compile(r"\b\w+ly\b", re.I)
DIALOGUE = re.compile(r"[“\"][^”\"]{3,}[”\"]")
ELLIPSIS = re.compile(r"\.\.\.|…")
REDACTED = re.compile(r"\[REDACTED\]|█+")


def _ratio(hits: int, total: int, saturate: float) -> float:
    """Map a rate onto 0-1 with a soft ceiling at `saturate`."""
    if total <= 0:
        return 0.0
    return min(1.0, (hits / total) / saturate)


def _lex_hits(words: list[str], lex: set) -> int:
    return sum(1 for w in words if w in lex)


def _phrase_hits(low: str, lex: set) -> int:
    return sum(low.count(p) for p in lex if " " in p)


def compute(text: str, position: float = 0.5) -> dict:
    """Return every signal for one passage. Values are 0-1 unless noted."""
    low = text.lower()
    words = [w.lower() for w in WORD.findall(text)]
    n = len(words) or 1
    sentences = [s for s in SENT.split(text) if s.strip()]
    slens = [len(WORD.findall(s)) for s in sentences] or [n]

    intensifier = _ratio(_lex_hits(words, INTENSIFIER), n, 0.020)
    withholding = _ratio(
        _lex_hits(words, WITHHOLDING) + _phrase_hits(low, WITHHOLDING), n, 0.025
    )

    numerals = _ratio(len(NUMERAL.findall(text)), n, 0.020)
    units = _ratio(len(UNIT.findall(text)), n, 0.010)
    propers = _ratio(len(PROPER.findall(text)), n, 0.035)
    adverbs = _ratio(len(ADVERB.findall(text)), n, 0.045)
    dialogue = _ratio(sum(len(m) for m in DIALOGUE.findall(text)), len(text) or 1, 0.35)
    ellipsis = _ratio(len(ELLIPSIS.findall(text)), len(sentences) or 1, 0.15)
    redaction = _ratio(len(REDACTED.findall(text)), len(sentences) or 1, 0.10)

    # Sentence-length variance, normalized. Flat prose and frantic prose both
    # read badly; the target register varies.
    var = statistics.pstdev(slens) if len(slens) > 1 else 0.0
    variance = min(1.0, var / 12.0)
    mean_len = statistics.mean(slens)

    # Concreteness: things you could point at.
    concrete = min(1.0, 0.45 * numerals + 0.20 * units + 0.35 * propers)

    # Flatness: pressure delivered without the tone rising to meet it.
    flatness = max(0.0, 1.0 - intensifier)

    return {
        "intensifier": round(intensifier, 4),
        "withholding": round(withholding, 4),
        "numerals": round(numerals, 4),
        "units": round(units, 4),
        "propers": round(propers, 4),
        "adverbs": round(adverbs, 4),
        "dialogue": round(dialogue, 4),
        "ellipsis": round(ellipsis, 4),
        "redaction": round(redaction, 4),
        "variance": round(variance, 4),
        "mean_sentence": round(mean_len, 2),
        "concrete": round(concrete, 4),
        "flatness": round(flatness, 4),
        "position": round(position, 4),
    }


# --- withheld -------------------------------------------------------------

WITHHELD_THRESHOLD = 0.45


def withheld_score(s: dict) -> float:
    """A gap with a floor under it: redaction, elision, refusal to say.

    The one survivor of the six tags. It is not a claim about what a passage
    is *for* — only that something is conspicuously not being said, which is a
    surface fact about the text rather than a reading of it.
    """
    return round(
        min(1.0, 0.50 * s["withholding"] + 0.30 * s["redaction"] + 0.20 * s["ellipsis"]),
        4,
    )


def register_score(s: dict) -> float:
    """How much this reads like the target register, 0-1.

    Rewards concreteness, sentence variety, and flatness under pressure.
    Penalizes intensifiers, adverb pileup, and wall-to-wall dialogue —
    dialogue-heavy passages condition for scenes, and the register is
    documents and narration.

    The three positive weights are the old ones renormalised to sum to 1 after
    the `0.30 * max(tag_scores)` term was removed; their ratios to each other
    are unchanged. Every constant here is still hand-set and none of it is
    fitted to anything — `PLAN.md` Part 3 is where that gets tested against
    real verdicts rather than argued about, once the decision layer returns.
    """
    good = (
        0.40 * s["concrete"]
        + 0.29 * s["variance"]
        + 0.31 * s["flatness"]
    )
    bad = 0.35 * s["adverbs"] + 0.40 * s["intensifier"] + 0.25 * s["dialogue"]
    # Very short or very long average sentences both read wrong.
    ml = s["mean_sentence"]
    shape = 1.0 - min(1.0, abs(ml - 19.0) / 22.0)
    return round(max(0.0, min(1.0, 0.80 * good + 0.20 * shape - 0.30 * bad)), 4)
