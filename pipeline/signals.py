"""Structural signals over a passage.

Two jobs:

  1. Tag a passage against the six failures from `extracted/README.md`, so the
     bank can be checked for coverage rather than accumulating on one axis.
  2. Score register fitness, so the pool sorts usefully.

Everything here is lexical and structural. No model reads anything. Every
signal is a named, inspectable number between 0 and 1 — when a passage sorts
oddly you can see exactly which term did it, which you cannot do with an
embedding.

These are recall instruments, not verdicts. A tag means "worth Chris's eye
for this axis", not "this is an exemplar of it".
"""

from __future__ import annotations

import math
import re
import statistics

# --- lexicons -------------------------------------------------------------
# Deliberately small and concrete. A big lexicon fires on everything.

WARMTH = {
    "gentle", "gently", "kind", "kindly", "kindness", "care", "cared", "caring",
    "careful", "carefully", "comfort", "comforted", "comfortable", "reassure",
    "reassured", "reassuring", "patient", "patiently", "warm", "warmly", "soft",
    "softly", "tender", "tenderly", "smile", "smiled", "smiling", "thank",
    "thanked", "welcome", "welcomed", "please", "sorry", "helped", "helping",
    "loved", "loving", "dear", "friend", "friendly", "polite", "politely",
    "generous", "grateful", "assured", "soothing", "attentive", "courteous",
}

HARM = {
    "blood", "bleeding", "wound", "wounded", "burn", "burned", "burning",
    "cut", "cutting", "broke", "broken", "tear", "torn", "crush", "crushed",
    "kill", "killed", "killing", "died", "dead", "death", "dying", "corpse",
    "body", "bodies", "pain", "scream", "screaming", "bone", "bones", "flesh",
    "skin", "teeth", "throat", "spine", "organ", "organs", "amputate",
    "amputated", "incision", "sever", "severed", "suffocate", "drown",
    "drowned", "burial", "buried", "remains", "injury", "injuries", "trauma",
    "fracture", "lesion", "necrosis", "hemorrhage", "asphyxia",
}

CLINICAL = {
    "subject", "subjects", "specimen", "personnel", "procedure", "procedures",
    "protocol", "administered", "observed", "observation", "recorded",
    "documented", "designated", "classified", "containment", "facility",
    "site", "unit", "sample", "samples", "analysis", "assessment", "report",
    "report's", "incident", "termination", "terminated", "disposal",
    "intake", "processing", "processed", "compliance", "authorized",
    "unauthorized", "standard", "baseline", "interval", "batch", "cohort",
    "screening", "triage", "log", "logged", "entry", "record", "records",
    "reviewed", "approved", "pending", "status", "d-class", "subjectively",
}

PROCEDURAL_MODAL = re.compile(
    r"\b(is|are|was|were)\s+to\s+be\b|\bshall\b|\bmust\s+be\b|\bwill\s+be\b|"
    r"\bare\s+not\s+to\b|\bis\s+not\s+to\b",
    re.I,
)

DOCUMENT_LABEL = re.compile(
    r"^\s*(?:\*\*)?(?:[A-Z][A-Za-z /'-]{2,30}|[A-Z]{2,10}[-–][A-Z0-9]{1,10})\s*:",
    re.M,
)

POPULATION = {
    "population", "populations", "everyone", "everybody", "nationwide",
    "citywide", "countrywide", "worldwide", "global", "globally", "region",
    "regional", "district", "county", "prefecture", "census", "residents",
    "inhabitants", "civilians", "public", "populace", "generation",
    "generations", "cohort", "workforce", "households", "communities",
    "thousands", "millions", "billions", "hundreds",
}

INTENSIFIER = {
    "very", "extremely", "incredibly", "utterly", "absolutely", "horribly",
    "terribly", "unbelievably", "shockingly", "amazingly", "truly", "really",
    "deeply", "profoundly", "immensely", "vastly", "hugely", "totally",
    "completely", "entirely", "desperately", "frantically", "violently",
    "brutally", "savagely", "unimaginable", "indescribable", "nightmarish",
    "eldritch", "unspeakable", "unfathomable", "monstrous", "horrific",
    "terrifying", "chilling", "haunting", "eerie", "sinister", "ominous",
}

