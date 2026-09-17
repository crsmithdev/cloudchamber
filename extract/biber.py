"""Biber dimensions over a passage.

Replaces the six hand-coined failure tags with the field standard. Biber
(1988) factor-analysed 67 linguistic features across a register-diversified
corpus; features that co-occur define a dimension, and a text scores on each.
`research/tagging.md` §1 has the citations.

All six dimensions are implemented. D1 and D2 were adopted first because a PCA
over this corpus recovered them; D3-D6 were added on 2026-09-03 against a
corpus that is about to get much wider — the anthology PDFs are several times
the size of the SCP pool and are fiction rather than documents, and a
dimension that does not discriminate 947 containment reports may well
discriminate those. Which of them earn their place is decided against real
verdicts, not here.

Two backends, chosen at import time:

  biberplus   the reference implementation. Tagged with spaCy, so its
              part-of-speech features are real. Scores all six dimensions.
  local       a dependency-free fallback of closed word lists and regexes.
              No tagger, so nouns, adjectives, present tense and the
              clause-level features are proxied or missing. It still reaches
              all six dimensions — 47 of the 51 features are lexical enough
              to fake — but four features are simply absent and the proxies
              are rough. `coverage()` reports what is actually populated,
              and `pipeline facets` prints it.

`BACKEND` says which one is live, and it is not decided by the import alone:
biberplus imports fine without its spaCy model, and would then fail on every
passage. `probe()` settles it for real.

The two backends are *not* interchangeable across a corpus: standardisation is
corpus-relative, so a pool scored with one must be rescored end to end if the
backend changes. `python -m extract facets` records the backend in the
store's `facet_fit` row and refuses to mix them.

Usage:

    feats = [features(text) for text in corpus]
    stats = fit(feats)
    facets(feats[0], stats)   ->  {"voice": "involved", "d1": 1.4, ...}
"""

from __future__ import annotations

import math
import re
import statistics

# --- backend selection ----------------------------------------------------

try:  # pragma: no cover - depends on the machine, not on the code
    from biberplus.tagger import load_config, load_pipeline, tag_text  # type: ignore

    BACKEND = "biberplus"
except Exception:  # ImportError, or a dependency that will not import
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

