# pipeline — seeding machinery

Two extractions, one bank each, one decision trail each.

**Passages** are verbatim prose, 150–400 words, harvested from original
sources in `sources/texts/`. They condition *how a story reads*. They feed
`extracted/examples.jsonl`.

**Themes** are abstractions — one sentence carrying a mechanism and a turn.
They condition *what gets made*. They feed `extracted/themes.jsonl`. The shape
is the retired playbook bank's, measured before it went: see **Themes** below.

A source declares which of the two it feeds. Not every source feeds both: the
academic literature yields themes only, and the settings (setting-c,
setting-b) yield themes from researched reference material rather than
from source fiction at all.

## Running it

```bash
python -m pipeline harvest              # sources -> passage candidates
python -m pipeline facets               # score the pool on Biber D1-D6
python -m pipeline themes --brief scp    # a drafting brief for a session
python -m pipeline themes --ingest f.json --source scp   # validate and bank
python -m pipeline themes --audit        # grain, against pipeline/grain.md
python -m pipeline stats                 # what is in the banks
python -m pipeline draw -n 6 -t 2        # a generation packet
python -m pipeline.selftest              # verify the code works after a sync
```

`harvest` then `facets`, in that order: a Biber dimension is a z-score against
the whole pool, so it cannot be computed one passage at a time on the way past.

Scope a harvest with `--only scp datlow`. Scope a draw with `--facet involved`
(a voice, a mode, or a whole cell like `involved/narrative`), `--order-by`,
`--seed`.

**There is no cull.** Keep, pass and maybe, the append-only decision trail, the
terminal reviewer and the browser one were all removed on 2026-09-03 and will
be re-added later. Both banks are pools as they stand and `draw` samples the
whole of them.

## Themes

A theme is one sentence carrying **a mechanism and a turn**:

> The body altered to meet a written specification, and the specification is a
> purchasing document.

There is one intake, and a model drafts into it. Local sentence extraction was
removed on 2026-09-03 — it selected spans of the source, which is extractive
where the task is abstractive; `research/themes.md` §1 is the post-mortem and
§11 is the format argument.

```bash
python -m pipeline themes --brief scp > brief.md
# a session reads the sources and drafts themes.json against the brief
python -m pipeline themes --ingest themes.json --source scp
python -m pipeline themes --audit
```

**The grain is measured, not asserted.** `GRAIN` in `themes.py` is the retired
§2 — 376 bullets, the only seed format in this project with evidence behind it
— and `--audit` compares the bank against it on the same six numbers.

Validation is split, because §2 is not uniform:

| enforced per row by `check()` | 100% of §2 |
| :-- | :-- |
| 9–44 words, at most two sentences | yes |
| no proper nouns, no designations | yes |
| does not open on a deictic | yes |

| reported over the bank by `--audit` | §2 rate |
| :-- | --: |
| carries a turn | 63% |
| names who it is done to | 41% |
| implies a cost or a no-exit | 19% |

Those three are distributional. A per-row rule for them would be tighter than
the evidence, and would reject a third of the bank that produced the slate.

The calibration test both ways: **the reference passes its own validator at 98%,
the 432 mined rows it replaced passed at 20%** — 226 carried a proper noun and
224 a designation, welding them to the article they came from.

### Drafting

The brief carries the rules, eight real §2 bullets drawn at random as
few-shot, and the roles to draft *through* rather than store:

```
mechanism      the process, stated as a process
subject        who it is done to, and at what scale
cost           what is given up, and whether it returns
normalisation  how the setting makes it ordinary
```

Answer those, then compress to one sentence that implies all four without
listing them. A labelled record was tried and rejected: it has nowhere to put
the turn, and two records will not combine the way the ideation step needs two
entries to.

## Why generous

The harvester over-produces. Windows overlap, and a passage with no facet at
all still enters the pool. That is the intended division of labour: recall is
the machine's job, precision is Chris's. A harvester tuned for precision would
be making the taste call, which is the one call it must not make.

## Facets

`biber.py` scores every passage on all six of Biber's (1988) dimensions — the
established empirical framework for describing how a text reads.
`research/tagging.md` has the citations.

