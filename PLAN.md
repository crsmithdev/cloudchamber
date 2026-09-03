# PLAN — what is left after the Biber re-base

*Working document. Written 2026-09-03, rewritten the same day once Parts 1 and
2 landed. Delete it when Part 3 is done. Rationale and citations are in
`research/tagging.md`; the mechanics are in `pipeline/README.md`.*

---

## Done

**Part 1 — the six failure tags are gone, replaced by Biber's dimensions.**
All six are scored as of 2026-09-03, on the reasoning that the corpus is about
to stop being SCP-only; `research/tagging.md` carries why that overruled its
own recommendation 2. Only D1 and D2 bucket the pool.
`pipeline/biber.py` (two backends, `biberplus` or a local fallback),
`pipeline facets` (fit, persist, score, report, `--extremes`), `signals.py`
stripped of `tag_scores`/`tags`/`THRESHOLD` and the six lexicons,
`register_score` renormalised without the `0.30 * max(tag_scores)` term,
`sample.py` re-based on the 9-cell facet grid with an explicit recorded
`--order-by`, and `bank.py` reporting `kept_by_facet`. `withheld` survives as
a standalone boolean flag.

**Part 2 — culling is cheap.** `review --triage` (40 words, `x` expands),
`review --compare` (five a screen, ties encouraged, recorded as
`method: "compare"` with a `group` id), `review --order cluster`,
`review --themes` (20 a screen, keep by number), and `stats --target N` with
a keep rate per block of 50.

Verified end to end on the 947-passage SCP pool: `python -m pipeline.selftest`
passes under both backends, all 9 cells fill, and all twelve dimension
extremes read as their labels claim.

**`biberplus` is installed** into `~/.local/lib/python3.12/site-packages` and
is the live backend for a bare `python3 -m pipeline`. The spaCy model had to
be installed from its wheel URL — `python -m spacy download` shells out to pip
without `--break-system-packages` and fails on this PEP 668 system.

## Still to do

### Part 3 — validate, then prune

Blocked on verdicts. Once ~200 exist in `extracted/decisions.jsonl`:

1. Which facet, if any, predicts a keep? Test it. Split by `method` first —
   a `compare` keep is a ranking, a `triage` pass is a 40-word rejection, and
   a `manual` verdict is a full read. They are not the same evidence.
2. Refit `register_score` weights against keeps and passes instead of the
   hand-set constants. Everything in it is still asserted.
3. Refit the render order in `sample.py` the same way. `--order-by d1` is a
   default, not a finding.
4. Drop anything that predicts nothing — including the facets, if they don't.

This is the point of the append-only trail. Nothing above is right because it
is well-founded; it is right if it predicts Chris.

### Harvest the PDFs

Never done. Only SCP has ever been harvested, and every number in
`pipeline/README.md` is fitted to 947 SCP passages. When it happens:

- ~~`pdftotext` or `pdfplumber` must be installed.~~ **`pdfplumber` 0.11.10 is
  now installed** in the user site-packages, and `read_pdf.py` runs. A sample
  harvest of one Chiang volume on 2026-09-03 produced clean prose with the page
  furniture stripped.
- **Story splitting is the open problem, not extraction.** That volume yielded
  *two* docs — the whole book plus its story-notes — rather than one per story,
  so `--per-doc 12` caps an entire collection at twelve passages instead of
  twelve per story. Recall across the PDF corpus will be badly short until
  `_split_stories` is looked at.
- **Re-read the D3-D6 table in `pipeline/README.md` afterwards.** Those four
  dimensions were added *for* this harvest. Their numbers there describe 947
  containment documents and are not evidence about fiction.
- **Refit afterwards.** `pipeline facets --refit --extremes 5`. The pool grows
  several-fold and a baseline fitted on documents does not describe fiction.
  `facets` warns when the pool has drifted more than 20% from the fitted `n`,
  but the warning is not the decision.
- Re-read the extremes. They are how the last two stripper bugs were found.

