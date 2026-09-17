---
name: cloudchamber
description: Drive the Cloud Chamber pipeline: extract passages and themes from the corpus, report status, start a generation draw under a setting or unrestricted, work the gate, read a brief, check a brief, work gate 1, draft a story and work gate 2. Use when asked to extract, draft themes, seed or generate premises, run the pipeline, check or repair a brief, draft or read a story, or read what a draw produced.
---

# cloudchamber

Everything goes through the `cloudchamber` command at the repo root. This session
never generates in its own context: every model step is a headless subprocess
the pipeline spawns, so that no candidate is read before the others exist. Run
the command, read what it prints, report it.

The specs are `docs/specs/2026-09-04-ideation-pipeline.md` (to a brief) and
`docs/specs/2026-09-05-drafting-pipeline.md` (check, repair, draft). The bank a session
may read directly is `bank/examples/*.md` (verbatim passages by source) and
`bank/themes.md`; both hold only what is eligible (not passed, not flagged).

## Commands

`./cloudchamber help` prints the full grammar and every tunable value, live.
`docs/knobs.md` holds the same values. The commands a session uses:

```
./cloudchamber extract [--only ID ...]     read -> segment -> facets, inherit verdicts, export bank/
./cloudchamber themes [--only SRC] [--limit N]   draft themes for stories not yet drafted
./cloudchamber status                      pool, bank, eligibility per source, draws by status
./cloudchamber draw [--setting ID] [--genre G] [--sampling M] [--darkness D] [--auto] [--source S[,S]] [--author A]
                   [--seed "text" | --seed-id ID] [--like DRAW]
./cloudchamber setting lint <id>           check a setting file; one finding per line, exit 1
./cloudchamber setting sources <id>        every kept entry beside the reference file it came from
./cloudchamber distill <id> [--map|--reduce]   build a setting's five lists from its reference/
./cloudchamber gate <draw> choose <execute-step> | fork <execute-step> | flag | archive | unarchive [--note "..."]
./cloudchamber draws [--archived]          list draws
./cloudchamber draw-show <draw>            steps and artifacts
./cloudchamber candidates <draw>           the five candidates in full
./cloudchamber brief <draw>                print the brief
./cloudchamber check <draw> [--checks a,b] [--samples N]   run the checkers over a brief; stops at gate 1
./cloudchamber findings <draw> [--examined] [--all]   the latest check's findings, by score
./cloudchamber gate <draw> accept <finding>... | auto | dismiss <finding> | hold [--note "..."]
./cloudchamber draft <draw> [--auto] [--profile P] [--words N] [--beats N] [--tense T] [--person P] [--chronology C] [--container C] [--order sequential|parallel]
./cloudchamber story <draw>                the draft with its screen flags inline
./cloudchamber gate <draw> keep | patch [<flag>...] | rewrite <k> [--finding ID] [--note "..."]
./cloudchamber verdict <example|theme|brief|story> <id> <keep|pass> [--artifact] [--note "..."]
                                           a passed story hides every passage of it
./cloudchamber serve [--port 3002]         the UI: browse, ideate, check, write
```

Extraction with no `--only` reads the dev subset from `sources/manifest.toml`.
Source ids are the manifest's table names (`scp`, `datlow-01`, `evenson-contagion`, ...).

## Settings

A setting is `sources/settings/<id>.md`: front matter, five lists (Bodies,
Events, Instruments, Places, Terms) and the optional prose sections Matrix and
Jobs. Each stage of a draw loads the lists it needs, each list whole; `LOADING`
in `app/pipeline/settings.ts` is the table. `sources/settings/<id>/reference/` holds the
imported lore; it never enters a draw prompt. `distill` builds the lists from
the reference files in two passes, and `lint` runs before any draw or distill.
Front matter `claims: world` or `claims: setting` turns on the claims checker,
which verifies against the web or against the setting's own lists. The spec is `docs/specs/2026-09-13-four-lists.md`.

## A draw

1. `./cloudchamber draw --genre horror` draws six examples and a seed and produces
   five premises, each executed as a 400-word vignette, then stops at the gate
   and prints the five candidates sorted by stated probability.
2. Chris chooses at the gate, in the UI or with `cloudchamber gate <draw> choose <step>`.
   `fork <step>` develops a second candidate as a separate draw. `--auto` skips
   the gate by taking the lowest stated probability. No model ever judges.
3. The draw derives an outline, names two vignette jobs, writes two context
   vignettes and an ending in parallel, and exports `briefs/<draw>/`.

A draw that fails with reason `shape` on the premise call is flagged: the call
was shaped wrong, not the seed or the examples. `refusal` means the model's safeguard refused;
the pipeline already retried once on the fallback model.

## Checking and drafting

1. `./cloudchamber check <draw>` on a finished brief runs the checkers
   (derivation, ledger, structure, resemblance, and claims when the setting
   declares `claims`), each over the samples `draft.toml` sets, and
   reports the findings by score. The draw waits at gate 1.
2. Chris accepts or dismisses findings by id. `accept` repairs the brief into a
   new draw (`repaired_from`), re-checks it, and reports again. `dismiss` is
   remembered; a re-check does not raise the finding. `auto` repairs round
   after round under `draft.toml` `[repair]` and prints the round table.
3. `./cloudchamber draft <draw>` derives the schedule under `app/pipeline/draft.toml`
   and the ledger, writes one scene per beat, screens every scene, and waits at
   gate 2. `--auto` runs `gate auto` first, dismisses what is still open, and
   stops at gate 2.
4. `./cloudchamber story <draw>` prints the draft with its flags. `gate keep`
   exports `drafts/<draw>/`; `gate patch` applies a flag's own rewrite of its
   span with no model call; `gate rewrite <k>` regenerates one scene under the
   flag's replacement and re-screens it and the next.

`gate archive` takes a draw off the board; there is no pass at either gate.
No model decides anything: every finding carries a quote, every flag a
location. The session does not accept or dismiss findings on Chris's behalf.

## Rules for the session

- Do not write premises, vignettes or themes yourself. Start a draw.
- Do not read a candidate to the user before the draw has produced all five.
- Do not put anything from `stories/` into a prompt or a filter.
- Report what a command printed. If it failed, show the error.
- Do not accept, dismiss, keep, patch or archive at either gate unless Chris said to.
