# pipeline — seeding machinery

Two extractions, one bank each, one decision trail each.

**Passages** are verbatim prose, 150–400 words, harvested from original
sources in `sources/texts/`. They condition *how a story reads*. They feed
`extracted/examples.jsonl`.

**Themes** are abstractions — one sentence carrying a mechanism and a turn.
They condition *what gets made*. They feed `extracted/themes.jsonl`. The shape
is playbook §2's, measured: see **Themes** below.

A source declares which of the two it feeds. Not every source feeds both: the
academic literature yields themes only, and the settings (setting-c,
setting-b) yield themes from researched reference material rather than
from source fiction at all.

## Running it

```bash
python -m pipeline harvest              # sources -> passage candidates
python -m pipeline facets               # score the pool on Biber D1-D6
python -m pipeline themes --brief scp   # a drafting brief for a session
python -m pipeline themes --ingest f.json --source scp   # validate and bank
python -m pipeline themes --audit       # grain, against playbook §2
python -m pipeline serve                # the cull in a browser: the funnel
python -m pipeline review --triage      # or in the terminal: 40 words, k / p / x
python -m pipeline review --compare     # five at a time, pick the best
python -m pipeline review               # careful pass: full text, one at a time
python -m pipeline review --themes      # dense multi-select over the themes
python -m pipeline stats --target 8     # progress toward a stop rule
python -m pipeline export               # kept passages -> extracted/examples.md
python -m pipeline draw -n 6 -t 2       # a generation packet, under the default setting
python -m pipeline draw --setting setting-b   # under a lore setting
python -m pipeline.selftest             # verify the code works after a sync
```

`harvest` then `facets`, in that order: a Biber dimension is a z-score against
the whole pool, so it cannot be computed one passage at a time on the way past.

Scope a run with `--only scp datlow`. Scope a review with `--facet involved`
(a voice, a mode, or a whole cell like `involved/narrative`), `--withheld`,
`--order cluster`, `--limit 40`.

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

**The grain is measured, not asserted.** `GRAIN` in `themes.py` is playbook
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

The calibration test both ways: **playbook §2 passes its own validator at 98%,
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
the turn, and two records will not combine the way playbook §1.1 needs two
entries to.

## Why the trail matters

`extracted/decisions.jsonl` is append-only and is never rewritten, deduplicated or
pruned. Every keep and every pass is a row, with a timestamp. Two consequences
worth stating plainly:

- **The pool is disposable; the decisions are not.** Delete
  `examples.jsonl` and a re-harvest rebuilds it. Delete `decisions.jsonl`
  and the labelled data is gone for good.
- **Passage ids are content-derived**, from source plus normalized text. Change
  the segmentation heuristics, re-harvest, and every passage whose text is
  unchanged keeps its id and its earlier verdict. That is deliberate: it is
  what lets the heuristics be improved without discarding the labels.

Every row carries a `method`, because the three review modes are not the same
evidence. A `compare` keep means "best of the five on that screen" — a
ranking, with a `group` id so the screen can be reconstructed. A `triage` pass
means "rejected on 40 words". A `manual` verdict is a full read. Anything
fitted to this trail has to be able to tell them apart.

Passes are as valuable as keeps. A discriminator trained on keeps alone has no
negatives, and this pool is mostly negatives by design.

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
it is unambiguous. `pipeline review --facet '?'` lists them.

