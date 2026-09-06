---
name: fogbelt
description: Drive the Fog Belt pipeline: extract passages and themes from the corpus, report status, start a generation draw under a setting or unrestricted, work the gate, read a brief, check a brief, work gate 1, draft a story and work gate 2. Use when asked to extract, draft themes, seed or generate premises, run the pipeline, check or repair a brief, draft or read a story, or read what a draw produced.
---

# fogbelt

Everything goes through the `fogbelt` command at the repo root. This session
never generates in its own context: every model step is a headless subprocess
the pipeline spawns, so that no candidate is read before the others exist. Run
the command, read what it prints, report it.

The specs are `docs/specs/2026-09-04-ideation-pipeline.md` (to a brief) and
`docs/specs/2026-09-05-drafting-pipeline.md` (check, repair, draft). The bank a session
may read directly is `bank/examples/*.md` (verbatim passages by source) and
`bank/themes.md`; both hold only what is eligible (not passed, not flagged).

## Commands

```
./fogbelt extract [--only ID ...]     read -> segment -> facets, inherit verdicts, export bank/
./fogbelt themes [--only SRC] [--limit N]   draft themes for stories not yet drafted
./fogbelt status                      pool, bank, eligibility per source, draws by status
./fogbelt draw [--setting ID [--domains a,b]] [--genre horror|scifi] [--auto] [--source SRC] [--author A] [--seed "text" | --seed-id ID]
./fogbelt setting lint <id>            check a setting file; one finding per line, exit 1
./fogbelt distill <id> [--domain SLUG] fill a setting's empty or redraft-marked sections from its reference/
./fogbelt gate <draw> choose <execute-step> | redraw | keep-seed | flag [--note "..."]
./fogbelt draws                        list draws
./fogbelt draw-show <draw>              steps and artifacts
./fogbelt brief <draw>                print the brief
./fogbelt check <draw> [--checks a,b] [--samples N]   run the checkers over a brief; stops at gate 1
./fogbelt findings <draw> [--examined] the latest check's findings, ordered by recurrence then by what they invalidate
./fogbelt gate <draw> accept <finding>... | dismiss <finding> [--note "..."] | hold | pass | flag [--note "..."]
./fogbelt draft <draw> [--auto] [--profile P] [--words N] [--beats N] [--tense T] [--person P] [--chronology C] [--container C] [--order sequential|parallel]
./fogbelt story <draw>                the draft with its screen flags inline
./fogbelt gate <draw> keep | rewrite <k> [--finding ID] | pass
./fogbelt verdict <example|theme|brief|story> <id> <keep|pass> [--artifact] [--note "..."]
                                      a passed story hides every passage of it
./fogbelt serve [--port 3002]         the review UI and draw viewer
```

Extraction with no `--only` reads the dev subset from `sources/manifest.toml`.
Source ids are the manifest's table names (`scp`, `datlow-01`, `evenson-contagion`, ...).

## Settings

A setting is `sources/settings/<id>.md`: five setting-wide sections (Matrix,
Hard rules, Do not build, Open ground, Jobs) and under `## Domains` any number
of domains, each with Frame, Mechanisms, Roles, Institutions, Instruments,
Clocks, Places, Vocabulary and Sources. A draw picks `draw` domains (front
matter, default 2) and each stage loads only its slice, hard rules last.
`sources/settings/<id>/reference/` holds the imported lore; it never enters a
draw prompt. Chris writes headings, Frames and Sources; `distill` fills the
rest from the reference files and `lint` runs before any draw or distill. The
spec is `docs/specs/2026-09-05-typed-settings.md`.

## A draw

1. `./fogbelt draw --genre horror` draws six examples and a seed and produces
   five premises, each executed as a 400-word vignette, then stops at the gate
   and prints the five candidates sorted by stated probability.
2. Chris chooses at the gate, in the UI or with `fogbelt gate <draw> choose <step>`.
   `--auto` skips the gate by taking the lowest stated probability. No model
   ever judges.
3. The draw derives an outline, names two vignette jobs, writes two context
   vignettes and an ending in parallel, and exports `briefs/<draw>/`.

A draw that fails with reason `shape` on the premise call is flagged: the call
was shaped wrong, not the seed or the examples. `refusal` means the model's safeguard refused;
the pipeline already retried once on the fallback model.

## Checking and drafting

1. `./fogbelt check <draw>` on a finished brief runs the checkers (derivation,
   ledger, structure, resemblance; claims only when the setting's front matter
   declares `claims: world | reference`), each several times, and reports the
   findings that recur, merged across checkers, ordered by recurrence then by
   the outline section they invalidate. The draw waits at gate 1.
2. Chris accepts or dismisses findings by id. `accept` repairs the brief into a
   new draw (`repaired_from`), re-checks it, and reports again. `dismiss` is
   remembered; a re-check does not raise the finding. `pass` passes the brief.
3. `./fogbelt draft <draw>` derives the schedule under `app/pipeline/draft.toml`
   and the flags, writes one scene per beat, screens every scene, and waits at
   gate 2. `--auto` works gate 1 by the mechanical rule (accept what recurs in
   every sample with evidence, dismiss the rest) and stops at gate 2.
4. `./fogbelt story <draw>` prints the draft with its flags. `gate keep`
   exports `drafts/<draw>/`; `gate rewrite <k>` regenerates one scene under the
   flag's replacement and re-screens it and the next.

No model decides anything: every finding carries a quote, every flag a
location. The session does not accept or dismiss findings on Chris's behalf.

## Rules for the session

- Do not write premises, vignettes or themes yourself. Start a draw.
- Do not read a candidate to the user before the draw has produced all five.
- Do not put anything from `stories/` into a prompt or a filter.
- Report what a command printed. If it failed, show the error.
- Do not accept, dismiss, keep or pass at either gate unless Chris said to.
