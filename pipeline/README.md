# pipeline — seeding machinery

Two extractions, one bank each, one decision trail each.

**Passages** are verbatim prose, 150–400 words, harvested from original
sources in `sources/texts/`. They condition *how a story reads*. They feed
`extracted/exemplars.jsonl`.

**Themes** are abstractions — a mechanism, what it costs, who it is done to.
They condition *what gets made*. They feed `extracted/themes.jsonl`.

A source declares which of the two it feeds. Not every source feeds both: the
academic literature yields themes only, and the settings (setting-c,
setting-b) yield themes from researched reference material rather than
from source fiction at all.

## Running it

```bash
python -m pipeline harvest              # sources -> passage candidates
python -m pipeline facets               # score the pool on Biber D1/D2
python -m pipeline themes               # sources -> theme candidates
python -m pipeline review --triage      # fast pass: 40 words, k / p / x
python -m pipeline review --compare     # five at a time, pick the best
python -m pipeline review               # careful pass: full text, one at a time
python -m pipeline review --themes      # dense multi-select over the themes
python -m pipeline stats --target 8     # progress toward a stop rule
python -m pipeline export               # kept passages -> extracted/exemplars.md
python -m pipeline draw -n 6 -t 2       # a generation packet
python -m pipeline.selftest             # verify the code works after a sync
```

`harvest` then `facets`, in that order: a Biber dimension is a z-score against
the whole pool, so it cannot be computed one passage at a time on the way past.

Scope a run with `--only scp datlow`. Scope a review with `--facet involved`
(a voice, a mode, or a whole cell like `involved/narrative`), `--withheld`,
`--order cluster`, `--limit 40`.

For a setting:

```bash
python -m pipeline themes --research setting-c > brief.md
# a Claude session does the reading, writes themes.json
python -m pipeline themes --ingest themes.json --source setting-c
```

## Why the trail matters

`extracted/decisions.jsonl` is append-only and is never rewritten, deduplicated or
pruned. Every keep and every pass is a row, with a timestamp. Two consequences
worth stating plainly:

- **The pool is disposable; the decisions are not.** Delete
  `exemplars.jsonl` and a re-harvest rebuilds it. Delete `decisions.jsonl`
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

`biber.py` scores every passage on two of Biber's (1988) dimensions — the
established empirical framework for describing how a text reads, and the two
that demonstrably reproduce in this corpus. `research/tagging.md` has the
citations and the evidence.

| dimension | negative pole | positive pole |
| :-- | :-- | :-- |
| **D1** `voice` | `informational` — nouns, prepositions, nominalisation, long words | `involved` — private verbs, contractions, 1st/2nd person, present tense |
| **D2** `mode` | `non-narrative` | `narrative` — past tense, 3rd person, perfect aspect, public verbs |

Terciles on each give a 9-cell `voice/mode` grid. `pipeline stats` breaks the
kept set down by cell, and `pipeline draw --coverage` takes one from each cell
before any cell gets a second — which is clustering retrieval, the standard
diversity method for in-context demonstrations.

D3–D6 are deliberately not implemented. Biber derived them to separate
conversation from academic prose, a far wider spread than this corpus has, and
there is no evidence they discriminate here.

**Two backends.** `biberplus` if it imports, else a dependency-free local
fallback of closed word lists and regexes. Over the 948-passage SCP pool the
two correlate at **r = 0.97 on D1** and **r = 0.76 on D2** — the local D1 is
effectively the same measurement, the local D2 noticeably rougher, because
past-tense detection without a part-of-speech tagger is a suffix rule and a
list of irregulars. The two are *not* interchangeable within one corpus:
standardisation is corpus-relative, so switching backends means
`pipeline facets --refit`. `extracted/facet-stats.json` records which one
fitted it and the command refuses to mix them.

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

## Culling is the constraint

948 passages at 30–60s of careful reading each is 8–15 hours, and the pool
grows several-fold once the PDFs are harvested. The interface is the
bottleneck, not the taxonomy. Hence:

- **`--triage`** shows the first 40 words. Most rejects are obvious in one
  sentence, and paying 400 words to say no is the largest waste in the loop.
  `x` expands; a verdict after expanding is recorded as a full read, not a
  triage call. Run it over everything, then a careful pass over survivors.
- **`--compare`** shows five at a time. Forced choice, ties permitted and
  encouraged, no numeric scales. ~190 screens instead of 948, and it yields
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
inspectable, which is why the last eyeball of the D1 extremes found raw CSS at
the top and two SCP stripper bugs behind it. **Always check the extremes:**
`pipeline facets --extremes 5`.

The costs, named:

- **The local backend's D2 is the weak one.** r = 0.76 against biberplus,
  62% tercile agreement. Where D2 matters, install `biberplus` and refit.
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
3. **`exemplars.md`** — promote kept passages into the conditioning set as
   taste moves, instead of freezing at the first cull.
4. **The scorer and the sampler** — fit `register_score` weights, and the
   render order, against keeps and passes rather than the hand-set constants.

## Licensing

SCP material is CC BY-SA 3.0 and carries author, source and licence through to
the bank; anything published from it must too. Watts is CC BY-NC-SA. The
anthology PDFs are not redistributable — they are read locally, passages are
held locally for conditioning, and nothing derived from them should be
published verbatim. `research/corpus.md` has the licensing map for the wider set.