| | dimension | negative pole | positive pole |
| :-- | :-- | :-- | :-- |
| **D1** | `voice` | `informational` — nouns, prepositions, nominalisation, long words | `involved` — private verbs, contractions, 1st/2nd person, present tense |
| **D2** | `mode` | `non-narrative` — present tense, attributive adjectives | `narrative` — past tense, 3rd person, perfect aspect, public verbs |
| **D3** | `reference` | `situated` — time and place adverbials, general adverbs | `elaborated` — WH relatives, pied-piping, phrasal coordination, nominalisation |
| **D4** | `persuasion` | *(none)* | `persuasive` — infinitives, prediction and necessity modals, suasive verbs, conditionals, split auxiliaries |
| **D5** | `abstraction` | *(none)* | `abstract` — conjuncts, agentless and by-passives, participial clauses, adverbial subordinators |
| **D6** | `elaboration` | *(none)* | `elaborated` — that-complements of verbs and adjectives, that-relatives, demonstratives |

D4, D5 and D6 have no negative pole in Biber's solution: the score says how
much of the thing is present, not which of two ways of writing this is. Their
low-tercile labels (`unpersuasive`, `non-abstract`, `unelaborated`) name an
absence, not an opposite.

A feature may load on more than one dimension — that is Biber's solution, not
a bug. Nominalisations are D1-negative and D3-positive; attributive adjectives
are negative on both D1 and D2; present tense is D1-positive and D2-negative.
It is also why D1 and D3 correlate here at -0.53: they share a feature by
construction.

**Only D1 and D2 bucket the pool.** Terciles on those two give the 9-cell
`voice/mode` grid that `pipeline stats` and `draw --coverage` use. Bucketing on
all six would be 3^6 = 729 cells over a few thousand passages, which is not
coverage, it is a histogram of singletons. The other four are scored, stored
and filterable, and they are what Part 3 tests against real verdicts.

### Do they earn their place?

Over 947 SCP passages, scored with biberplus. `pipeline facets` prints this.

| dimension | range | skew | closest other |
| :-- | :-- | :-- | :-- |
| `voice` | -1.67 .. +4.14 | +1.24 | `reference` -0.53 |
| `mode` | -2.19 .. +4.00 | +0.70 | `abstraction` -0.09 |
| `reference` | -3.12 .. +2.98 | -0.08 | `voice` -0.53 |
| `persuasion` | -1.86 .. +4.30 | +0.75 | `voice` +0.24 |
| `abstraction` | -2.02 .. +3.78 | +0.42 | `voice` -0.49 |
| `elaboration` | -1.11 .. +4.35 | +1.36 | `persuasion` +0.20 |

Nothing is redundant: the largest correlation between any two dimensions is
0.53, so the most overlapping pair still shares only a quarter of its
variance. D2, D4 and D6 are near-orthogonal to everything. This is a corpus of
containment documents, though — the point of D3-D6 is the anthology PDFs,
which are several times larger and are fiction. Re-read this table after that
harvest.

### Filtering

`--facet` takes a whole cell, a `dimension=label` pair, or a bare label where
it is unambiguous. `pipeline draw --facet '?'` lists them.

```bash
pipeline draw --facet involved/narrative     # a grid cell
pipeline draw --facet abstraction=abstract   # any dimension
pipeline draw --facet elaborated             # ambiguous: D3 and D6 both
```

The last one is an error, not an empty queue — `elaborated` is a label on both
`reference` and `elaboration`, and the command says so and names the fix.

### Backends

`biberplus` if it imports **and its spaCy model loads**, else a dependency-free
local fallback. An import is not proof: biberplus installs cleanly without the
model and then raises on the first passage, so `biber.probe()` runs one and
downgrades once, loudly, rather than per-passage.

