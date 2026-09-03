"""Biber dimensions over a passage.

Replaces the six hand-coined failure tags with the field standard. Biber
(1988) factor-analysed 67 grammatical features across a register-diversified
corpus; features that co-occur define a dimension, and a text scores on each.
`research/tagging.md` §1 has the citations and the evidence that D1 and D2
reproduce in this corpus.

Only **D1** (involved vs informational) and **D2** (narrative vs
non-narrative) are implemented. D3-D6 were derived to separate conversation
from academic prose — a far wider spread than this corpus has — and there is
no evidence they discriminate here.

Two backends, chosen at import time:

  biberplus   the reference implementation, if it is importable. Tagged with
              spaCy, so its part-of-speech features are real.
  local       a dependency-free fallback. Closed word lists and regexes; no
              tagger, so nouns, adjectives and present tense are proxied.
              Named honestly in `FEATURES` — read the comments before
              treating a local score as a Biber score.

`BACKEND` says which one is live. The two are *not* interchangeable across a
corpus: standardisation is corpus-relative, so a pool scored with one backend
must be rescored end to end if the backend changes. `pipeline facets` records
the backend in `extracted/facet-stats.json` and refuses to mix them.

Usage:

    feats = [features(text) for text in corpus]
    stats = fit(feats)
    dimensions(feats[0], stats)   ->  {"d1": -0.83, "d2": 1.41}
"""

from __future__ import annotations

import math
import re
import statistics

# --- backend selection ----------------------------------------------------

try:  # pragma: no cover - depends on the machine, not on the code
    from biberplus.tagger import load_config, load_pipeline, tag_text  # type: ignore

    BACKEND = "biberplus"
except Exception:  # ImportError, or a spaCy model that will not load
    load_config = load_pipeline = tag_text = None  # type: ignore
    BACKEND = "local"


# --- word lists -----------------------------------------------------------
# Explicit and inspectable, in the style of signals.py. Inflected forms are
# written out rather than stemmed: a stemmer would be one more unvalidated
# component between the text and the number.

PRIVATE_VERBS = {
    "think", "thinks", "thinking", "thought", "know", "knows", "knowing",
    "knew", "known", "feel", "feels", "feeling", "felt", "believe",
    "believes", "believed", "believing", "remember", "remembers",
    "remembered", "remembering", "understand", "understands", "understood",
    "want", "wants", "wanted", "wanting", "hope", "hopes", "hoped", "mean",
    "means", "meant", "wonder", "wonders", "wondered", "wondering",
    "suppose", "supposed", "supposes", "doubt", "doubts", "doubted",
    "imagine", "imagines", "imagined", "imagining", "realize", "realizes",
    "realized", "realise", "realises", "realised", "guess", "guesses",
    "guessed", "decide", "decides", "decided", "consider", "considers",
    "considered", "seem", "seems", "seemed", "notice", "notices", "noticed",
    "forget", "forgets", "forgot", "forgotten", "wish", "wishes", "wished",
    "assume", "assumes", "assumed", "expect", "expects", "expected", "learn",
    "learns", "learned", "learnt", "recall", "recalls", "recalled", "fear",
    "fears", "feared", "suspect", "suspects", "suspected", "prefer",
    "prefers", "preferred", "conclude", "concluded", "determine",
    "determined", "find", "finds", "found",
}

PUBLIC_VERBS = {
    "say", "says", "said", "saying", "tell", "tells", "told", "telling",
    "announce", "announces", "announced", "declare", "declares", "declared",
    "explain", "explains", "explained", "report", "reports", "reported",
    "state", "states", "stated", "suggest", "suggests", "suggested",
    "claim", "claims", "claimed", "admit", "admits", "admitted", "argue",
    "argues", "argued", "reply", "replies", "replied", "respond", "responds",
    "responded", "mention", "mentions", "mentioned", "remark", "remarks",
    "remarked", "ask", "asks", "asked", "answer", "answers", "answered",
    "insist", "insists", "insisted", "confess", "confessed", "complain",
    "complained", "write", "writes", "wrote", "shout", "shouted", "whisper",
    "whispered", "add", "added", "note", "noted", "observe", "observed",
}

FIRST_PERSON = {
    "i", "me", "my", "mine", "myself", "we", "us", "our", "ours",
    "ourselves", "i'm", "i've", "i'd", "i'll", "we're", "we've", "we'd",
    "we'll",
}