CLOSURE = {
    "finally", "at last", "understood", "realized", "realised", "explained",
    "resolved", "escaped", "survived", "rescued", "saved", "freed", "ended",
    "over", "safe", "solved", "answer", "answered", "revealed", "confessed",
    "arrested", "punished", "justice", "avenged", "healed", "recovered",
    "returned home", "the end",
}

WITHHOLDING = {
    "unknown", "unclear", "undetermined", "unable", "never", "no record",
    "not recorded", "not found", "missing", "absent", "redacted", "expunged",
    "withheld", "declined", "refused", "unavailable", "inconclusive",
    "unaccounted", "unidentified", "unreported", "silence", "silent",
    "nothing", "no further", "no comment", "no explanation",
}

CONTINUING = {
    "continues", "continued", "continuing", "remains", "remain", "remaining",
    "ongoing", "still", "persists", "persist", "persistent", "indefinite",
    "indefinitely", "permanent", "permanently", "daily", "weekly", "monthly",
    "annually", "routine", "routinely", "standard practice", "as scheduled",
    "each morning", "every day", "in operation", "operational",
}

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
SENT = re.compile(r"[.!?](?:\s|$)")
NUMERAL = re.compile(r"\b\d[\d,.]*\b")
# Comma-grouped, or five digits and up. A bare four-digit run is almost always
# a year in this corpus, and years are not scale.
BIG_NUMBER = re.compile(r"\b\d{1,3}(?:,\d{3})+\b|\b\d{5,}\b")
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

    warmth = _ratio(_lex_hits(words, WARMTH), n, 0.030)
    harm = _ratio(_lex_hits(words, HARM), n, 0.030)
    clinical = _ratio(_lex_hits(words, CLINICAL), n, 0.045)
    population = _ratio(_lex_hits(words, POPULATION), n, 0.020)
    intensifier = _ratio(_lex_hits(words, INTENSIFIER), n, 0.020)
    withholding = _ratio(
        _lex_hits(words, WITHHOLDING) + _phrase_hits(low, WITHHOLDING), n, 0.025
    )
    continuing = _ratio(
        _lex_hits(words, CONTINUING) + _phrase_hits(low, CONTINUING), n, 0.020
    )
    closure = _ratio(_lex_hits(words, CLOSURE) + _phrase_hits(low, CLOSURE), n, 0.015)

    procedural = _ratio(len(PROCEDURAL_MODAL.findall(text)), len(sentences) or 1, 0.30)
    labels = _ratio(len(DOCUMENT_LABEL.findall(text)), len(sentences) or 1, 0.20)
    numerals = _ratio(len(NUMERAL.findall(text)), n, 0.020)
    big_numbers = _ratio(len(BIG_NUMBER.findall(text)), n, 0.008)
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

    # Formality: fraction of sentences that begin with a capital. Institutional
    # register is capitalized; the lowercase-email voice is not, and without
    # this the clinical lexicon leaking in from surrounding narration tags
    # informal text as procedure.
    starts = [s_.strip() for s_ in sentences if s_.strip()]
    caps = sum(1 for s_ in starts if s_[0].isupper() or s_[0].isdigit())
    formality = (caps / len(starts)) if starts else 1.0
    clinical *= 0.35 + 0.65 * formality

    # Flatness: harm or scale delivered without the tone rising to meet it.
    flatness = max(0.0, 1.0 - intensifier)

    return {
        "warmth": round(warmth, 4),
        "harm": round(harm, 4),
        "clinical": round(clinical, 4),
        "formality": round(formality, 4),
        "population": round(population, 4),
        "intensifier": round(intensifier, 4),
        "withholding": round(withholding, 4),
        "continuing": round(continuing, 4),
        "closure": round(closure, 4),
        "procedural": round(procedural, 4),
        "labels": round(labels, 4),
        "numerals": round(numerals, 4),
        "big_numbers": round(big_numbers, 4),
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


# --- the six failure tags -------------------------------------------------
# Each returns 0-1. A passage is tagged where it clears THRESHOLD.

THRESHOLD = 0.45


def _conj(a: float, b: float, floor: float, gain: float = 1.0) -> float:
    """Both terms must actually be present.

    A geometric mean alone lets one strong term drag a near-zero one over the
    line, which is how 'warmth as the instrument of harm' ends up tagging
    polite prose with no harm in it. The floor is the fix: below it, the tag
    is not claimed at all.
    """
    if a < floor or b < floor:
        return 0.0
    return min(1.0, gain * math.sqrt(a * b))


def tag_scores(s: dict) -> dict:
    # Warmth doing the damage. Harm must be present; clinical register only
    # sharpens it, and can never substitute for it.
    warm_mechanism = _conj(s["warmth"], s["harm"], floor=0.15, gain=1.75)
    warm_mechanism = min(1.0, warm_mechanism * (0.85 + 0.15 * s["clinical"]))

    # Bodies handled in institutional register. Dialogue suppresses: people
    # talking about blood is a scene, not a procedure.
    clinical_body = _conj(s["harm"], s["clinical"], floor=0.20, gain=1.8)
    clinical_body = min(
        1.0, clinical_body * (0.6 + 0.4 * s["flatness"]) * (1.0 - 0.5 * s["dialogue"])
    )

    document_working = min(
        1.0,
        0.45 * s["procedural"] + 0.30 * s["labels"] + 0.25 * s["clinical"]
        - 0.30 * s["dialogue"],
    )

    # Population-scale, said flatly. The scale term has to carry itself before
    # harm or flatness are allowed to modulate it.
    magnitude = min(1.0, 0.60 * s["population"] + 0.40 * s["big_numbers"])
    scale = 0.0
    if magnitude >= 0.35:
        scale = min(
            1.0,
            magnitude
            * (0.55 + 0.45 * s["flatness"])
            * (0.65 + 0.35 * min(1.0, s["harm"] * 3)),
        )

    withheld = min(
        1.0, 0.50 * s["withholding"] + 0.30 * s["redaction"] + 0.20 * s["ellipsis"]
    )

    # Only meaningful near the end of a source, and only when nothing closes.
    tail = max(0.0, (s["position"] - 0.55) / 0.45)
    no_resolution = min(
        1.0, tail * (0.55 * s["continuing"] + 0.45 * (1.0 - min(1.0, s["closure"] * 2)))
    )

    return {
        "warm-mechanism": round(warm_mechanism, 4),
        "clinical-body": round(clinical_body, 4),
        "document-working": round(document_working, 4),
        "scale": round(scale, 4),
        "withheld": round(withheld, 4),
        "no-resolution": round(no_resolution, 4),
    }


def tags(scores: dict, threshold: float = THRESHOLD) -> list[str]:
    return sorted([k for k, v in scores.items() if v >= threshold], key=lambda k: -scores[k])


def register_score(s: dict, tscores: dict) -> float:
    """How much this reads like the target register, 0-1.

    Rewards concreteness, sentence variety, and flatness under pressure.
    Penalizes intensifiers, adverb pileup, and wall-to-wall dialogue —
    dialogue-heavy passages condition for scenes, and the register is
    documents and narration.
    """
    good = (
        0.28 * s["concrete"]
        + 0.20 * s["variance"]
        + 0.22 * s["flatness"]
        + 0.30 * max(tscores.values())
    )
    bad = 0.35 * s["adverbs"] + 0.40 * s["intensifier"] + 0.25 * s["dialogue"]
    # Very short or very long average sentences both read wrong.
    ml = s["mean_sentence"]
    shape = 1.0 - min(1.0, abs(ml - 19.0) / 22.0)
    return round(max(0.0, min(1.0, 0.80 * good + 0.20 * shape - 0.30 * bad)), 4)