```bash
pip install --user --break-system-packages biberplus
pip install --user --break-system-packages \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

The second line is deliberate: `python -m spacy download` shells out to pip
without `--break-system-packages` and fails on a PEP 668 system.

The fallback reaches all six dimensions — 47 of the 51 features are lexical
enough to fake — but it is missing `nouns`, `phrasal_coordination`,
`wz_past_participial` and `that_relative_obj` entirely, and several of the
rest are regex proxies. Agreement over the same 947 passages:

| dimension | r | tercile agreement | local feature coverage |
| :-- | --: | --: | --: |
| `voice` | 0.96 | 82% | 96% |
| `mode` | 0.80 | 66% | 100% |
| `reference` | 0.76 | 63% | 86% |
| `persuasion` | 0.83 | 69% | 100% |
| `abstraction` | 0.68 | 60% | 83% |
| `elaboration` | 0.78 | 69% | 75% |

D1 is effectively the same measurement either way. D5 is the worst, because
detecting a passive without a parse is a regex over BE plus a participle list.
**Use biberplus.** The two are not interchangeable within one corpus —
standardisation is corpus-relative, so switching backends means
`pipeline facets --refit`; `facet-stats.json` records which one fitted it and
the command refuses to mix them.

**One tag survives, and it is not a tag.** `withheld` is a boolean flag for
redaction and elision — a surface fact about the text, cheaply detectable,
with no reading of the passage inside it. Filter on it with `--withheld`.

### What used to be here

Six failure tags — `no-resolution`, `warm-mechanism`, `document-working`,
`clinical-body`, `scale`, `withheld` — coined in one session on 2026-09-02 and
grounded in nothing. They were not merely decorative: `register_score`
carried a `0.30 * max(tag_scores)` term that contributed a mean of 0.119, was
the largest positive term for 199 of 1,024 passages, and swapped 11 of the top
12 when removed. An unvalidated taxonomy was deciding what got read first.

The pool itself never depended on them — selection is bound by the
overlap-rejection rule in `top_per_doc`, not by score — so removing them
changed the order and not the contents.

## What is heuristic and what that costs

`signals.py` is lexical and structural; `biber.py` is grammatical. No model
reads anything and no network call is made. Each number is named and
inspectable, which is how every stripper bug so far has been found: two behind
raw CSS at the top of D1, a third behind raw CSS at the bottom of D5 — an
`[[html]]` block that no rule was dropping — and a fourth, the worst of them,
found by reading the pool for surviving markup rather than by score.
**Always check the extremes**, and there are twelve of them now, not four:
`pipeline facets --extremes 5`.

**The fourth was silent.** `[[module Rate]]` is self-closing, and the paired
drop rule matched it non-greedily forward to the *next* module's `[[/module]]`,
deleting everything in between. It removed 1,482 of scp-2316's 1,676 words and
took five articles to zero. Fixing it recovered **41,316 words, 8% of the SCP
corpus**, and the pool went from 947 passages to 1,016. Paired rules now refuse
to span a second opener of the same tag.

Four more classes were leaking into passages and are now handled: wikidot
tables (`||~ h||` rows are data, so the block is classed `meta` and never
harvested), colour spans (`##red|text##`), literal spans (`@@text@@` and the
`@@@@` spacer), and heading markers left mid-block. Regression checks for all
of them are in the selftest fixture.

The costs, named:

- **The local backend's D5 is the weak one.** r = 0.68 against biberplus, 60%
  tercile agreement, because a passive without a parse is a regex. Install
  `biberplus` and refit.
- **`register_score` is still hand-set constants.** Nothing in it is fitted to
  anything. `PLAN.md` Part 3 is where that gets tested against real verdicts.
- **Local theme extraction is the weakest component overall.** It matches the
  grammatical shapes a mechanism takes. It will hand you sentences that are
  merely procedural. Cull hard, or lean on the research intake for anything
  that matters.
- **PDF story splitting is best-effort.** Anthology attribution comes from a
  title-page heuristic. Check the author line before quoting anything
  publicly.

## Where the feedback edges will attach

Nothing consumes verdicts, because nothing records them yet. When the decision
layer comes back, four things should read it, in rough order of value:

1. **Validation of the facets themselves.** Which facet, if any, predicts a
   keep? Anything that predicts nothing gets dropped, including D1 and D2.
2. **Generation** — suppress ground already mined, so premises stop landing
   near ones already written.
3. **The conditioning set** — promote kept passages as taste moves, instead of
   freezing at the first cull.
4. **The scorer and the sampler** — fit `register_score` weights, and the
   render order, against keeps and passes rather than the hand-set constants.

## Licensing

SCP material is CC BY-SA 3.0 and carries author, source and licence through to
the bank; anything published from it must too. Watts is CC BY-NC-SA. The
anthology PDFs are not redistributable — they are read locally, passages are
held locally for conditioning, and nothing derived from them should be
published verbatim. `research/corpus.md` has the licensing map for the wider set.