SECOND_PERSON = {
    "you", "your", "yours", "yourself", "yourselves", "thou", "thee", "thy",
    "you're", "you've", "you'd", "you'll",
}

THIRD_PERSON = {
    "he", "him", "his", "himself", "she", "her", "hers", "herself", "they",
    "them", "their", "theirs", "themselves", "he's", "she's", "they're",
    "they've", "they'd", "they'll", "he'd", "she'd", "he'll", "she'll",
}

INDEFINITE_PRONOUNS = {
    "anybody", "anyone", "anything", "everybody", "everyone", "everything",
    "nobody", "none", "nothing", "nowhere", "somebody", "someone",
    "something", "somewhere", "anywhere", "everywhere",
}

# Biber's list, minus the ones that are overwhelmingly not prepositional in
# this corpus. `to` is excluded: it is an infinitive marker far more often
# than a preposition, and no tagger is available to tell them apart.
PREPOSITIONS = {
    "about", "above", "across", "after", "against", "along", "amid", "among",
    "amongst", "around", "as", "at", "before", "behind", "below", "beneath",
    "beside", "besides", "between", "beyond", "by", "despite", "down",
    "during", "except", "for", "from", "in", "inside", "into", "near", "of",
    "off", "on", "onto", "opposite", "outside", "over", "per", "since",
    "through", "throughout", "toward", "towards", "under", "underneath",
    "until", "unto", "upon", "via", "with", "within", "without",
}

POSSIBILITY_MODALS = {"can", "may", "might", "could", "cannot"}
NECESSITY_MODALS = {"must", "should", "ought"}
PREDICTION_MODALS = {"will", "would", "shall"}

EMPHATICS = {
    "just", "really", "so", "real", "most", "definitely", "actually",
    "indeed", "certainly", "surely", "truly", "ever", "such",
}

AMPLIFIERS = {
    "absolutely", "altogether", "completely", "enormously", "entirely",
    "extremely", "fully", "greatly", "highly", "intensely", "perfectly",
    "strongly", "thoroughly", "totally", "utterly", "very", "terribly",
    "incredibly", "immensely",
}

HEDGES = {
    "maybe", "perhaps", "almost", "somewhat", "roughly", "apparently",
    "possibly", "seemingly", "presumably", "arguably", "nearly",
}
HEDGE_PHRASES = ("sort of", "kind of", "more or less", "something like",
                 "at about", "or something")

DISCOURSE_PARTICLES = {"well", "now", "anyway", "anyhow", "anyways", "ok",
                       "okay", "besides"}

# Time and place deixis. Biber's D2 negative pole is thin; `research/tagging.md`
# names it "context-dependent discourse markers", and this is that: reference
# that only resolves against the situation of utterance rather than the text.
CONTEXT_ADVERBIALS = {
    "here", "there", "now", "then", "today", "tomorrow", "yesterday",
    "afterwards", "afterward", "again", "already", "soon", "later",
    "nearby", "somewhere", "anywhere", "everywhere", "ahead", "upstairs",
    "downstairs", "away", "back", "abroad", "overseas", "outdoors",
    "indoors", "elsewhere", "tonight", "meanwhile", "presently",
}

PUBLIC_BE = {"am", "is", "are", "was", "were", "be", "been", "being"}
PRESENT_AUX = {"am", "is", "are", "'m", "'s", "'re", "have", "has", "do",
               "does", "am not", "isn't", "aren't", "don't", "doesn't"}

IRREGULAR_PAST = {
    "was", "were", "had", "did", "said", "went", "came", "took", "saw",
    "knew", "made", "got", "gave", "found", "told", "felt", "left", "kept",
    "held", "brought", "put", "set", "began", "became", "thought", "spoke",
    "stood", "sat", "ran", "wrote", "drew", "heard", "lay", "led", "met",
    "paid", "sent", "built", "caught", "chose", "drove", "ate", "fell",
    "flew", "forgot", "froze", "grew", "hid", "hit", "hung", "hurt", "knelt",
    "laid", "lost", "meant", "rose", "shook", "shot", "shut", "sang", "sank",
    "slept", "slid", "sold", "spent", "split", "spread", "stuck", "struck",
    "swam", "swept", "swung", "taught", "tore", "threw", "understood", "woke",
    "wore", "won", "wound", "bled", "bound", "burnt", "cut", "dug", "drank",
    "fed", "fought", "fled", "ground", "leapt", "lit", "read", "rang",
    "rode", "sought", "shone", "sprang", "stole", "strode", "swore", "wept",
    "withdrew", "wrung", "bore", "crept", "dealt", "drew", "dwelt",
}