# Biber's suasive verbs: verbs of ordering, proposing and requiring. The
# institutional register runs on them, which is why D4 is worth having here.
SUASIVE_VERBS = {
    "agree", "agrees", "agreed", "arrange", "arranges", "arranged", "beg",
    "begs", "begged", "command", "commands", "commanded", "concede",
    "concedes", "conceded", "decide", "decides", "decided", "decree",
    "decrees", "decreed", "demand", "demands", "demanded", "grant", "grants",
    "granted", "insist", "insists", "insisted", "instruct", "instructs",
    "instructed", "ordain", "ordains", "ordained", "pledge", "pledges",
    "pledged", "pronounce", "pronounces", "pronounced", "propose",
    "proposes", "proposed", "recommend", "recommends", "recommended",
    "request", "requests", "requested", "require", "requires", "required",
    "resolve", "resolves", "resolved", "stipulate", "stipulates",
    "stipulated", "suggest", "suggests", "suggested", "urge", "urges",
    "urged", "vote", "votes", "voted", "authorize", "authorizes",
    "authorized", "authorise", "authorised", "mandate", "mandates",
    "mandated", "direct", "directs", "directed",
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
PREDICTION_MODALS = {"will", "would", "shall", "'ll", "'d"}

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

# D3 negative pole: reference that resolves against the situation rather than
# against the text.
TIME_ADVERBIALS = {
    "afterwards", "afterward", "again", "earlier", "early", "eventually",
    "formerly", "immediately", "initially", "instantly", "late", "lately",
    "later", "momentarily", "now", "nowadays", "once", "originally",
    "presently", "previously", "recently", "shortly", "simultaneously",
    "soon", "subsequently", "today", "tomorrow", "tonight", "yesterday",
    "then", "already", "meanwhile", "finally",
}

# Only the forms that cannot also be prepositions. `above`, `across`,
# `behind`, `below`, `beneath`, `beside`, `inside`, `near`, `outside` and
# `underneath` are all in PREPOSITIONS and are left out rather than counted
# twice on opposite poles — no tagger here can separate the two uses.
PLACE_ADVERBIALS = {
    "abroad", "ahead", "ashore", "away", "back", "downhill", "downstairs",
    "downstream", "elsewhere", "here", "hereabouts", "indoors", "inland",
    "inshore", "locally", "nearby", "north", "south", "east", "west",
    "nowhere", "outdoors", "overboard", "overland", "overseas", "there",
    "underfoot", "underground", "uphill", "upstairs", "upstream",
}

# D5 positive pole. Conjuncts mark a logical relation between stretches of
# text rather than between people.
CONJUNCTS = {
    "alternatively", "consequently", "conversely", "furthermore", "hence",
    "however", "instead", "likewise", "moreover", "namely", "nevertheless",
    "nonetheless", "notwithstanding", "otherwise", "rather", "similarly",
    "therefore", "thus", "accordingly", "additionally", "subsequently",
    "thereby", "therein", "thereafter", "whereupon",
}
CONJUNCT_PHRASES = (
    "in comparison", "in contrast", "in particular", "in addition",
    "in conclusion", "in consequence", "in sum", "in summary", "in any event",
    "in any case", "in other words", "for example", "for instance",
    "by contrast", "by comparison", "as a result", "as a consequence",
    "on the contrary", "on the other hand", "that is to say",
)

# Adverbial subordinators other than the causative (because) and conditional
# (if/unless) ones, which Biber counts separately on D1 and D4.
OTHER_SUBORDINATORS = {
    "since", "while", "whilst", "whereas", "whereby", "whereupon",
    "although", "though", "until", "unless", "once", "wherever", "whenever",
    "lest", "albeit", "notwithstanding",
}
SUBORDINATOR_PHRASES = (
    "such that", "so that", "in order that", "inasmuch as", "insofar as",
    "insomuch as", "as long as", "as soon as", "provided that",
    "given that", "except that", "now that", "in case",
)

PUBLIC_BE = {"am", "is", "are", "was", "were", "be", "been", "being"}
PRESENT_AUX = {"am", "is", "are", "'m", "'s", "'re", "have", "has", "do",
               "does", "isn't", "aren't", "don't", "doesn't"}

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

_PARTICIPLES = (
    r"\w{3,}ed|been|done|gone|seen|known|taken|made|come|given|found|told|"
    r"said|kept|left|felt|got|gotten|written|begun|become|held|brought|put|"
    r"set|run|shown|spoken|broken|driven|eaten|fallen|forgotten|grown|"
    r"hidden|lost|meant|paid|risen|sent|stolen|thrown|worn|drawn|torn|born"
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
PERFECT = re.compile(rf"\b(?:have|has|had|['’]ve|['’]d)\s+(?:{_PARTICIPLES})\b", re.I)
PRESENT_PARTICIPIAL = re.compile(r",\s+\w{4,}ing\b", re.I)
DEMONSTRATIVE_PRONOUN = re.compile(
    r"\b(?:this|that|these|those)\s+(?:is|are|was|were|will|would|can|could|"
    r"has|have|had|['’]s|,|\.)",
    re.I,
)
WH_QUESTION = re.compile(r"\b(?:who|whom|whose|which|what|where|when|why|how)\b", re.I)
CAUSATIVE = re.compile(r"\bbecause\b", re.I)
REGULAR_PAST = re.compile(r"\b\w{3,}ed\b", re.I)
GENERAL_ADVERB = re.compile(r"\b\w{4,}ly\b", re.I)

# D3. A relative pronoun after a noun-ish word, rather than a bare wh-word:
# `the technician who signed` is a relative clause, `who signed it?` is not.
WH_RELATIVE = re.compile(
    r"\b(?!the|a|an|and|or|but|that)\w{3,}\s*,?\s+(?:who|whom|whose|which)\b", re.I
)
PIED_PIPING = re.compile(
    rf"\b(?:{'|'.join(sorted(PREPOSITIONS))})\s+(?:whom|who|whose|which)\b", re.I
)

# D4. `to` as an infinitive marker rather than a preposition: followed by a
# bare lowercase word that is not a determiner or possessive.
INFINITIVE = re.compile(
    r"\bto\s+(?!the\b|a\b|an\b|his\b|her\b|its\b|their\b|my\b|your\b|our\b"
    r"|this\b|that\b|these\b|those\b|him\b|them\b|it\b|me\b|us\b)[a-z]{2,}\b"
)
CONDITIONAL = re.compile(r"\b(?:if|unless)\b", re.I)
# An auxiliary split from its verb by an adverb: `is routinely administered`.
SPLIT_AUXILIARY = re.compile(
    r"\b(?:is|are|was|were|be|been|being|have|has|had|will|would|can|could|"
    r"may|might|must|should|shall|do|does|did)\s+\w+ly\s+\w{3,}\b",
    re.I,
)

# D5.
_BE_FORMS = r"is|are|was|were|be|been|being|get|gets|got"
AGENTLESS_PASSIVE = re.compile(
    rf"\b(?:{_BE_FORMS})\s+(?:\w+ly\s+)?(?:{_PARTICIPLES})\b(?!\s+by\b)", re.I
)
BY_PASSIVE = re.compile(
    rf"\b(?:{_BE_FORMS})\s+(?:\w+ly\s+)?(?:{_PARTICIPLES})\s+by\b", re.I
)
PAST_PARTICIPIAL_CLAUSE = re.compile(
    rf"(?:^|[.;:,])\s*(?:{_PARTICIPLES})\s+(?:by|in|on|with|at|from|for|"
    r"under|within|\w+ly)\b",
    re.I | re.M,
)

# D6.
THAT_VERB_COMPLEMENT = re.compile(
    rf"\b(?:{'|'.join(sorted(PUBLIC_VERBS | PRIVATE_VERBS))})\s+that\b", re.I
)
THAT_ADJ_COMPLEMENT = re.compile(
    r"\b\w{3,}(?:ous|ive|al|ic|able|ible|ful|less|ant|ent|ain|ear)\s+that\b", re.I
)
DEMONSTRATIVE_ANY = re.compile(r"\b(?:this|that|these|those)\b", re.I)


def _rate(count: int, words: int) -> float:
    """Biber normalises counts per 1000 words. So does this."""
    return 1000.0 * count / words if words else 0.0


def _hits(words: list[str], lex: set) -> int:
    return sum(1 for w in words if w in lex)


def _phrases(low: str, phrases) -> int:
    return sum(low.count(p) for p in phrases)


# The feature set, and which pole of which dimension each loads on. `+` raises
# the score, `-` lowers it. Equal weights, which is what Biber did: features
# above the loading cutoff are summed as z-scores rather than weighted by
# their loadings.
#
# A feature may load on more than one dimension — that is Biber's solution,
# not an error. Nominalisations are D1-negative and D3-positive; attributive
# adjectives are negative on both D1 and D2; present tense is D1-positive and
# D2-negative.
FEATURES: dict[str, dict[str, str]] = {
    # --- D1  involved vs informational ---
    "private_verbs":       {"d1": "+"},
    "contractions":        {"d1": "+"},
    "present_aux":         {"d1": "+", "d2": "-"},
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
    "wh_questions":        {"d1": "+"},
    "be_verb":             {"d1": "+"},
    "nominalisations":     {"d1": "-", "d3": "+"},
    "prepositions":        {"d1": "-"},
    "attributive_adj":     {"d1": "-", "d2": "-"},
    "word_length":         {"d1": "-"},
    "type_token_ratio":    {"d1": "-"},
    # Only the biberplus backend can count these.
    "nouns":               {"d1": "-"},
    # --- D2  narrative vs non-narrative ---
    "past_tense":          {"d2": "+"},
    "third_person":        {"d2": "+"},
    "perfect_aspect":      {"d2": "+"},
    "public_verbs":        {"d2": "+"},
    "synthetic_negation":  {"d2": "+"},
    "present_participial": {"d2": "+"},
    # --- D3  elaborated vs situation-dependent reference ---
    "wh_relatives":        {"d3": "+"},
    "pied_piping":         {"d3": "+"},
    "phrasal_coordination": {"d3": "+"},
    "time_adverbials":     {"d3": "-"},
    "place_adverbials":    {"d3": "-"},
    "general_adverbs":     {"d3": "-"},
    # --- D4  overt expression of persuasion (no negative pole) ---
    "infinitives":         {"d4": "+"},
    "prediction_modals":   {"d4": "+"},
    "suasive_verbs":       {"d4": "+"},
    "conditional_sub":     {"d4": "+"},
    "necessity_modals":    {"d4": "+"},
    "split_auxiliaries":   {"d4": "+"},
    # --- D5  abstract vs non-abstract information (no negative pole) ---
    "conjuncts":           {"d5": "+"},
    "agentless_passives":  {"d5": "+"},
    "by_passives":         {"d5": "+"},
    "past_participial_cl": {"d5": "+"},
    "wz_past_participial": {"d5": "+"},
    "other_subordinators": {"d5": "+"},
    # --- D6  on-line informational elaboration (no negative pole) ---
    "that_verb_comp":      {"d6": "+"},
    "that_adj_comp":       {"d6": "+"},
    "that_relative_obj":   {"d6": "+"},
    "demonstratives":      {"d6": "+"},
}

ALL_DIMENSIONS = ("d1", "d2", "d3", "d4", "d5", "d6")

# Which features the local backend actually populates. Everything else needs a
# parse it does not have, and is left at zero — where zero variance makes it
# contribute nothing rather than contribute noise.
LOCAL_FEATURES = {
    "private_verbs", "contractions", "present_aux", "first_person",
    "second_person", "pronoun_it", "demonstrative_pron", "indefinite_pron",
    "analytic_negation", "emphatics", "amplifiers", "hedges",
    "discourse_particles", "possibility_modals", "causative_because",
    "wh_questions", "be_verb", "nominalisations", "prepositions",
    "attributive_adj", "word_length", "type_token_ratio",
    "past_tense", "third_person", "perfect_aspect", "public_verbs",
    "synthetic_negation", "present_participial",
    "wh_relatives", "pied_piping", "time_adverbials", "place_adverbials",
    "general_adverbs",
    "infinitives", "prediction_modals", "suasive_verbs", "conditional_sub",
    "necessity_modals", "split_auxiliaries",
    "conjuncts", "agentless_passives", "by_passives", "past_participial_cl",
    "other_subordinators",
    "that_verb_comp", "that_adj_comp", "demonstratives",
}

# Tercile labels. The name is what appears on a passage; the triple runs from
# the negative pole to the positive one.
LABELS: dict[str, tuple[str, tuple[str, str, str]]] = {
    "d1": ("voice", ("informational", "mixed", "involved")),
    "d2": ("mode", ("non-narrative", "mixed", "narrative")),
    "d3": ("reference", ("situated", "mixed", "elaborated")),
    # D4-D6 have no negative pole in Biber's solution: the score says how much
    # of the thing is present, not which of two ways of writing this is. The
    # labels say so rather than inventing an opposite.
    "d4": ("persuasion", ("unpersuasive", "moderate", "persuasive")),
    "d5": ("abstraction", ("non-abstract", "mixed", "abstract")),
    "d6": ("elaboration", ("unelaborated", "moderate", "elaborated")),
}

# The coverage grid stays two-dimensional on purpose. Bucketing on all six
# would be 3^6 = 729 cells over a pool of a few thousand, which is not
# coverage, it is a histogram of singletons.
GRID = ("d1", "d2")

VOICE_LABELS = LABELS["d1"][1]
MODE_LABELS = LABELS["d2"][1]
CELLS = [f"{v}/{m}" for v in VOICE_LABELS for m in MODE_LABELS]


def coverage(backend: str = "") -> dict[str, float]:
    """Fraction of each dimension's features the given backend populates.

    The number to look at before trusting a dimension. As of 2026-09-03 the
    local fallback covers every dimension well enough to score it, but not
    equally well, and the thin ones are thin in ways that matter: D3 has no
    phrasal coordination, D5 no WHIZ-deletion relatives, D6 no object-position
    that-relatives.
    """
    backend = backend or BACKEND
    out = {}
    for dim in ALL_DIMENSIONS:
        names = [n for n, poles in FEATURES.items() if dim in poles]
        if backend == "biberplus":
            out[dim] = 1.0
        else:
            out[dim] = len([n for n in names if n in LOCAL_FEATURES]) / len(names)
    return out


def scorable_dimensions(backend: str = "") -> tuple[str, ...]:
    """Which dimensions the given backend can honestly score.

    Two thirds of a dimension's features overall, and half of the features on
    each pole that has any. Currently every dimension clears this under both
    backends — the gate is here so that it is the arithmetic that decides and
    not a comment somebody forgot to update, and so a backend that covers less
    drops a dimension loudly instead of emitting a column of zeroes.
    """
    backend = backend or BACKEND
    out = []
    for dim in ALL_DIMENSIONS:
        names = [n for n, poles in FEATURES.items() if dim in poles]
        if backend == "biberplus":
            out.append(dim)
            continue
        if len([n for n in names if n in LOCAL_FEATURES]) / len(names) < 2 / 3:
            continue
        poles_ok = True
        for sign in ("+", "-"):
            pole = [n for n in names if FEATURES[n][dim] == sign]
            if pole and len([n for n in pole if n in LOCAL_FEATURES]) / len(pole) < 0.5:
                poles_ok = False
        if poles_ok:
            out.append(dim)
    return tuple(out)


def _local_features(text: str) -> dict[str, float]:
    """Dependency-free approximation of the feature set.

    Where a feature needs a part-of-speech tagger or a parse, it is either
    proxied — and the proxy named in a comment — or left out of
    `LOCAL_FEATURES` entirely. Proxies are consistent across a corpus, which
    is what standardisation needs; they are not Biber's numbers.
    """
    low = text.lower()
    words = [w.lower() for w in WORD.findall(text)]
    n = len(words)
    if not n:
        return {k: 0.0 for k in FEATURES}

    sentences = [s for s in SENT.split(text) if s.strip()]

    past = sum(
        1
        for w in words
        if w in IRREGULAR_PAST
        or (w not in NOT_PAST and REGULAR_PAST.fullmatch(w))
    )

    dem_pron = len(DEMONSTRATIVE_PRONOUN.findall(text))
    that_verb = len(THAT_VERB_COMPLEMENT.findall(text))
    that_adj = len(THAT_ADJ_COMPLEMENT.findall(text))
    # biberplus tags DEMO as the demonstratives left over once the pronoun and
    # complementiser uses are taken out. Same subtraction, cruder inputs.
    demonstratives = max(
        0, len(DEMONSTRATIVE_ANY.findall(text)) - dem_pron - that_verb - that_adj
    )

    feats = {
        # D1
        "private_verbs": _rate(_hits(words, PRIVATE_VERBS), n),
        "contractions": _rate(len(CONTRACTION.findall(text)), n),
        # proxy: present-tense BE/HAVE/DO only. Lexical present tense needs a
        # tagger to separate `records` the verb from `records` the noun.
        "present_aux": _rate(_hits(words, PRESENT_AUX), n),
        "first_person": _rate(_hits(words, FIRST_PERSON), n),
        "second_person": _rate(_hits(words, SECOND_PERSON), n),
        "pronoun_it": _rate(sum(1 for w in words if w in ("it", "its", "it's")), n),
        "demonstrative_pron": _rate(dem_pron, n),
        "indefinite_pron": _rate(_hits(words, INDEFINITE_PRONOUNS), n),
        "analytic_negation": _rate(len(NOT_NEGATION.findall(text)), n),
        "emphatics": _rate(_hits(words, EMPHATICS), n),
        "amplifiers": _rate(_hits(words, AMPLIFIERS), n),
        "hedges": _rate(
            _hits(words, HEDGES) + _phrases(low, HEDGE_PHRASES), n
        ),
        "discourse_particles": _rate(_hits(words, DISCOURSE_PARTICLES), n),
        "possibility_modals": _rate(_hits(words, POSSIBILITY_MODALS), n),
        "causative_because": _rate(len(CAUSATIVE.findall(text)), n),
        "wh_questions": _rate(len(WH_QUESTION.findall(text)), n),
        "be_verb": _rate(_hits(words, PUBLIC_BE), n),
        "nominalisations": _rate(len(NOMINALISATION.findall(text)), n),
        "prepositions": _rate(_hits(words, PREPOSITIONS), n),
        # proxy: adjective-forming suffixes, without the attributive position
        # test. Picks up predicative adjectives too.
        "attributive_adj": _rate(len(ADJ_SUFFIX.findall(text)), n),
        # Not rates. Biber standardises them the same way.
        "word_length": statistics.mean(len(w) for w in words),
        # Passage lengths are bounded to 150-400 words by `segment.py`, so
        # this is comparable without a fixed window.
        "type_token_ratio": len(set(words)) / n,
        "nouns": 0.0,  # needs a tagger
        # D2
        "past_tense": _rate(past, n),
        "third_person": _rate(_hits(words, THIRD_PERSON), n),
        "perfect_aspect": _rate(len(PERFECT.findall(text)), n),
        "public_verbs": _rate(_hits(words, PUBLIC_VERBS), n),
        "synthetic_negation": _rate(len(SYNTHETIC_NEGATION.findall(text)), n),
        "present_participial": _rate(len(PRESENT_PARTICIPIAL.findall(text)), n),
        # D3
        "wh_relatives": _rate(len(WH_RELATIVE.findall(text)), n),
        "pied_piping": _rate(len(PIED_PIPING.findall(text)), n),
        "phrasal_coordination": 0.0,  # needs a tagger
        "time_adverbials": _rate(_hits(words, TIME_ADVERBIALS), n),
        "place_adverbials": _rate(_hits(words, PLACE_ADVERBIALS), n),
        "general_adverbs": _rate(len(GENERAL_ADVERB.findall(text)), n),
        # D4
        "infinitives": _rate(len(INFINITIVE.findall(low)), n),
        "prediction_modals": _rate(_hits(words, PREDICTION_MODALS), n),
        "suasive_verbs": _rate(_hits(words, SUASIVE_VERBS), n),
        "conditional_sub": _rate(len(CONDITIONAL.findall(text)), n),
        "necessity_modals": _rate(_hits(words, NECESSITY_MODALS), n),
        "split_auxiliaries": _rate(len(SPLIT_AUXILIARY.findall(text)), n),
        # D5
        "conjuncts": _rate(
            _hits(words, CONJUNCTS) + _phrases(low, CONJUNCT_PHRASES), n
        ),
        "agentless_passives": _rate(len(AGENTLESS_PASSIVE.findall(text)), n),
        "by_passives": _rate(len(BY_PASSIVE.findall(text)), n),
        "past_participial_cl": _rate(len(PAST_PARTICIPIAL_CLAUSE.findall(text)), n),
        "wz_past_participial": 0.0,  # needs a tagger
        "other_subordinators": _rate(
            _hits(words, OTHER_SUBORDINATORS) + _phrases(low, SUBORDINATOR_PHRASES), n
        ),
        # D6
        "that_verb_comp": _rate(that_verb, n),
        "that_adj_comp": _rate(that_adj, n),
        "that_relative_obj": 0.0,  # needs a tagger
        "demonstratives": _rate(demonstratives, n),
    }
    # Diagnostics, not features. `fit` and `dimensions` ignore anything
    # starting with an underscore.
    feats["_sentences"] = float(len(sentences) or 1)
    feats["_words"] = float(n)
    return feats


# biberplus tag -> this module's feature name. Several tags collapse onto one
# feature; the values are summed.
_BIBERPLUS_MAP = {
    # D1
    "PRIV": "private_verbs",
    "CONT": "contractions",
    "VPRT": "present_aux",      # real present tense, not the aux proxy
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
    "WHQU": "wh_questions",
    "WHCL": "wh_questions",
    "BEMA": "be_verb",
    "NOMZ": "nominalisations",
    "PIN": "prepositions",
    "JJ": "attributive_adj",
    "NN": "nouns",
    # D2
    "VBD": "past_tense",
    "TPP3": "third_person",
    "PEAS": "perfect_aspect",
    "PUBV": "public_verbs",
    "SYNE": "synthetic_negation",
    "PRESP": "present_participial",
    # D3
    "WHSUB": "wh_relatives",
    "WHOBJ": "wh_relatives",
    "PIRE": "pied_piping",
    "PHC": "phrasal_coordination",
    "TIME": "time_adverbials",
    "PLACE": "place_adverbials",
    "RB": "general_adverbs",
    # D4
    "TO": "infinitives",
    "PRMD": "prediction_modals",
    "SUAV": "suasive_verbs",
    "COND": "conditional_sub",
    "NEMD": "necessity_modals",
    "SPAU": "split_auxiliaries",
    # D5
    "CONJ": "conjuncts",
    "PASS": "agentless_passives",
    "BYPA": "by_passives",
    "PASTP": "past_participial_cl",
    "WZPAST": "wz_past_participial",
    "OSUB": "other_subordinators",
    # D6
    "THVC": "that_verb_comp",
    "THAC": "that_adj_comp",
    "TOBJ": "that_relative_obj",
    "DEMO": "demonstratives",
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


_PROBED = False


def probe() -> str:
    """Settle which backend is really usable, once, and return it.

    An import is not proof: `biberplus` installs cleanly without its spaCy
    model and then raises on the first passage. Without this, a whole harvest
    would run on the fallback while every report claimed otherwise.
    """
    global BACKEND, _PROBED
    if _PROBED or BACKEND != "biberplus":
        _PROBED = True
        return BACKEND
    _PROBED = True
    try:
        _biberplus_features("The procedure was administered to the subject.")
    except Exception as e:
        print(f"  ! biberplus imported but cannot run ({type(e).__name__}: {e})")
        print("    falling back to the local backend; D3 and D6 will be skipped.")
        BACKEND = "local"
    return BACKEND


def features(text: str) -> dict[str, float]:
    """Raw feature rates for one passage, per 1000 words.

    Keys prefixed with `_` are diagnostics, not features, and are ignored by
    `fit` and `dimensions`.
    """
    if probe() == "biberplus":
        return _biberplus_features(text)
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

    scored = scorable_dimensions()
    stats = {
        "backend": BACKEND,
        "n": len(feature_rows),
        "scored": list(scored),
        "features": fstats,
        "dimensions": {d: {"mean": 0.0, "sd": 1.0} for d in scored},
    }

    for d in scored:
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


def scored_dimensions(stats: dict) -> tuple[str, ...]:
    """The dimensions a given stats object actually carries."""
    return tuple(stats.get("scored") or stats.get("dimensions", {}).keys())


def dimensions(feats: dict[str, float], stats: dict) -> dict[str, float]:
    """Standardised scores for every dimension this corpus was fitted for."""
    out = {}
    for d in scored_dimensions(stats):
        ds = stats["dimensions"][d]
        out[d] = round(_z(_raw_dimension(feats, stats, d), ds["mean"], ds["sd"]), 4)
    return out


def _terciles(feature_rows: list[dict[str, float]], stats: dict) -> dict:
    """Cut points at the 33rd and 67th percentile of each dimension."""
    cuts = {}
    for d in scored_dimensions(stats):
        vals = sorted(
            _z(_raw_dimension(r, stats, d), stats["dimensions"][d]["mean"],
               stats["dimensions"][d]["sd"])
            for r in feature_rows
        )
        cuts[d] = [_pct(vals, 1 / 3), _pct(vals, 2 / 3)] if vals else [0.0, 0.0]
    return cuts


def _pct(sorted_vals: list[float], q: float) -> float:
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


# --- labels ---------------------------------------------------------------


def _bucket(value: float, cuts: list[float], labels: tuple) -> str:
    if value <= cuts[0]:
        return labels[0]
    if value >= cuts[1]:
        return labels[2]
    return labels[1]


def facets(feats: dict[str, float], stats: dict) -> dict:
    """The stored facet record: a continuous score and a tercile label per
    dimension, for every dimension this corpus was fitted for."""
    d = dimensions(feats, stats)
    cuts = stats.get("terciles") or {}
    out: dict = {}
    for dim, score in d.items():
        name, labels = LABELS[dim]
        out[name] = _bucket(score, cuts.get(dim, [0.0, 0.0]), labels)
    out.update(d)
    return out


def cell(facet: dict | None) -> str:
    """The coverage-grid cell a passage falls in. 9 cells, plus one for
    unscored.

    Tolerates a non-dict: `themes.jsonl` has carried its own `facets` — a list
    of shape labels from `themes.py` — since before this module existed, and
    the two are unrelated.
    """
    if not isinstance(facet, dict) or not facet:
        return "(unscored)"
    return "/".join(facet.get(LABELS[d][0], "?") for d in GRID)


def label_options() -> dict[str, tuple[str, ...]]:
    """Every filterable label, by dimension name. Used by `--facet`."""
    return {LABELS[d][0]: LABELS[d][1] for d in ALL_DIMENSIONS}


def matches(facet: dict | None, query: str) -> bool:
    """Does a passage match a `--facet` query?

    Accepts a whole cell (`involved/narrative`), a `dimension=label` pair
    (`persuasion=persuasive`), or a bare label where it is unambiguous.
    `moderate` is deliberately not unambiguous — D4 and D6 both use it — and
    a bare ambiguous label matches nothing, which `__main__` turns into an
    error rather than a silently empty queue.
    """
    if not isinstance(facet, dict) or not facet:
        return False
    query = query.strip().lower()
    if "=" in query:
        dim, _, want = query.partition("=")
        return str(facet.get(dim.strip(), "")).lower() == want.strip()
    if cell(facet) == query:
        return True
    owners = [n for n, labels in label_options().items() if query in labels]
    if len(owners) != 1:
        return False
    return str(facet.get(owners[0], "")).lower() == query


def ambiguous(query: str) -> list[str]:
    """Dimension names that share a bare label. Empty when the query is fine."""
    query = query.strip().lower()
    if "=" in query or "/" in query:
        return []
    owners = [n for n, labels in label_options().items() if query in labels]
    return owners if len(owners) > 1 else []