```bash
pipeline review --facet involved/narrative     # a grid cell
pipeline review --facet abstraction=abstract   # any dimension
pipeline review --facet elaborated             # ambiguous: D3 and D6 both
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

## The funnel

`pipeline serve` opens the cull on `127.0.0.1:3002` in three modes, meant to be
run in this order. Every verdict goes through the same `Bank.record` as a
terminal verdict and carries a `method` saying which mode produced it.

| mode | shows | writes | run it over |
| :-- | :-- | :-- | :-- |
| **Ledger** | 20 themes a screen, keep by number | `method: "ledger"` | all 404 themes, one sitting |
| **Deck** | 40 words, `space` expands | `triage`, or `manual` once expanded | all 947 passages |
| **Bench** | full text, six dimensions, a note | `method: "bench"` | the survivors only |

**A survivor is a keep or a maybe from a cheap pass.** `Bank.survivors()` is
the middle of the funnel: verdicts whose method is one of `triage`, `compare`,
`multiselect` or `ledger`. A bench verdict supersedes the triage one — latest
wins — so an item leaves the bench by being read, never by being marked. A
verdict given *after* expanding in the Deck is already a full read, is written
as `manual`, and correctly never reaches the bench.

Keys: `1` `2` `3` switch mode, `f` keep, `j` pass, `m` maybe, `a` artifact,
`space` expand, `x` toggle a ledger row, `enter` commit a screen, `u` undo,
`?` for the list.

**`a` is not a fourth verdict.** It records a `pass` with `method: "artifact"`
and a note, because a passage with markup in it is not usable prose — but the
method says the fault is the extractor rather than the writing, so the flagged
ids can be pulled back out of the trail and fixed at source:

```bash
grep '"method": "artifact"' extracted/decisions.jsonl
```

`pipeline stats` reports the count, and a non-zero one is a bug list.

**Undo has a window, not a rewrite.** A verdict is held for 1.4s before it is
posted; undo inside that window means nothing was ever written. Undo after it
appends a superseding row, because the trail is append-only and a correction
is a new row rather than an erasure. The top bar says whether anything is
pending, and closing the tab with unsaved verdicts warns.

Why a browser at all, when the terminal reviewer works: the thing under
judgement is prose *register*, and register cannot be judged fairly in a 15px
monospace column. The passages are set in a serif at a reading measure because
that is the only way the judgement is about the prose rather than about the
typography. Everything else — the stop-rule gauges, the facet chips, the
dimension bars — is chrome around that one decision.

Standard library only: `http.server`, one HTML file, no build step, no
framework, loopback-only binding.

## Culling is the constraint

947 passages at 30–60s of careful reading each is 8–15 hours, and the pool
grows several-fold once the PDFs are harvested. The interface is the
bottleneck, not the taxonomy. Hence:

- **`--triage`** shows the first 40 words. Most rejects are obvious in one
  sentence, and paying 400 words to say no is the largest waste in the loop.
  `x` expands; a verdict after expanding is recorded as a full read, not a
  triage call. Run it over everything, then a careful pass over survivors.
- **`--compare`** shows five at a time. Forced choice, ties permitted and
  encouraged, no numeric scales. ~190 screens instead of 947, and it yields
  ranking data rather than a binary.
- **`--order cluster`** keeps consecutive screens inside one facet cell, so
  calibration holds instead of every screen being a register switch.
- **`--themes`** is a different interface entirely: 20 short themes a screen,
  keep by number. The whole 400-odd set is half an hour.

**Do not aim to label the pool.** `pipeline stats` reports the keep rate per
block of 50 in decision order and, with `--target N`, which facet cells are
still short. Stop when the marginal keep rate flattens or every cell has
enough — not when the queue is empty.

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

## Where the feedback edges attach

Nothing consumes `decisions.jsonl` yet. When there is enough of it, four
things should read it, in rough order of value:

1. **Validation of the facets themselves.** Which facet, if any, predicts a
   keep? Anything that predicts nothing gets dropped, including D1 and D2.
2. **Generation** — suppress ground already mined, so premises stop landing
   near ones already written.
3. **`examples.md`** — promote kept passages into the conditioning set as
   taste moves, instead of freezing at the first cull.
4. **The scorer and the sampler** — fit `register_score` weights, and the
   render order, against keeps and passes rather than the hand-set constants.

## Licensing

SCP material is CC BY-SA 3.0 and carries author, source and licence through to
the bank; anything published from it must too. Watts is CC BY-NC-SA. The
anthology PDFs are not redistributable — they are read locally, passages are
held locally for conditioning, and nothing derived from them should be
published verbatim. `research/corpus.md` has the licensing map for the wider set.