### Done instead: `pipeline serve`

Built 2026-09-03. The funnel — Ledger over the themes, Deck over all 947
passages, Bench over the survivors — in a browser on localhost, standard
library only. `pipeline/README.md` §The funnel has the detail. The reason it
is a browser and not a TUI: register cannot be judged in a monospace column,
and the passages had to be set as prose.

Still open from the mockups: **Slate**, forced choice over five at a time. It
answers "which of these is better" rather than "is this good", and it yields
ranking data. Worth building once there are verdicts to check its rankings
against — which makes it a Part 3 question, not a now question.

A phone reviewer is still unbuilt. `serve` binds loopback-only; putting it on
a phone means either exposing the port or the published-artifact route.

---

## Environment gotchas that will waste time otherwise

- **`biberplus` is installed here but will not be everywhere.** The adapter
  falls back and says which backend is live on every `facets` run. Over the
  SCP pool the two agree at r = 0.96 on D1 down to r = 0.68 on D5; the table
  is in `pipeline/README.md`. **The two are not interchangeable within one
  corpus**: `facet-stats.json` records the backend and `facets` refits rather
  than mixing them.
- **An import is not proof biberplus works.** It installs cleanly without its
  spaCy model and then raises on the first passage. `biber.probe()` runs one
  and downgrades once, loudly.
- **`biberplus` 0.4.0's `calculate_tag_frequencies` is broken under numpy 2**
  (`np.array_split` over a DataFrame returns bare arrays; the function
  swallows the error and returns `None`). `biber.py` counts the per-token tags
  from `tag_text` itself and does not call it.
- **Python on the Cowork VM is 3.10** — no `tomllib`, so `sources.toml` is
  ignored and `pipeline/sources.py` DEFAULTS are used instead. It prints a
  warning. Keep the two in sync or install `tomli`.
- **Google Drive sync leaves a zero-byte `.git/index.lock`** that blocks every
  git command. Safe to `rm` when no git process is running.
- Cull decisions are append-only. **Never rewrite `extracted/decisions.jsonl`.**

---

## Still open, and needing a human

- **`seeding-v7.md` refers seven times to `playbook-v2.md`, which does not
  exist** in the repo or anywhere in git history. PLAN.md previously recorded
  that its section references "map exactly onto `playbook.md`'s sections".
  **They do not.** Checked one by one:

  | seeding-v7 says | `playbook.md` has | verdict |
  | :-- | :-- | :-- |
  | enter at §2 | §2 Theme bank | plausible |
  | §1 sourcing, "collision (§1.2), the found armature (§1.4)" | §1 Ideation, numbered steps 1–12, no §1.2/§1.4 | no |
  | §3.6 "the marvel budget" | §3.6 Legibility without lawfulness | no |
  | §5 "the person", §5.3 "exposure is positional" | §5 The setting-a, §5.3 land and title | no |
  | §6 "shape and ending" | §6 Telling it, §6.7 Endings | close |
  | §6.7 "the container" | §6.7 Endings (container is §6.3, register §6.6) | no |
  | §8.3, §8.4 | no §8 at all | no |

  `catalogue.md` is not the referent either: it has §1–§6 and no §8. And
  seeding-v7 describes `playbook-v2.md` as "composed entirely of kill tests"
  with a "stated default is discard", which contradicts `playbook.md`'s own
  header ("Nothing here evaluates"). The likeliest reading is that
  `playbook-v2.md` was a real, differently-structured document that was never
  committed — but that is a guess, and the fix (repoint, rewrite, or restore)
  is Chris's call.
- The Chiang *Exhalation* and adjacent-Watts analysis was deleted with the
  annexes on 2026-09-03 and has no replacement in `sources/texts/`. Recoverable
  from git history if wanted.
- The PDFs are tracked in git (96 MB, largest 19 MB). Fine for GitHub's limits,
  permanent once pushed. Check repo visibility before `git push`.
