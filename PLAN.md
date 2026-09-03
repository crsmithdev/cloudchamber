# PLAN — re-base tagging on Biber, and make culling cheap

*Working document. Written 2026-09-03 to hand off to a Claude Code session.
Delete it when the work is done. Rationale and citations are in
`research/tagging.md`; this is only what to build.*

---

## Where things stand

Committed and verified on lightbox2 (nothing pushed — `git push` is manual):

- `pipeline/` harvests passages and themes locally. `python -m pipeline.selftest`
  passes. Harvest gives **944 passages from 103/109 SCP articles**; themes 432.
- The PDFs have **never been harvested**. Only SCP has. Everything below about
  dimensions is fitted to documents, not fiction, and must be re-checked once
  `pipeline harvest` runs over `sources/texts/books/`.
- `extracted/decisions.jsonl` **does not exist yet**. No real cull has happened.
  That is the good case: nothing has been labelled under the old tags.

### Environment gotchas that will waste time otherwise

- **`biberplus` is installed on Windows, not in the Cowork Linux VM.** A Claude
  session reaching the machine through `device_bash` gets a *different*
  interpreter than the one Chris runs. Write the biber layer as an adapter:
  use `biberplus` if importable, else the local fallback. Do not assume either.
- **Python on the VM is 3.10** — no `tomllib`, so `sources.toml` is ignored and
  `pipeline/sources.py` DEFAULTS are used instead. It prints a warning. Keep
  the two in sync or install `tomli`.
- **Google Drive sync leaves a zero-byte `.git/index.lock`** that blocks every
  git command. Safe to `rm` when no git process is running.
- Cull decisions are append-only. **Never rewrite `extracted/decisions.jsonl`.**

---

## Part 1 — replace the six failure tags

The six (`no-resolution`, `warm-mechanism`, `document-working`,
`clinical-body`, `scale`, `withheld`) were coined in one session on 2026-09-02
and are grounded in nothing. See `research/tagging.md` §1. Replace them with
Biber dimensions, which are the field standard and which **reproduce in this
corpus** — a PCA over grammatical features gives D1 at 25% of variance.

### 1.1 `pipeline/biber.py` (new)

```
features(text) -> dict          raw counts, normalised per word
dimensions(feats, stats) -> {"d1": z, "d2": z}
```

- Try `import biberplus` and use its feature extractor. On ImportError fall
  back to a local implementation of the D1/D2 features only.
- **D1 Involved vs Informational** — positive: private verbs, contractions,
  present tense, 1st/2nd person pronouns, discourse particles. Negative: nouns,
  prepositions, attributive adjectives, mean word length.
- **D2 Narrative vs Non-narrative** — positive: past tense, 3rd person
  pronouns, perfect aspect, public verbs. Negative: context-dependent
  discourse markers.
- Do **not** implement D3-D6. No evidence they discriminate here, and Biber
  derived them to separate conversation from academic prose — a far wider
  spread than this corpus has.

### 1.2 `pipeline facets` (new command)

Dimension scores are corpus-relative, so they need a second pass over the
whole pool, not a per-passage computation:

1. read every passage in `extracted/exemplars.jsonl`
2. compute raw features, standardise across the pool, project onto D1 and D2
3. write back `facets: {"voice": ..., "mode": ..., "d1": z, "d2": z}`
4. terciles: `voice` = informational | mixed | involved;
   `mode` = non-narrative | mixed | narrative

Persist the corpus mean/sd to `extracted/facet-stats.json` so a later harvest
scores consistently instead of silently re-basing.

### 1.3 `pipeline/signals.py`

- Delete `tag_scores`, `tags`, `THRESHOLD`, and the six lexicons that only
  served them. Keep `withheld` as a single standalone flag — redaction and
  elision are a genuine register move and are cleanly detectable.
- **Remove the `0.30 * max(tag_scores)` term from `register_score`** and
  renormalise the remaining weights. Measured: that term contributes a mean of
  0.119, is the largest positive term for 199 of 1,024 passages, and changing
  it swaps 11 of the top 12. It is an unvalidated taxonomy steering what gets
  read first.
- Keep `concrete`, `variance`, `flatness`, the adverb/intensifier/dialogue
  penalties and the sentence-shape term. Those measure prose, not taxonomy.
- Note: the pool itself does **not** change — selection is bound by the
  overlap-rejection rule in `top_per_doc`, not by score. Only order changes.

