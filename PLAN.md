# PLAN — what is left

*Working document. Much of what this file described was built and then
deliberately removed on 2026-09-03: the decision layer, the reviewers, the
settings, and the playbook. What follows is trimmed to what is still true.
`git log` is the record of the rest.*

---

## Removed, to be re-added later

The cull. Keep, pass and maybe, the append-only trail, the terminal reviewer
(triage / compare / ledger) and the browser one, and `pipeline export`. Both
banks are pools as they stand. Passage ids are content-derived, so verdicts
recorded later still attach to the same passages.

## Still to do

### Part 3 — validate, then prune

Blocked on the decision layer coming back, and then on ~200 verdicts:

1. Which facet, if any, predicts a keep? Test it. Split by `method` first —
   different review modes are not the same evidence and the trail should say
   which produced each row.
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

---

## Still open, and needing a human

- **`seeding-v7.md` refers seven times to `playbook-v2.md`, which never existed
  in this repo.** `playbook.md` itself has now been retired too, so the
  references point at nothing twice over. Its §-numbered citations never
  matched playbook.md's sections either — the comparison is in
  `git show 014d679:PLAN.md`. Needs a human decision: repoint, rewrite, or cut.

- The Chiang *Exhalation* and adjacent-Watts analysis was deleted with the
  annexes on 2026-09-03 and has no replacement in `sources/texts/`. Recoverable
  from git history if wanted.
- The PDFs are tracked in git (96 MB, largest 19 MB). Fine for GitHub's limits,
  permanent once pushed. Check repo visibility before `git push`.