# -ed words that are not past-tense verbs.
NOT_PAST = {
    "need", "indeed", "bed", "red", "wed", "feed", "seed", "speed", "breed",
    "deed", "greed", "creed", "hundred", "sacred", "embed", "exceed",
    "proceed", "succeed", "agreed", "freed", "fled", "bled", "shed", "sled",
    "shred", "ted", "aged", "naked", "wicked", "rugged", "ragged", "jagged",
    "learned", "beloved", "blessed", "crooked", "hatred", "instead",
}

PERFECT_PARTICIPLES = (
    r"\w{3,}ed|been|done|gone|seen|known|taken|made|come|given|found|told|"
    r"said|kept|left|felt|got|gotten|written|begun|become|held|brought|put|"
    r"set|run|shown|spoken|broken|driven|eaten|fallen|forgotten|grown|"
    r"hidden|lost|meant|paid|risen|sent|stolen|thrown|worn"
)

# --- regexes --------------------------------------------------------------

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
SENT = re.compile(r"[.!?](?:\s|$)")
CONTRACTION = re.compile(r"\b[A-Za-z]+['’](?:s|t|re|ve|ll|d|m)\b", re.I)
NOT_NEGATION = re.compile(r"\bnot\b|n['’]t\b", re.I)
SYNTHETIC_NEGATION = re.compile(r"\b(?:no|neither|nor)\b", re.I)
NOMINALISATION = re.compile(r"\b\w{4,}(?:tion|sion|ment|ness|ity)s?\b", re.I)
ADJ_SUFFIX = re.compile(
    r"\b\w{4,}(?:ous|ive|al|ic|able|ible|ful|less|ary|ant|ent)\b", re.I
)
PERFECT = re.compile(
    rf"\b(?:have|has|had|['’]ve|['’]d)\s+(?:{PERFECT_PARTICIPLES})\b", re.I
)
PRESENT_PARTICIPIAL = re.compile(r",\s+\w{4,}ing\b", re.I)
DEMONSTRATIVE_PRONOUN = re.compile(
    r"\b(?:this|that|these|those)\s+(?:is|are|was|were|will|would|can|could|"
    r"has|have|had|['’]s|,|\.)",
    re.I,
)
WH_CLAUSE = re.compile(r"\b(?:who|whom|whose|which|what|where|when|why|how)\b", re.I)
CAUSATIVE = re.compile(r"\bbecause\b", re.I)
REGULAR_PAST = re.compile(r"\b\w{3,}ed\b", re.I)


def _rate(count: int, words: int) -> float:
    """Biber normalises counts per 1000 words. So does this."""
    return 1000.0 * count / words if words else 0.0


def _hits(words: list[str], lex: set) -> int:
    return sum(1 for w in words if w in lex)


# The feature set, and which pole of which dimension each loads on.
# `+` means the feature raises the score, `-` lowers it. Equal weights, which
# is what Biber did: features above the loading cutoff are summed as z-scores,
# not weighted by their loadings.
FEATURES: dict[str, dict[str, str]] = {
    # D1 positive — involved
    "private_verbs":       {"d1": "+"},
    "contractions":        {"d1": "+"},
    "present_aux":         {"d1": "+"},
    "first_person":        {"d1": "+"},
    "second_person":       {"d1": "+"},
    "pronoun_it":          {"d1": "+"},
    "demonstrative_pron":  {"d1": "+"},
    "indefinite_pron":     {"d1": "+"},
    "analytic_negation":   {"d1": "+"},
    "emphatics":           {"d1": "+"},
    "amplifiers":          {"d1": "+"},
    "hedges":              {"d1": "+"},
    "discourse_particles": {"d1": "+"},
    "possibility_modals":  {"d1": "+"},
    "causative_because":   {"d1": "+"},
    "wh_words":            {"d1": "+"},
    "be_verb":             {"d1": "+"},
    # D1 negative — informational
    "nominalisations":     {"d1": "-"},
    "prepositions":        {"d1": "-"},
    # Only the biberplus backend can count these; the local one leaves it at
    # zero, where a zero variance makes it contribute nothing. That is the
    # asymmetry `facet-stats.json` records the backend to protect against.
    "nouns":               {"d1": "-"},
    "attributive_adj":     {"d1": "-"},
    "word_length":         {"d1": "-"},
    "type_token_ratio":    {"d1": "-"},
    # D2 positive — narrative
    "past_tense":          {"d2": "+"},
    "third_person":        {"d2": "+"},
    "perfect_aspect":      {"d2": "+"},
    "public_verbs":        {"d2": "+"},
    "synthetic_negation":  {"d2": "+"},
    "present_participial": {"d2": "+"},
    # D2 negative — non-narrative
    "context_adverbials":  {"d2": "-"},
}