### 1.4 `pipeline/sample.py` — two changes

- `_by_coverage` currently buckets by tag. Re-base on the **facet grid**
  (voice x mode, 9 cells). This is "clustering retrieval", an established
  diversity method — the design was right, only the buckets were unfounded.
- **Fix ordering.** The ICL literature reports demonstration order moving
  results "from near-random to state-of-the-art". `sample.py` currently emits
  whatever order the picker produced and does not record it. Make it an
  explicit `--order-by` parameter (default: ascending d1), and record the
  realised order in the packet.

### 1.5 Elsewhere

`review.py` (`--tag` filter, export headers), `bank.py` (`kept_by_tag` ->
`kept_by_facet`), `__main__.py`, `pipeline/README.md`, `extracted/README.md`,
`.claude/skills/seed-premises/SKILL.md`.

### Acceptance

- `python -m pipeline.selftest` passes.
- `pipeline harvest --only scp` still gives ~944 passages over ~103 docs.
- `pipeline facets` fills all 9 cells; report the distribution.
- Spot-check the extremes of D1 and D2 read as the labels claim. **They did
  not last time** — the top of D1 was raw CSS, which is how two stripper bugs
  were found. Always eyeball the extremes.

---

## Part 2 — make culling cheap

The real constraint. 944 passages at 30-60s of careful reading each is 8-15
hours, and the pool grows several-fold once the PDFs are harvested. The
interface is the bottleneck, not the taxonomy.

Ordered by payoff per unit of work:

### 2.1 Triage mode — the big win

`pipeline review --triage`. Show the **first ~40 words only**. Keys: `p` pass,
`x` expand to full text, `k` keep. Most rejects are obvious in one sentence;
paying 400 words to say no is the single largest waste in the current loop.
Expect this alone to remove over half the reading.

Run it as two passes: fast triage over everything, then a careful pass over
survivors only.

### 2.2 Comparative mode

`pipeline review --compare`. Show 5 at a time, pick the best one or two, ties
allowed. Rationale is already in this project's own retired eval README:
*"Forced choice, ties permitted and encouraged. No numeric scales."* People
are faster and more consistent comparing than rating in isolation. ~190
screens instead of 944, and it yields ranking data, which is richer than a
binary.

Record these as `method: "compare"` in the decision rows so they stay
distinguishable from absolute verdicts.

### 2.3 Block by similarity

Add `--order cluster`: consecutive passages from the same facet cell. Holds
calibration steady and kills the context-switching cost of jumping between
registers. Cheap to add once facets exist.

### 2.4 Stop rules, not completion

Do not aim to label 944. Track marginal keep-rate per 50 reviewed and stop
when it flattens, or when every facet cell has enough keeps. `pipeline stats`
should show progress toward a target, not just a count.

### 2.5 Themes need a different shape entirely

432 themes of 1-2 sentences each. One-at-a-time is the wrong interface —
these want a **dense multi-select list, ~20 per screen**, keep-by-number.
Whole set is maybe 30-45 minutes. Do not reuse the passage reviewer.

### 2.6 Optional: a phone reviewer

Terminal review only works at the desk. A published artifact with a database
capability could hold the pool, take verdicts on a phone in spare minutes, and
be read back into `decisions.jsonl` later. Worth it only if the desk sessions
turn out not to happen.

---

## Part 3 — validate, then prune

Once ~200 verdicts exist:

1. Which facet, if any, predicts a keep? Test it.
2. Refit `register_score` weights against keeps and passes instead of the
   hand-set constants.
3. Drop anything that predicts nothing — including the facets, if they don't.

This is the point of the append-only trail. Nothing above is right because it
is well-founded; it is right if it predicts Chris.

---

## Still open

- **`seeding-v7.md` refers six times to `playbook-v2.md`, which does not exist**
  in the repo or anywhere in git history. Its §1/§2/§5/§6 references map
  exactly onto `playbook.md`'s sections, so it is probably a stale name — but
  seeding-v7 describes it as "composed entirely of kill tests", which
  contradicts `playbook.md`'s own header. Needs a human decision.
- The Chiang *Exhalation* and adjacent-Watts analysis was deleted with the
  annexes on 2026-09-03 and has no replacement in `sources/texts/`. Recoverable
  from git history if wanted.
- The PDFs are tracked in git (96 MB, largest 19 MB). Fine for GitHub's limits,
  permanent once pushed. Check repo visibility before `git push`.
