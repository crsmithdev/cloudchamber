# pipeline — seeding machinery

Two extractions, one bank each, one decision trail each.

**Passages** are verbatim prose, 150–400 words, harvested from original
sources in `refs/`. They condition *how a story reads*. They feed
`seeds/exemplars.jsonl`.

**Themes** are abstractions — a mechanism, what it costs, who it is done to.
They condition *what gets made*. They feed `seeds/themes.jsonl`.

A source declares which of the two it feeds. Not every source feeds both: the
academic literature yields themes only, and the settings (setting-c,
setting-b) yield themes from researched reference material rather than
from source fiction at all.

## Running it

```bash
python -m pipeline harvest              # sources -> passage candidates
python -m pipeline themes               # sources -> theme candidates
python -m pipeline review               # the cull: k / p / m / s / b / q
python -m pipeline stats                # state of both banks
python -m pipeline export               # kept passages -> seeds/exemplars.md
python -m pipeline draw -n 6 -t 2       # a generation packet
python -m pipeline.selftest             # verify the code works after a sync
```

Scope a run with `--only scp datlow`, or a review with `--tag clinical-body`,
`--order random`, `--limit 40`.

For a setting:

```bash
python -m pipeline themes --research setting-c > brief.md
# a Claude session does the reading, writes themes.json
python -m pipeline themes --ingest themes.json --source setting-c
```

## Why the trail matters

`seeds/decisions.jsonl` is append-only and is never rewritten, deduplicated or
pruned. Every keep and every pass is a row, with a timestamp. Two consequences
worth stating plainly:

- **The pool is disposable; the decisions are not.** Delete
  `exemplars.jsonl` and a re-harvest rebuilds it. Delete `decisions.jsonl`
  and the labelled data is gone for good.
- **Passage ids are content-derived**, from source plus normalized text. Change
  the segmentation heuristics, re-harvest, and every passage whose text is
  unchanged keeps its id and its earlier verdict. That is deliberate: it is
  what lets the heuristics be improved without discarding the labels.

Passes are as valuable as keeps. A discriminator trained on keeps alone has no
negatives, and this pool is mostly negatives by design.

## Why generous

The harvester over-produces. Windows overlap, tag thresholds sit low, and a
passage with no tag at all still enters the pool. That is the intended
division of labour: recall is the machine's job, precision is Chris's. A
harvester tuned for precision would be making the taste call, which is the one
call it must not make.

## The six failure tags

From `seeds/README.md`. A tag means "worth an eye on this axis", never
"this is an exemplar of it".

| tag | what it counters |
| :-- | :-- |
| `no-resolution` | an ending that closes the mechanism and leaves the person inside it |
| `warm-mechanism` | warmth as the instrument rather than as relief |
| `document-working` | an artifact doing a job rather than narrating |
| `clinical-body` | physical harm at sentence level in institutional register |
| `scale` | population-scale harm stated without escalation of tone |
| `withheld` | a gap with a floor under it |

`pipeline stats` breaks the kept set down by tag, so the bank can be checked
for coverage rather than accumulating along one axis.

## What is heuristic and what that costs

Everything in `signals.py` is lexical and structural. No model reads anything;
no network call is made. Each signal is a named number you can inspect, which
is why `warm-mechanism` firing on polite prose with no harm in it was findable
and fixable — with an embedding it would have been invisible.

The cost is real and worth naming:

- **`no-resolution` is the weakest tag.** It needs to know a story ended
  badly, and position-plus-vocabulary is a poor proxy. Expect misses.
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

1. **Generation** — suppress ground already mined, so premises stop landing
   near ones already written.
2. **`exemplars.md`** — promote kept passages into the conditioning set as
   taste moves, instead of freezing at the first cull.
3. **The scorer** — fit `register_score` weights against keeps and passes
   rather than the hand-set constants currently in `signals.py`.
4. **The sampler** — `sample.py` is deliberately near-random until there is
   data to steer it with.

## Licensing

SCP material is CC BY-SA 3.0 and carries author, source and licence through to
the bank; anything published from it must too. Watts is CC BY-NC-SA. The
anthology PDFs are not redistributable — they are read locally, passages are
held locally for conditioning, and nothing derived from them should be
published verbatim. `doc/corpus.md` has the licensing map for the wider set.