DIMENSIONS = ("d1", "d2")


def _local_features(text: str) -> dict[str, float]:
    """Dependency-free approximation of the D1/D2 feature set.

    Where a feature needs a part-of-speech tagger, it is proxied and the proxy
    is named in a comment. Proxies are consistent across the corpus, which is
    what standardisation needs; they are not Biber's numbers.
    """
    low = text.lower()
    words = [w.lower() for w in WORD.findall(text)]
    n = len(words)
    if not n:
        return {k: 0.0 for k in FEATURES}

    sentences = [s for s in SENT.split(text) if s.strip()] or [text]

    past = sum(
        1
        for w in words
        if w in IRREGULAR_PAST
        or (w not in NOT_PAST and REGULAR_PAST.fullmatch(w))
    )

    feats = {
        "private_verbs": _rate(_hits(words, PRIVATE_VERBS), n),
        "contractions": _rate(len(CONTRACTION.findall(text)), n),
        # proxy: present-tense BE/HAVE/DO only. Lexical present tense needs a
        # tagger to separate `records` the verb from `records` the noun.
        "present_aux": _rate(_hits(words, PRESENT_AUX), n),
        "first_person": _rate(_hits(words, FIRST_PERSON), n),
        "second_person": _rate(_hits(words, SECOND_PERSON), n),
        "pronoun_it": _rate(sum(1 for w in words if w in ("it", "its", "it's")), n),
        "demonstrative_pron": _rate(len(DEMONSTRATIVE_PRONOUN.findall(text)), n),
        "indefinite_pron": _rate(_hits(words, INDEFINITE_PRONOUNS), n),
        "analytic_negation": _rate(len(NOT_NEGATION.findall(text)), n),
        "emphatics": _rate(_hits(words, EMPHATICS), n),
        "amplifiers": _rate(_hits(words, AMPLIFIERS), n),
        "hedges": _rate(
            _hits(words, HEDGES) + sum(low.count(p) for p in HEDGE_PHRASES), n
        ),
        "discourse_particles": _rate(_hits(words, DISCOURSE_PARTICLES), n),
        "possibility_modals": _rate(_hits(words, POSSIBILITY_MODALS), n),
        "causative_because": _rate(len(CAUSATIVE.findall(text)), n),
        "wh_words": _rate(len(WH_CLAUSE.findall(text)), n),
        "be_verb": _rate(_hits(words, PUBLIC_BE), n),
        "nominalisations": _rate(len(NOMINALISATION.findall(text)), n),
        "prepositions": _rate(_hits(words, PREPOSITIONS), n),
        # proxy: adjective-forming suffixes, without the attributive position
        # test. Picks up predicative adjectives too.
        "attributive_adj": _rate(len(ADJ_SUFFIX.findall(text)), n),
        # Not a rate. Biber standardises it the same way.
        "word_length": statistics.mean(len(w) for w in words),
        # Type/token over the passage. Passage lengths are bounded to 150-400
        # words by `segment.py`, so this is comparable without a fixed window.
        "type_token_ratio": len(set(words)) / n,
        "past_tense": _rate(past, n),
        "third_person": _rate(_hits(words, THIRD_PERSON), n),
        "perfect_aspect": _rate(len(PERFECT.findall(text)), n),
        "public_verbs": _rate(_hits(words, PUBLIC_VERBS), n),
        "synthetic_negation": _rate(len(SYNTHETIC_NEGATION.findall(text)), n),
        "present_participial": _rate(len(PRESENT_PARTICIPIAL.findall(text)), n),
        "context_adverbials": _rate(_hits(words, CONTEXT_ADVERBIALS), n),
    }
    # Sentence count is not itself a feature; it is here so callers that want
    # to sanity-check a passage do not have to re-split it.
    feats["_sentences"] = float(len(sentences))
    feats["_words"] = float(n)
    return feats


