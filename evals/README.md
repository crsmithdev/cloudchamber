# evals — reference material

*The judge harness was removed on 2026-09-02. What it graded — playbook
variants, by pairwise comparison of premises — is not what the pipeline needs,
and the labelled data the pipeline produces is a better instrument than the
degradation set was. `build.py`, `score.py`, `prompts/`, `runs/`, `corpus/`
and `RESULTS-2026-08-31.md` are in Drive trash if any of it is wanted back.*

Two documents survive, because both are reference rather than machinery.

## `LITERATURE.md`

Academic and critical work on what makes horror land. This is the material the
theme extractor reads and the only source configured for **themes only, never
passages** — criticism conditions for criticism, so nothing here should ever
reach `seeds/exemplars.jsonl`. `sources.toml` enforces that with
`passages = false`.

## `CORPUS.md`

Award-attested horror and SF-horror short fiction that is free and legal to
read online, with the licensing map. Compiled 2026-09-01.

It stays out of `refs/` deliberately. The annexes under `refs/` are material
the pipeline draws *from*. This is material to test *against*, and nothing in
it should be distilled into a playbook section or harvested into the exemplar
bank — a generator conditioned on the test set is not being tested.

The three constraints in it still govern any use:

- **Most of it is link-only.** Nightmare and Lightspeed carry explicit
  anti-scraping policies; Clarkesworld's robots.txt disallows fetching.
  Free to read, not free to copy.
- **The copyable set is narrow** — Watts (CC BY-NC-SA), SCP (CC BY-SA),
  Small Beer Press, and the public-domain core.
- **The register this project cares about is the least available.** The quiet,
  Aickman-descended end is print-only with no free workaround.

## What replaced the harness

`seeds/decisions.jsonl`. Every keep and every pass Chris records while culling
the exemplar pool, append-only, with timestamps. That is real labelled data
about this project's taste, accumulated as a by-product of work that has to
happen anyway — as opposed to a degradation set, which measured whether a judge
could detect damage that was inserted on purpose.

Nothing consumes the decisions yet. `pipeline/README.md` says where the
feedback edges are meant to attach.