# biberplus tag -> this module's feature name. Several of its tags collapse
# onto one feature here; the values are summed.
_BIBERPLUS_MAP = {
    "NN": "nouns",
    "JJ": "attributive_adj",
    "PRIV": "private_verbs",
    "CONT": "contractions",
    "VPRT": "present_aux",   # real present tense, not the aux proxy
    "FPP1": "first_person",
    "SPP2": "second_person",
    "PIT": "pronoun_it",
    "DEMP": "demonstrative_pron",
    "INPR": "indefinite_pron",
    "XX0": "analytic_negation",
    "EMPH": "emphatics",
    "AMP": "amplifiers",
    "HDG": "hedges",
    "DPAR": "discourse_particles",
    "POMD": "possibility_modals",
    "CAUS": "causative_because",
    "WHCL": "wh_words",
    "WHQU": "wh_words",
    "WHOBJ": "wh_words",
    "WHSUB": "wh_words",
    "BEMA": "be_verb",
    "NOMZ": "nominalisations",
    "PIN": "prepositions",
    "VBD": "past_tense",
    "TPP3": "third_person",
    "PEAS": "perfect_aspect",
    "PUBV": "public_verbs",
    "SYNE": "synthetic_negation",
    "PRESP": "present_participial",
    "PLACE": "context_adverbials",
    "TIME": "context_adverbials",
}

_BP_PIPELINE = None


def _biberplus_features(text: str) -> dict[str, float]:
    """Per-token Biber tags from biberplus, counted into this module's features.

    Deliberately does not use `calculate_tag_frequencies`: it batches through
    `np.array_split` on a DataFrame, which returns bare arrays under numpy 2
    and makes the whole call return None. Counting the per-token tags here is
    both immune to that and explicit about the denominator, which has to match
    the local backend's for the two to be comparable at all.
    """
    global _BP_PIPELINE
    if _BP_PIPELINE is None:
        config = load_config()  # type: ignore[misc]
        # Function words are 300-odd extra columns no dimension here uses.
        config.update({"use_gpu": False, "function_words": False,
                       "show_progress": False})
        _BP_PIPELINE = (config, load_pipeline(config))  # type: ignore[misc]
    config, pipe = _BP_PIPELINE

    words = [w.lower() for w in WORD.findall(text)]
    n = len(words)
    if not n:
        return {k: 0.0 for k in FEATURES}

    counts: dict[str, int] = {}
    for token in tag_text(text, pipeline=pipe, config=config):  # type: ignore[misc]
        tags = set(token.get("tags") or ())
        # Biber's attributive adjectives are adjectives that are not
        # predicative. biberplus marks the latter separately.
        if "JJ" in tags and "PRED" in tags:
            tags.discard("JJ")
        for tag in tags:
            counts[tag] = counts.get(tag, 0) + 1

    feats = {k: 0.0 for k in FEATURES}
    for tag, count in counts.items():
        name = _BIBERPLUS_MAP.get(tag.upper())
        if name:
            feats[name] += _rate(count, n)

    feats["word_length"] = statistics.mean(len(w) for w in words)
    feats["type_token_ratio"] = len(set(words)) / n
    feats["_sentences"] = float(len([s for s in SENT.split(text) if s.strip()]) or 1)
    feats["_words"] = float(n)
    return feats


def features(text: str) -> dict[str, float]:
    """Raw feature rates for one passage, per 1000 words.

    Keys prefixed with `_` are diagnostics, not features, and are ignored by
    `fit` and `dimensions`.
    """
    if BACKEND == "biberplus":
        try:
            return _biberplus_features(text)
        except Exception as e:  # a broken model should not lose the harvest
            print(f"  ! biberplus failed ({type(e).__name__}: {e}); using local")
            return _local_features(text)
    return _local_features(text)


# --- standardisation ------------------------------------------------------


def fit(feature_rows: list[dict[str, float]]) -> dict:
    """Corpus statistics: per-feature mean/sd, then per-dimension mean/sd.

    Two passes, because a dimension score is a sum of z-scores and only has a
    scale once the whole pool has been seen. Persisting this is what stops a
    later harvest from silently re-basing every score in the bank.
    """
    if not feature_rows:
        raise ValueError("fit needs at least one row")

    fstats: dict[str, dict[str, float]] = {}
    for name in FEATURES:
        vals = [r.get(name, 0.0) for r in feature_rows]
        mean = statistics.mean(vals)
        sd = statistics.pstdev(vals) if len(vals) > 1 else 0.0
        fstats[name] = {"mean": mean, "sd": sd}

    stats = {
        "backend": BACKEND,
        "n": len(feature_rows),
        "features": fstats,
        "dimensions": {d: {"mean": 0.0, "sd": 1.0} for d in DIMENSIONS},
    }

    for d in DIMENSIONS:
        raws = [_raw_dimension(r, stats, d) for r in feature_rows]
        mean = statistics.mean(raws)
        sd = statistics.pstdev(raws) if len(raws) > 1 else 0.0
        stats["dimensions"][d] = {"mean": mean, "sd": sd}

    stats["terciles"] = _terciles(feature_rows, stats)
    return stats


def _z(value: float, mean: float, sd: float) -> float:
    return 0.0 if sd <= 1e-12 else (value - mean) / sd


def _raw_dimension(feats: dict[str, float], stats: dict, dim: str) -> float:
    """Sum of z-scores on the positive pole minus the negative pole."""
    total = 0.0
    for name, poles in FEATURES.items():
        sign = poles.get(dim)
        if not sign:
            continue
        fs = stats["features"].get(name)
        if not fs:
            continue
        z = _z(feats.get(name, 0.0), fs["mean"], fs["sd"])
        total += z if sign == "+" else -z
    return total


def dimensions(feats: dict[str, float], stats: dict) -> dict[str, float]:
    """Standardised D1 and D2 for one passage."""
    out = {}
    for d in DIMENSIONS:
        ds = stats["dimensions"][d]
        out[d] = round(_z(_raw_dimension(feats, stats, d), ds["mean"], ds["sd"]), 4)
    return out


def _terciles(feature_rows: list[dict[str, float]], stats: dict) -> dict:
    """Cut points at the 33rd and 67th percentile of each dimension."""
    cuts = {}
    for d in DIMENSIONS:
        vals = sorted(
            _z(_raw_dimension(r, stats, d), stats["dimensions"][d]["mean"],
               stats["dimensions"][d]["sd"])
            for r in feature_rows
        )
        if not vals:
            cuts[d] = [0.0, 0.0]
            continue
        cuts[d] = [_pct(vals, 1 / 3), _pct(vals, 2 / 3)]
    return cuts


def _pct(sorted_vals: list[float], q: float) -> float:
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


# --- labels ---------------------------------------------------------------

VOICE_LABELS = ("informational", "mixed", "involved")   # low d1 -> high d1
MODE_LABELS = ("non-narrative", "mixed", "narrative")   # low d2 -> high d2


def _bucket(value: float, cuts: list[float], labels: tuple) -> str:
    if value <= cuts[0]:
        return labels[0]
    if value >= cuts[1]:
        return labels[2]
    return labels[1]


def facets(feats: dict[str, float], stats: dict) -> dict:
    """The stored facet record: two continuous scores and two tercile labels."""
    d = dimensions(feats, stats)
    cuts = stats.get("terciles") or {"d1": [0.0, 0.0], "d2": [0.0, 0.0]}
    return {
        "voice": _bucket(d["d1"], cuts["d1"], VOICE_LABELS),
        "mode": _bucket(d["d2"], cuts["d2"], MODE_LABELS),
        "d1": d["d1"],
        "d2": d["d2"],
    }


def cell(facet: dict | None) -> str:
    """The facet-grid cell a passage falls in. 9 cells, plus one for unscored.

    Tolerates a non-dict: `themes.jsonl` has carried its own `facets` — a list
    of shape labels from `themes.py` — since before this module existed, and
    the two are unrelated.
    """
    if not isinstance(facet, dict) or not facet:
        return "(unscored)"
    return f"{facet.get('voice', '?')}/{facet.get('mode', '?')}"


CELLS = [f"{v}/{m}" for v in VOICE_LABELS for m in MODE_LABELS]
