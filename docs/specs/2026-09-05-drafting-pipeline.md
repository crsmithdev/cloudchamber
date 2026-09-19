# Drafting pipeline: check, repair, schedule, scenes, screens

Successor to `2026-09-04-ideation-pipeline.md`, which ends at a brief. Derived
from the grilled proposal `2026-09-05-drafting-proposal.md` and the sixteen
decisions recorded there on 2026-09-05. Where this file and the proposal
differ, this file wins.

> Amendments, 2026-09-08.
>
> - **REQ 9, Repair.** The new draw row also copies `sampling`.
> - **REQ 28, Schema.** The store is at version 7. Version 5 adds
>   `draws.forked_from`, a second candidate of one draw developed on its own;
>   version 6 adds `draws.sampling`, which is `tail` for every row made before
>   it; version 7 adds `draws.archived_at`; version 8 adds `draws.name` and
>   backfills it with the names the UI had been deriving, so no draw is
>   renamed. All four are plain `ALTER TABLE`s; none touches the verdict
>   replay.

> Amendments, 2026-09-15. Measured over an eight-round repair chain: the
> reported finding count did not fall (10, 8, 9, 10, 10, 9), 80 to 90 per cent
> of each round's findings were spans the previous round had rewritten, and 31
> per cent of all findings sat in the context vignettes, which a repair
> regenerated whether or not a finding touched them.
>
> - **REQ 9 and AC 9, Repair.** A repair now carries over each context vignette
>   and its job line unless an accepted finding's span is inside that vignette,
>   the rule the chosen vignette and the ending already followed. The `jobs`
>   call runs only when at least one context vignette needs rewriting, and a
>   carried-over vignette keeps its original job. A brief whose context
>   artifacts carry no job line regenerates both, as before.
> - **AC 2 and AC 3, Findings.** Every finding carries a `score` from 0 to 10,
>   and findings are ordered by it. Clusters below `keep_if` are reported on
>   request rather than discarded.
> - **AC 8, Gate 1.** Accepting takes a set, so the gate can accept every open
>   finding or every finding at or above a score.
> - **AC 8, Gate 1.** A finding matching a finding already accepted anywhere in
>   the chain, by the cluster rule, is marked as re-opening it: shown in its own
>   section, never accepted by auto, and dismissed with the round it re-opens.
>   Every accepted replacement in the chain reaches every later repair prompt in
>   a `<settled>` block and the trail's `## settled in earlier rounds`. Measured:
>   18 of 62 reported findings over an eight-round chain were defects already
>   accepted, 10 of them scoring 7 or more.
> - **AC 1 and AC 2, The ledger.** The ledger is extracted once per repair
>   chain by a `ledger-extract` stage and pinned: every later round's
>   `check-ledger` is given it and reports findings only, and the repair writes
>   against it too. Accepted replacements amend it in order. It was re-extracted
>   every round, and over an eight-round chain not one line survived from one
>   round to the next and the categories changed wholesale, so each round
>   measured the brief against a standard it had just invented.
> - **AC 2, Score.** `arithmetic` weighs 1, not 3: the debt audit is the story's
>   mechanism and arithmetic is a detail. An arithmetic finding quoting a hedged
>   number ("roughly 1,200 steps") scores no severity at all.
> - **REQ 9 and AC 9, Repair as a patch.** Every finding carries a `<patch>`:
>   the span rewritten to stand in its place word for word, or none when the fix
>   needs more than that span. A repair applies the patches first, as a
>   substitution with no model call, and regenerates a part only when a finding
>   lands in it that has no patch. A patch counts only when every sample of the
>   cluster offered the same one. The step for a patched part records its model
>   as `patched`.
> - **AC 6, Claims.** A claim already verified anywhere in the chain under the
>   same authority is not verified again; the cached verdict is stored against
>   the new pass with `cached_from`. A lore setting's distillate does not change
>   between rounds, and this was one call per extracted claim per round.
> - **One sampling fan-out, 2026-09-17.** `samples(n, run)` in model.ts runs one
>   ask n times side by side and answers in sample order, each result carrying
>   its sample. The check pass and both screens fan out through it. What each
>   does with the results — cluster them, or vote per question — differs and
>   stays with the caller.
> - **The parts of a brief, 2026-09-17.** A stage declares the role it writes —
>   `context` and `repair-context` both write `context` — and
>   `app/pipeline/briefparts.ts` is the only reader and writer of the parts. It
>   answers them by role, holds each role's length band (`RUN.partWords`) and
>   writes a repair's part one way: rewritten from itself or carried over, with
>   the patches that landed and the step it came from. No artifact changed, and
>   a carried part now names the step it came from, contexts included.
> - **Gate 2 and failures, 2026-09-17.** A check, draft or rewrite that throws
>   returns the draw to the gate it stood at, with the reason in `draws.error`
>   (store version 11); it no longer becomes `failed`, which nothing could pick
>   up again. A gate-2 rewrite is recorded on the scene it rewrote, so the
>   trail `keep` exports survives a flag.
> - **AC 1, Samples.** `checks.samples` is 2 and `screens.samples` is 1. The
>   score's recurrence term already separates 2 of 2 from 1 of 2, and four
>   calls a scene was most of gate 2.
> - **AC 10, Repair rounds.** `repair.rounds` defaults to 4. `cloudchamber gate
>   <draw> auto` and `draft --auto` accept every open finding scoring
>   `repair.stop_score` or more that quotes evidence, dismiss the rest with the
>   reason, repair and re-check, and stop on the floor, the round cap, or
>   `repair.patience` rounds without the total open score falling, or
>   `repair.max_calls` model calls spent on the chain. The round
>   with the lowest total is named in an `auto` artifact on the brief the loop
>   stopped on, and is not restored: an earlier round is superseded, and
>   reviving it would put the chain in two places at once.

> Amendments, 2026-09-19. The text below keeps the words it was written
> with; where it and this list disagree, this list is the code.
>
> - **The outline's sections (REQ 2, REQ 9, Findings order, the asks),
>   078b6b7.** The three sections are `departure` (the one thing in the story
>   that is not true of the actual world, and everything derived from it),
>   `particulars` (every name, place, date, duration, count and quantity the
>   prose must not drift from) and `knowledge` (who knows what, from when,
>   what each cannot know, and why the people who could compare do not).
>   `debt audit`, `arithmetic` and `custody` were one story's reverse outline
>   (`stories/25-the-interval.md`, lines 5 and 24) made a rule for every
>   story, and every draw was being asked to be that story. `invalidates` is
>   one of the three or `none`; the findings order is departure, particulars,
>   knowledge, none; the ending is derived from `particulars` and
>   `knowledge`, and a finding without a patch that invalidates either
>   rewrites the ending wherever its span sits. Setting jobs are gone with
>   Matrix and Jobs (see `2026-09-13-four-lists.md`), so the outline has
>   three sections and no more. The ledger's `custody` category is
>   `possession` (who holds what), with no document presumed. The ending
>   ask no longer offers "prose or document form". The scene ask says "The
>   schedule above has settled the story: write within it and add nothing it
>   does not hold", and the material line says "the brief's own vignette for
>   this beat"; "execution" and "a layer below the one that gets told" are
>   gone from every prompt.
> - **One outline (REQ 9, AC 9), 48ab076.** The outline is never re-derived.
>   A repaired draw carries the chain's outline — the root's with every
>   accepted fix appended — as its `repair-outline` step, always `copied`;
>   that is the text the check holds the prose to. Re-deriving it each round
>   wrote lines no author wrote and no checker read.
> - **The ledger binds where the scene is written (REQ 18, 21a, 22),
>   535d934.** `screen-ledger` runs on each scene as it is written, against
>   the ledger and the scene before it, and every flag's own `<patch>` is put
>   into the scene word for word before the next beat reads it, on a
>   `patched` step, with verdict `finding` `keep` by method `draw` and note
>   `patched as written`. On two drafts of one seed the scenes contradicted
>   the ledger they were given about three times a beat, and a later beat
>   inherited the contradiction through the story so far. `gate patch` (REQ
>   21a) is gone: nothing is left for it. Gate 2 is keep | rewrite k, and
>   `rewrite k` binds the new scene, re-binds k+1 against it, then re-runs
>   the structure screen on both. The ledger screen drops what the verify
>   pass drops: a figurative line read as literal fact, loose everyday
>   wording, a hedged line, a detail the scene leaves out. The structure and
>   slop screens still run once all scenes exist.
> - **Listenability, 2026-09-19.** The outline has a fourth section,
>   `arrival`: what arrives, and what it costs one person; the ending is derived
>   from `particulars`, `knowledge` and `arrival`. The `narrated` profile
>   (`structure.template = told`, first person, past, container `told`, 7,000
>   words, `form.ending = open`) asks the schedule for the narrated shape: a
>   cold open on the worst moment, a set piece per beat (`<set_piece>`), an
>   arrival in the flesh, a cost paid in the beat before the last, an
>   aftermath last. Under it every scene carries a `<register>` block (the body
>   before the meaning, speech reported, one thing per sentence, the listener
>   addressed) and each beat the screens flag for register, a body not named
>   or a sentence said before, is rewritten once with the flag as its
>   constraint. The structure screen asks the last beat two more questions,
>   `presence-arrives` and `cost-paid`, flagged when absent, and no longer
>   flags a theme stated on the last beat. `screen-restated` (a695114,
>   2a275c0) flags a sentence an earlier beat already said, deterministic, no
>   patch. `screen-listen` (deterministic) gives the draft and the narrated
>   pool in `evals/reference/` the same measures, sentence length, long
>   sentences, numerals, quotes, the body named, the listener addressed, and
>   the draft's minutes at the pool's pace. `cloudchamber listen <draw>
>   [--beat K]` renders a beat to a wav with the voice bridge's kokoro voice.

## Problem Statement

A draw ends in a brief: a chosen vignette, an outline in three sections plus
any setting jobs, two context vignettes, an ending and a trail. Nothing after
that exists. Chris reads the brief and either writes the story himself or
drops it. Two things are missing.

The brief has not been checked. The simulation found, in every sample of two
independent checkers, that the ending of brief `b6dd` has the director fire
the reliquary while the debt audit says only the assembler can; the two
context vignettes name the twelfth relic differently; a distance is wrong by
a factor of five. A story written from that brief inherits all three, and
checking a 5,000-word story for them is at chance where checking the
2,400-word brief is not.

The story has no way to be written under control. A single call that writes
5,000 words resolves early and coasts, states its theme, and drifts in
register by the second page. The measured fix is a schedule of what the
reader knows and when, and one fresh call per beat, which is a pipeline, not
a prompt. Story length and structure are not fixed by the research and must
be Chris's to set per draft.

## Solution

Six stages after the brief, two gates, both Chris's. No model decides
anything: every model output is a finding with a quote, a derived document,
or prose.

```
brief → check ×K (parallel, S samples each)
      → GATE 1: accept findings | dismiss | hold | flag | draft
      → repair (accepted replacements as constraints) → check again, once → GATE 1
      → schedule (beats, form, withholding)
      → scene ×M (each a fresh call)
      → screen ×M (ledger, structure, slop)
      → GATE 2: keep | patch | rewrite scene k
      → drafts/<draw>/
```

Checking comes first because checks are reliable on short text and a
corrected mechanism costs one outline call on a brief and M scene calls on a
story. Length, beats, form, structure, scene order, sampling and repair
rounds are configuration in `app/pipeline/draft.toml`, overridable per draw,
with the values used written to the trail. `--auto` runs gate 1
mechanically and stops at gate 2.

The slate (a table over kept drafts) and the draw viewer's panes for these
stages are the next landing, not this one.

## User Stories

1. As Chris, I want to run the checkers over a finished brief with one command, so that I see what is wrong with it before anything is written from it.
2. As Chris, I want every finding to quote the brief, name what it contradicts, and point at the outline section that would have to change, so that I can verify it by reading rather than trust it.
3. As Chris, I want findings filtered by recurrence across independent samples rather than by a stated confidence, so that a checker's self-disagreement is what drops a finding.
4. As Chris, I want findings from different checkers that quote the same span shown once, so that derivation and ledger do not show me the same defect twice.
5. As Chris, I want to see what each checker examined even when it reports nothing, so that an empty result is auditable.
6. As Chris, I want the claims checker to verify real-world quantities against the web under a real-world setting and against the setting's reference files under a lore setting, so that a wrong price and a wrong lore fact are caught by the same machinery.
7. As Chris, I want the claims checker off on an unrestricted draw and on any setting that does not declare a claims authority, so that a story invented from nothing is not fact-checked against the world.
8. As Chris, I want to accept or dismiss findings individually at gate 1, so that a repair is driven only by the findings I believe.
9. As Chris, I want a repair to keep my chosen vignette and the ending as material, rewriting either only when a finding lands in it, so that a repair fixes the brief I chose instead of drawing a different one.
10. As Chris, I want the repaired brief re-checked automatically before I see it again, so that the contradictions a repair introduces are caught the same way the originals were.
11. As Chris, I want a repaired brief to be a new brief directory linked to the original, so that both are on disk and the trail says which came from which.
12. As Chris, I want to set the story's length, beat count and per-beat word range, tense, person, chronology, container and scene order per draft, with defaults in a file and named profiles, so that the shape is mine and not a constant.
13. As Chris, I want the schedule to state what the reader knows at the end of each beat and what is still withheld until which beat, so that tension is a document I can read before any prose exists.
14. As Chris, I want each brief vignette absorbed by at most one beat, so that scene prompts do not carry the same material three times.
15. As Chris, I want each scene written by its own fresh call under its beat's word cap, in sequence by default, so that no call sees another's transcript and no scene runs long.
16. As Chris, I want each scene screened against the ledger and the previous scene, and against a fixed list of structural tells, with a quote per flag, so that I read the story with its seams marked.
17. As Chris, I want a deterministic slop screen that counts against the passage pool and never asks a model, so that lexical tells are marked the way a linter marks.
18. As Chris, I want the withheld-revealed screen to flag a stated reveal and not a hint, so that foreshadowing is not reported as a leak.
19. As Chris, I want to keep, pass, or rewrite one scene at gate 2, with the rewritten scene and its successor re-screened, so that a rewrite fixes one seam without regenerating the story.
19a. As Chris, I want to apply a screen flag's own rewrite of its span in place, so that correcting one number does not cost a regenerated scene.
20. As Chris, I want a kept story exported to a tracked directory with its schedule, findings, configuration and trail, so that the draft and how it was made travel together in git.
21. As Chris, I want `--auto` to run gate 1 by a mechanical rule and stop at gate 2, so that a draft can be produced unattended without any model judging.
22. As Chris, I want the models per stage, and the tools a stage may use, declared in the stages file, so that the claims checker alone reaches the web and every other stage stays sealed.
23. As Chris, I want `cloudchamber status` and `cloudchamber draws` to show where every draw is in the new stages, so that I know what is waiting on me.
24. As Chris, I want the slop lexicon and the overused-premise list to be files I edit, so that the screens follow my judgement without a code change.
25. As Chris, I want every findings view to say the checkers ran on the same model family as the generator, so that I do not mistake same-family agreement for independent verification.
26. As Chris, I want every stage to hold the prompt vocabulary rule and a stated output cap, so that Fable's refusal safeguard is not tripped and no call runs to 25,000 tokens.
27. As Chris, I want the tests to run without a model call, so that the suite is fast and deterministic.

## Acceptance Criteria

1. WHEN `cloudchamber check <draw>` runs on a draw in status `done` THE system SHALL create, per enabled checker, `samples` step rows named `check-<checker>` under the draw, run them concurrently, and move the draw to `awaiting_check_gate`. IF the draw is not in `done` or `awaiting_check_gate` THEN THE system SHALL exit 1 naming the current status.
2. WHEN a check pass completes THE system SHALL store one `finding` artifact per reported cluster carrying `checker`, `span`, `statement`, `result`, `evidence`, `invalidates`, `replacement`, the sample numbers it recurred in, and `n`; `cloudchamber findings <draw>` SHALL print them ordered by `n` descending then by `invalidates` rank (debt audit, arithmetic, custody, setting jobs, none).
3. WHEN a checker's S samples produce findings THE system SHALL cluster them by the overlap rule (Implementation Decisions, Recurrence) and report a cluster only when it recurs in at least `keep_if` distinct samples; a finding seen in fewer samples SHALL be stored on the step's `parsed` and not as a `finding` artifact.
4. WHEN two reported clusters from different checkers overlap by the same rule THE system SHALL store one `finding` artifact whose `checkers` field lists both and whose `n` is the greater.
4a. WHEN a check pass has clustered its findings THE system SHALL run one `check-verify` step that reads every finding of the pass, reported and under the bar alike, back against the brief and answers `keep` or `drop` with a reason; a finding whose span is in no vignette and not in the ending SHALL be dropped before that call, with no model call. A dropped finding SHALL be stored with `sub_threshold` and the reason in `dropped`, and SHALL stay `open`, so a person can still act on it. A claims finding SHALL be exempt from the pass.
4b. WHEN the findings of a draw are read THE system SHALL list the findings the gate acts on: those reported, and those already accepted or dismissed. A finding that is open and not reported SHALL be listed only when the reader asks for it (`--all`, `?all=true`), and the view SHALL carry the counts of what it withheld, by reason: dropped by the verify pass, or seen in too few samples. Auto repair SHALL act on reported findings only.
5. WHEN a checker step completes THE system SHALL store its `<examined>` content on the step's `parsed`, and `cloudchamber findings <draw> --examined` SHALL print it per sample.
6. WHEN the draw's setting declares `claims: world` THE system SHALL run `check-claims-extract` once, then one `check-claims-verify` step per extracted claim with `--tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch"`, and a `finding` artifact for each claim whose result is `contradicted`; WHEN the setting declares `claims: reference` THE system SHALL run the verify steps with `--tools ""` and the resolved reference files of the draw's pinned domains in the prompt; WHEN the setting declares `claims: setting` THE system SHALL extract claims about the setting rather than about the actual world, and run the verify steps with `--tools ""` and the setting's whole distillate in the prompt, independent of the domains the draw took. A `supported` or `unverifiable` claim SHALL be stored on the step's `parsed` and not as a `finding`.
7. IF the draw is unrestricted or the setting has no `claims` key THEN THE system SHALL run no `check-claims-*` step and `cloudchamber findings` SHALL print `claims: off (no authority declared)`.
8. WHEN `cloudchamber gate <draw> accept <finding-id>...` runs in `awaiting_check_gate` THE system SHALL append one verdict line per finding with kind `finding`, verdict `keep`, method `gate`, and start repair; WHEN `dismiss <finding-id> [--note]` runs THE system SHALL append kind `finding`, verdict `pass` with the note and start nothing; a re-check SHALL not store a `finding` artifact overlapping a dismissed one by the overlap rule.
9. WHEN repair runs THE system SHALL create a new draw row with `repaired_from` set to the source draw, copying setting, genre, mode, segment, seed, examples and domains; set `superseded_by` on the source and its status to `repaired`; rewrite the chosen vignette from itself only if an accepted finding's span is inside it, else copy it; re-derive the outline with a `<constraints>` block; run jobs and two context vignettes; and rewrite the ending from itself only if an accepted finding's span is inside it or its `invalidates` is `arithmetic` or `custody`, else copy it. The new brief directory's trail SHALL carry `## repaired_from` with the source id and the constraint lines.
10. WHEN repair completes THE system SHALL run the check stage on the new draw without a further command, up to `repair.rounds` automatic rounds, then leave it in `awaiting_check_gate`. A further round SHALL require `cloudchamber gate <draw> accept`.
11. WHEN a repaired brief is written THE system SHALL include `ending.md` and, when the ending was rewritten, `ending.previous.md`.
12. WHEN `cloudchamber gate <draw> hold` runs THE system SHALL change nothing and exit 0; WHEN `flag [--note]` runs THE system SHALL set `flagged` and the note and start nothing.
13. WHEN `cloudchamber draft <draw> [overrides]` runs in `awaiting_check_gate` or `done` THE system SHALL resolve the configuration (defaults, then profile, then flags), store it on the draw as `draft_config` JSON, run `schedule`, then `scene` ×M, then screens, and move the draw to `awaiting_draft_gate`. IF a finding was accepted and repair has not run THEN THE system SHALL exit 1 with `accepted findings pending repair`.
14. WHEN the schedule step completes THE system SHALL store a `schedule` artifact with `form` and one entry per beat (`n`, `words`, `job`, `known`, `withheld` as a list of `{item, until}`, `stakes`, `absorbs`); IF the beat count is outside `beats.min..beats.max`, or any cap is outside `words_min..words_max`, or the caps sum to more than `length.words × (1 + tolerance)` or less than `length.words × (1 − tolerance)`, or any of `chosen`, `context-1`, `context-2`, `ending` appears in more than one beat's `absorbs`, THEN THE system SHALL fail the step `shape` and retry once per the adapter's table.
15. IF `beats.count` is an integer THEN THE schedule prompt SHALL ask for exactly that many beats and the shape check SHALL require it. IF a `[form]` key is not `auto` THEN THE schedule prompt SHALL state it as fixed and the parsed `form` SHALL match it.
16. IF `structure.template` is anything other than `auto` THEN `cloudchamber draft` SHALL exit 1 with `structure mode not built: <value>`.
17. WHEN scenes run under `scenes.order = "sequential"` THE system SHALL run them one at a time, each prompt carrying the six example passages, the outline, the ledger, the schedule, the scenes so far in order, this beat's material when `absorbs` names one, and this beat's entry; WHEN `parallel` THE system SHALL run all M concurrently with no scenes-so-far block. Each `scene` artifact SHALL carry `beat`, `words`, and `warnings` including `over_cap` when the word count exceeds the cap by more than 10%.
18. WHEN all scenes exist THE system SHALL run `screen-ledger` `screens.samples` times per scene and `screen-structure` `screens.structure.samples` times per scene concurrently, apply the same recurrence rule with `screens.keep_if`, and store `finding` artifacts with `invalidates` set to the beat number; the structure screen's answers SHALL be stored as a `profile` artifact per scene.
19. WHEN the structure screen runs on scene k THE prompt SHALL contain only the withheld items whose `until` is greater than k, and on scene M the fifth question SHALL be `resolves-everything` in place of `resolved`.
20. WHEN screens run THE system SHALL run the slop screen once over the joined scenes with no model call and store a `slop` artifact with: hits of the slop lexicon (proper nouns excluded) with counts, the not-X-but-Y rate per 10,000 words against the pool's rate, trigrams occurring three or more times in the draft and zero times in the pool, and per-scene paragraph count, mean paragraph length and single-sentence-paragraph share.
21. WHEN `cloudchamber story <draw>` runs THE system SHALL print the scenes in beat order separated by `* * *`, each screen finding inline after its scene as `[screen-<name> beat k] span → replacement`, and a footer `checked on <model family>; judge and generator share a family`.
21a. WHEN `cloudchamber gate <draw> patch [<flag>...]` runs in `awaiting_draft_gate` THE system SHALL substitute each named open flag's `<patch>` for its `<span>` in the scene of its beat, matching the span loosely on whitespace, store the result as a new `scene` artifact on a `patched` step, record verdict `finding` `keep` for each flag it lands, and make no model call. IF no flag is named THEN THE system SHALL attempt every open flag. IF a flag has no patch, or its span is no longer in the scene, THEN THE system SHALL leave it open and report why.
22. WHEN `cloudchamber gate <draw> rewrite <k> [--finding <id>]` runs in `awaiting_draft_gate` THE system SHALL run one `scene` step for beat k with the named finding's replacement (or all of beat k's reported replacements) in a `<constraints>` block and the kept scenes 1..k−1 as scenes so far, replace scene k, re-run the screens on k and k+1 only, and return to `awaiting_draft_gate`. IF k is the last beat THEN THE system SHALL re-screen k only.
23. WHEN `cloudchamber gate <draw> keep` runs in `awaiting_draft_gate` THE system SHALL append a `draft` verdict `keep`, write `drafts/<draw>/` with `story.md`, `schedule.md`, `findings.md`, `config.toml`, `trail.md`, and set status `drafted`. A brief or draft the operator does not want is archived, not passed; archive is the only way off the board.
24. WHEN `drafts/<draw>/findings.md` is written THE file SHALL contain the latest check pass's reported findings with each one's gate 1 decision (`accepted`, `dismissed: <note>`, or `open`), then the screen findings by beat.
25. WHEN `cloudchamber draft <draw> --auto` runs THE system SHALL run the check stage if none has run, accept every `finding` from derivation, ledger and claims whose `n` equals that checker's sample count and whose `evidence` is not `none`, dismiss the rest with note `auto`, run repair and re-check up to `repair.rounds` times, then schedule, scenes and screens, and stop in `awaiting_draft_gate`. Structure and resemblance findings SHALL never be accepted by the rule.
26. WHEN a stage in `stages.toml` declares `tools` THE adapter SHALL pass `--tools <list> --allowedTools <list>`; otherwise `--tools ""`. The step row SHALL store the tool list in a `tools` column.
27. WHEN `cloudchamber status` runs THE output SHALL count draws in each of `awaiting_check_gate`, `repairing`, `drafting`, `awaiting_draft_gate`, `drafted`, `passed`, `repaired` alongside the existing statuses.
28. WHEN a store at schema version 3 is opened THE system SHALL migrate to version 4: `draws` gains `repaired_from` and `draft_config`, `steps` gains `tools`, and `verdicts.kind` admits `finding` and `draft` by drop, recreate and replay from the log. The Python side SHALL refuse a version-3 store naming the migrating command.
29. WHEN any check, repair, schedule, scene or screen prompt template is scanned THE template SHALL contain none of *reason*, *reasoning*, *think*, *chain of thought*, and SHALL contain a stated word cap.
30. WHEN `bun test` runs THE suite SHALL make no `claude` subprocess call and SHALL cover every criterion above that names an observable output, through the fake model and the CLI or HTTP API.
31. WHEN `cloudchamber findings`, `cloudchamber story` or the draw JSON is rendered THE output SHALL carry the line `checked on <model family>; judge and generator share a family` whenever every check step's model is in the same family as the generation steps' model.

## Implementation Decisions

### Layout

- `app/pipeline/draft.toml`: the configuration defaults. Loaded beside the
  stages file by a `loadDraftConfig(profile?, overrides?)` that merges
  defaults, then the named profile, then flag overrides, and returns the
  resolved object plus the list of keys that were overridden.
- `app/pipeline/check.ts`, `repair.ts`, `schedule.ts`, `scenes.ts`,
  `screens.ts`, `slop.ts`, `drafts.ts`: one module per stage family, each
  taking the `Pipeline` and a draw id, using `Pipeline.invoke` for every
  model call. `slop.ts` makes no model call.
- `app/pipeline/recur.ts`: the clustering and merge rule, one exported
  function used by check and screens.
- `app/pipeline/prompts.ts` gains the templates below. Vocabulary rule
  checked by the existing template test.
- `app/pipeline/slop.txt` and `app/pipeline/premises.md`: the slop lexicon,
  one lowercase word or phrase per line, and the overused-premise list, one
  enumerated line per entry. Both tracked; both Chris's to edit. Seeded at
  implementation from `research/drafting.md` §1.6 and
  `research/literature.md` §4.2 respectively.
- `drafts/`: tracked, parallel to `briefs/`.

### Configuration

```toml
[length]
words = 5000
tolerance = 0.2

[beats]
count = "auto"          # or an integer
min = 5
max = 10
words_min = 400
words_max = 800

[form]
tense = "auto"          # past | present
person = "auto"         # first | second | third
chronology = "auto"     # linear | nonlinear
container = "auto"      # prose | document | interleaved
ending = "brief"        # brief | open

[structure]
template = "auto"       # only auto is built; the key is parsed

[scenes]
order = "sequential"    # sequential | parallel

[checks]
enabled = ["claims", "derivation", "ledger", "structure", "resemblance"]
samples = 3
keep_if = 2
[checks.structure]
samples = 1
[checks.resemblance]
samples = 1

[screens]
enabled = ["ledger", "structure", "slop"]
samples = 3
keep_if = 2
slop_baseline = "pool"
[screens.structure]
samples = 1

[repair]
rounds = 1

[profiles.flash]
length.words = 1500
beats.count = 3

[profiles.novelette]
length.words = 12000
beats.min = 10
beats.max = 18
```

Command line: `cloudchamber draft <draw> [--profile P] [--words N] [--beats N]
[--tense T] [--person P] [--chronology C] [--container C] [--order O]
[--auto]`; `cloudchamber check <draw> [--checks a,b] [--samples N]`. The resolved
configuration is stored on the draw and written to `drafts/<draw>/config.toml`
and to the trail under `## draft config`, with overridden keys marked.

`claims` under a check with `samples` set applies to the extract step only;
verify steps run once per claim.

### Settings

`claims` joins the front-matter keys: `world | reference | setting`, absent
means off. The check stage family gets a loading row whose domain sections
are `["Sources"]` and whose setting sections are none; under `reference` the
claims-verify prompt carries the resolved reference files of the draw's
pinned domains, each in a `<reference name="...">` tag. Under `setting` it
carries `distillate()` instead: every setting-wide section and every domain
with all its typed sections but Sources, in one `<setting>` tag, whatever
domains the draw took. The raw reference tree is too large to send whole
(setting-b 119k words, setting-a 276k, setting-c 259k), so the
distillate is the only setting-wide authority that fits a per-claim call. No
other checker or screen loads any setting section; they check the brief
against itself. A domain's Sources lines resolve through the existing
`referenceFiles` helper.

### Stages

New entries in the stages file, each with `model`, `fallback`, `system` and
optional `tools`:

| stage | model | tools | system prompt |
| :-- | :-- | :-- | :-- |
| check-derivation | fable | | You check a story plan's derivation against its own text. Output only the tags asked for. |
| check-ledger | fable | | You check prose against a ledger of settled facts. Output only the tags asked for. |
| check-structure | fable | | You answer binary questions about a story plan with quotes. Output only the tags asked for. |
| check-resemblance | fable | | You match a story plan against a list. Output only the tags asked for. |
| check-claims-extract | fable | | You extract checkable claims about the actual world from fiction. Output only the tags asked for. |
| check-claims-verify | sonnet | WebSearch,WebFetch under `world`; none under `reference` | You verify one claim against a source. Output only the tag asked for. |
| repair-vignette | fable | | You write prose fiction. Output only the tag asked for. |
| repair-outline | fable | | You derive story structure from prose. Output only the tags asked for. |
| repair-ending | fable | | You write prose fiction. Output only the tag asked for. |
| schedule | fable | | You derive a story's schedule from its plan. Output only the tags asked for. |
| scene | fable | | You write prose fiction. Output only the tag asked for. |
| screen-ledger | fable | | You check prose against a ledger. Output only the tags asked for. |
| screen-structure | fable | | You answer binary questions about a scene with quotes. Output only the tags asked for. |

Fallback is Opus for every row, as today. Repair's jobs and context calls
reuse the existing `jobs` and `context` stages. The `tools` list is passed
as both `--tools` and `--allowedTools`; the `tools` column on the step row
stores it. Every judge runs on Fable against Fable's briefs; the
same-family line is computed from step rows, not hardcoded.

### Recurrence

Tokens are the lowercase `[a-z0-9]+` runs of a string. Overlap of two
strings is `|A ∩ B| / min(|A|, |B|)` over their token sets. A finding joins
the first existing cluster whose first member's span overlaps its span at
0.5 or more, or whose first member's statement overlaps its statement at 0.6
or more; otherwise it starts a cluster. A cluster's `n` is the number of
distinct samples it contains; it is reported when `n ≥ keep_if`. The
cluster's stored fields are its first member's. Cross-checker merge applies
the same test between reported clusters of different checkers, keeping the
first and listing both checkers. Dismissed findings are excluded from a
later check by the same test against the dismissed finding's span and
statement. Order: `n` descending, then `invalidates` in the order debt
audit, arithmetic, custody, any setting job, none.

The verify pass runs after clustering and before anything is shown. It reads
`VERIFY_READINGS` readings of one call and drops a finding when any reading
drops it, keeping that reading's reason: one reading alone kept a borderline
finding about one time in five. What a reader sees is the vignettes and the
ending, so a span found only in the outline is dropped without a call. The
reason stays on the artifact, which is why an under-bar finding is stored at
all; an under-bar finding the pass keeps is not stored and is rebuilt on
demand when `--all` asks for it.

Finding id: `f-` plus the first eight hex characters of the SHA-1 of
`draw id + "|" + checker + "|" + normalised span` (screen findings scope by
draw and beat), so the same defect found on a re-check of the same draw has
the same id, while a repaired brief that keeps a sentence does not inherit
the verdicts recorded against its source.

### Checkers

Every checker prompt opens with the brief block:

```
<seed>…</seed>

<premise>…</premise>

<outline>
…
</outline>

<vignette name="chosen">…</vignette>
<vignette name="context-1">…</vignette>
<vignette name="context-2">…</vignette>
<ending>…</ending>
```

and the finding shape sentence, shared verbatim:

> Each finding goes in a `<finding>` tag containing: `<span>` (a verbatim quote from the brief, under 30 words), `<statement>` (what the span asserts, one sentence), `<result>` (one of: supported | contradicted | unverifiable | contradicts:<a second verbatim quote> | underived), `<evidence>` (the second quote, the sum written out, a URL and quoted line, or none), `<invalidates>` (which outline section would have to change if the finding stands: debt audit | arithmetic | custody | <setting job name> | none), `<replacement>` (one factual sentence in the outline's register that would hold in its place; not dialogue, not a scene).

The asks, verbatim from the simulation except where a decision changed them:

**derivation.** "State the single impossibility the debt audit buys, in an `<impossibility>` tag, one sentence. Then check every assertion in the vignettes and ending against that derivation, and do every sum in the arithmetic section. Report each assertion that does not follow from the one impossibility, and each sum that does not add up. … After the findings, an `<examined>` tag listing each assertion and each sum checked, one per line, whether or not it produced a finding. At most 8 findings. Under 1000 words in total."

**ledger.** "First, extract from the outline every settled fact into a `<ledger>` tag, one per line, each line opening with its category: time (dates, durations, order), detail (names, quantities, appearance), knowledge (who knows what), custody (who holds which document or object), world (rules), perspective. Then check each vignette and the ending against the ledger, and against each other, pairwise. Report each contradiction. … After the findings, an `<examined>` tag naming each pair compared (ledger×chosen, ledger×context-1, chosen×ending, and so on). At most 8 findings. Under 1100 words in total." The `<ledger>` from the first completed sample is stored as a `ledger` artifact and is what schedule, scene and screen prompts carry.

**structure.** "Answer seven questions about the brief, each as present or absent, each with one verbatim quote from the brief that settles it. Output one `<question name="...">` tag per question containing `<answer>present|absent</answer>` and `<quote>...</quote>`." The seven, verbatim: threat, category-violation, agency, obscurity, thickening, spectacle, consequence, with the simulation's one-line definitions. "Output only the seven tags. Under 350 words." Stored as a `profile` artifact; never a `finding`.

**resemblance.** The brief, then the premise list in a `<list>` tag. "Match the brief against the list. For each list entry the brief matches, output a `<match>` tag containing `<entry>` (the list line, verbatim) and `<span>` (the quote from the brief that matches it, under 30 words). Then output one `<nearest>` tag naming the nearest published story, novel or film: `<title>`, `<author>`, and `<shared>` (one sentence stating what the brief shares with it). At most 4 matches. Under 300 words." Stored as a `profile` artifact.

**claims-extract.** Changed from the simulation, which asked loosely and spent ten of twelve claims on existence: "Extract only claims about the actual world that carry a quantity or a rule a published source could confirm or deny: a price, a rate, a count, a date, a duration, a distance, a procedure, a statute, a relation between two named places. That a place, institution, product or person exists is not a claim. Skip everything the story invents. Each claim goes in a `<claim>` tag containing `<span>` (verbatim quote, under 30 words) and `<statement>` (the claim as one checkable sentence). At most 12 claims. Under 500 words."

**claims-verify.** One call per claim. Under `world`: "Claim from a story, quoted: "{span}" As a checkable sentence: {statement} Search for a published source that confirms or denies it. Output a `<finding>` tag containing `<span>` (the quote above, verbatim), `<statement>` (the sentence above), `<result>` (supported | contradicted | unverifiable), `<evidence>` (a URL and one quoted line from it, or none), `<invalidates>` (none), `<replacement>` (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words." Under `reference`: the same with "Search for a published source" replaced by "Find the line in the reference material above", the reference files preceding the claim, and `<evidence>` asking for "the file name and one quoted line from it, or none".

### Gate 1

Actions on a draw in `awaiting_check_gate`:

| action | effect |
| :-- | :-- |
| accept `<finding>`… | verdict `finding` `keep` per id; repair starts |
| dismiss `<finding>` `[--note]` | verdict `finding` `pass` with note; excluded from later checks |
| hold | nothing |
| pass | verdict `brief` `pass`; status `passed` |
| flag `[--note]` | `flagged`, note; nothing runs |
| `cloudchamber draft <draw>` | proceeds to schedule when no accepted finding is unrepaired |

A finding verdict's `target_id` is the finding id; `method` is `gate`, or
`draw` when written by the auto rule with note `auto`.

### Repair

A repair is a new draw. The new row copies setting, genre, mode, segment,
seed fields, `example_ids` and `domains`; `repaired_from` names the source;
the source gets `superseded_by` and status `repaired`. Steps are stages
`repair-vignette` (only when an accepted finding's span lies inside the
chosen vignette by exact substring after whitespace normalisation),
`repair-outline`, `jobs`, `context` ×2, and `repair-ending` (only when an
accepted finding's span lies inside the ending or its `invalidates` is
`arithmetic` or `custody`). A piece that is not rewritten is copied as an
artifact on a step with status `done` and `model` set to `copied`.

The constraints block is the accepted findings' `replacement` lines, one
per line, verbatim, under `<constraints>`. The vignette rewrite: the
examples, then "Below is a {V}-word execution of a story and a set of
constraints that hold. Rewrite it in a `<vignette>` tag so that every line
of the constraints holds, keeping its people, place, form and length.
Under {V + 50} words. Output only the tag." The ending rewrite has the same
shape with the outline above it and the `<ending>` tag. The outline
re-derivation is the existing outline ask with the `<constraints>` block
after the vignette and the sentence "and a set of constraints that hold"
added to its opening line. Nothing is ever regenerated from the premise.

After the new brief directory is written, the check stage runs on the new
draw. Rounds: `repair.rounds` automatic repair-and-check cycles, then
`awaiting_check_gate`.

### Schedule

One `schedule` step. Prompt: the brief block, then

```
<config>
target length: {words} words
beats: between {min} and {max}, each between {words_min} and {words_max} words, caps summing to about {words}
form: derive tense, person, chronology and container from the brief and state them
ending: the brief's ending is the last beat, in place
</config>
```

with `beats: exactly {count}` when `count` is an integer, each fixed form
axis stated as `tense: past` in place of the derive line, and `ending: the
schedule may derive the ending` under `open`. Then, verbatim:

> Derive the story's schedule: the layer between the outline and the prose, which settles what the reader knows at each point and what is still withheld. Output a `<form>` tag with four lines: tense, person, chronology, container. Then one `<beat n="K" words="N">` tag per beat containing `<job>` (one sentence, what the beat does and where it is set), `<known>` (what the reader knows by its end, one or two sentences), `<withheld>` (each thing still withheld after this beat, with the beat number that reveals it, one per line as `item — beat N`), `<stakes>` (one sentence), `<absorbs>` (chosen | context-1 | context-2 | ending | none: the brief vignette this beat takes its material from, if any; each may be named by at most one beat). Output only the tags. Under 1000 words.

Shape checks in criterion 14; `withheld` lines that do not parse to an
`until` beat number fail `shape`.

### Scenes

One `scene` step per beat. Prompt order: the six example passages verbatim
with no framing, the outline in `<outline>`, the ledger in `<ledger>`, the
full schedule in `<schedule>`, under sequential order the kept scenes so far
in `<story-so-far>`, the absorbed vignette if any in `<material>` followed
by "The material above is the brief's own execution of this beat; use it as
far as it serves the schedule, rewritten to sit in the story.", then
verbatim:

> Write beat {n} of the story, in a `<scene>` tag. Its job: {job} By its end the reader knows: {known} Still withheld after it: {withheld, joined by "; "} Form: {form, joined by "; "}. Under {cap} words. It is an execution, not discovery: the schedule above has settled the story. Output only the tag.

A gate 2 rewrite adds a `<constraints>` block before the ask and the
sentence "Every line of the constraints holds." to it. The scene prompt
carries no instruction about theme statement (Q13).

### Screens

**ledger.** Per scene k, `<ledger>`, `<previous-scene>` when k > 1, `<scene n="k">`, then verbatim:

> Check the scene against the ledger and against the previous scene. Report each contradiction in a `<finding>` tag containing `<span>` (verbatim quote from the scene, under 30 words), `<statement>` (one sentence), `<result>` (contradicts:<verbatim quote of the ledger line or previous-scene span>), `<invalidates>` (the beat number, or none), `<replacement>` (one positive sentence that would hold). Then an `<examined>` tag naming what was compared. At most 6 findings. Under 500 words.

**structure.** Per scene k, a `<beat n="k">` block with `job:` and
`withheld after this beat:` listing only items with `until > k`, then
`<scene n="k">`, then:

> Answer five questions about the scene, each as present or absent, each with one verbatim quote that settles it. Output one `<question name="...">` tag per question containing `<answer>present|absent</answer>` and `<quote>...</quote>`.
>
> theme-stated: the narrator or a character states what the story means or what its lesson is.
> bodily-emotion: an emotion is conveyed as a bodily sensation (a tightening chest, a cold stomach, breath catching).
> withheld-revealed: an item listed as withheld after this beat is stated in the scene as a fact the reader now knows. Implication and foreshadowing are not reveals; the quote must contain the statement.
> protagonist-never-wrong: the point-of-view character is not allowed to be mistaken, unfair or at fault anywhere in the scene.
> resolved: the scene settles a question the schedule keeps open for a later beat.
>
> Output only the five tags. Under 250 words.

On scene M the fifth line is "resolves-everything: no question the story
raised is left open at the end of the scene." The question list is fixed;
no key configures it. Answers are stored as a `profile` artifact per scene;
a `present` answer on `theme-stated`, `withheld-revealed`,
`protagonist-never-wrong`, `resolved` or `resolves-everything`, or an
`absent` on `bodily-emotion`, is also a screen flag shown by `cloudchamber story`
with its quote.

**slop.** No model. Baseline: the eligible passage pool from the store. Four
measures, all stored, none summed: lexicon hits with per-word counts, where
a word is excluded when it appears capitalised in the draft more often than
not; the not-X-but-Y rate per 10,000 words in the draft and in the pool,
matched by the simulation's regular expression; trigrams with count ≥ 3 in
the draft and 0 in the pool; per scene, paragraph count, mean paragraph
words and the share of single-sentence paragraphs. The word-ratio measure
the simulation tried is not built.

### Gate 2

| action | effect |
| :-- | :-- |
| keep | verdict `draft` `keep`; export; status `drafted` |
| patch `[<flag>...]` | substitute each flag's `<patch>` into its scene; verdict `finding` `keep`; no model call |
| rewrite `<k>` `[--finding <id>]` | one `scene` step under constraints; screens on k and k+1; back to the gate |
| pass | verdict `draft` `pass`; status `passed` |

A ledger screen emits a `<patch>`: the flagged span rewritten in the scene's
own voice, short enough to stand in its place word for word, or `none` when
the fix needs more than that span. `patch` applies those substitutions and
settles the flags it lands, and reports the rest for `rewrite`. It exists
because `rewrite` was the only way to act on a flag: correcting one number
cost a regenerated scene and two re-screens, so in practice nobody paid it and
correct flags stood in kept stories. Measured on draw `20260915211209-c264`,
where the beat-4 screen supplied the right figure and the wrong one shipped.

A patched scene is stored as a new `scene` artifact on a step with model
`patched`, so it does not count against `repair.max_calls` and the trail shows
which flags landed.

### Auto mode

`--auto` on `cloudchamber draft`: run check if the draw has no check pass; for
each reported cluster from derivation, ledger and claims, accept when `n`
equals that checker's configured samples and `evidence` is not `none`,
otherwise dismiss with note `auto`; run repair and re-check `repair.rounds`
times; then schedule, scenes, screens; stop at `awaiting_draft_gate`.
Structure and resemblance produce profiles, never accepted. The ending rule
applies as at a hand gate. Verdicts carry method `draw`.

### Store

- `draws`: new statuses `checking`, `awaiting_check_gate`, `repairing`,
  `drafting`, `awaiting_draft_gate`, `drafted`, `passed`, `repaired`
  (`checking` is transient, as `running` is); new columns
  `repaired_from TEXT REFERENCES draws(id)` and `draft_config TEXT`.
- `steps`: new column `tools TEXT NOT NULL DEFAULT ''`; new stage names as
  in the stages table.
- `artifacts.kind`: adds `finding`, `ledger`, `profile`, `schedule`,
  `scene`, `slop`, `claim`. `meta` carries the finding fields, the beat
  number, the sample list, warnings.
- `verdicts.kind`: adds `finding` and `draft`. Log line unchanged in shape.
- Schema version 4. Migration: `ALTER TABLE` for the three columns; the
  verdicts table dropped, recreated and replayed. Python mirror bumped.

### Export

`drafts/<draw>/`: `story.md` (scenes in order, `* * *` between), `schedule.md`
(form, then one section per beat with its fields), `findings.md` (criterion
24), `config.toml` (the resolved configuration, overridden keys commented),
`trail.md` (the brief's trail plus `## draft` listing config, models per
stage, scene word counts, screen flag counts, gate 2 actions). Written on
`keep` only.

### CLI and skill

`cloudchamber check <draw>`, `cloudchamber findings <draw> [--examined]`, `cloudchamber gate
<draw> accept|dismiss|hold|pass|flag|keep|rewrite …` (dispatched on the
draw's status; the existing `choose|redraw|keep-seed` remain for
`awaiting_gate`), `cloudchamber draft <draw> [overrides] [--auto]`, `cloudchamber story
<draw>`. The HTTP API gains the same actions under the draw routes and a
`GET /api/draws/:id/findings`. The skill file lists the commands and the
sequence: check, read findings, gate, draft, read story, gate.

### Rejected alternatives

- A stated confidence per finding, or a severity: noise per the evaluation
  literature; recurrence and the `invalidates` pointer instead.
- Regenerating the chosen vignette or the ending from the premise on repair:
  re-cast the story in the simulation.
- Regenerating the ending on every repair: a different ending each time,
  against a fixed last beat.
- A cascade rewrite at gate 2: discards read prose; one scene and a re-screen
  of its successor instead.
- `keep_if` as the auto-accept bar: for showing, not acting; all samples.
- A mechanical gate 2: no rule the evidence supports.
- A front-matter domain allowlist, or reference-first-then-web: authority
  is one thing per setting; the web under `world`, the docs under
  `reference`.
- A configurable structure-screen question list: nothing argues for it yet.
- A negated instruction against theme statement, or a positive one now:
  salience, and unmeasured.
- Committing the simulation scripts: their value is the wording above.
- Word-ratio slop against the pool: ranked proper nouns and subject nouns.

## Testing Decisions

Two seams, no test calls a real model: the fake model adapter and the CLI or
HTTP API, as in the ideation spec. Fixture files under the pipeline tests
hold canned responses per stage, including three samples of one ledger
checker with two findings that recur across all three, one that recurs in
two, and one that appears once; a derivation sample whose top finding
overlaps the ledger's; a claims extraction with two claims and verify
responses of `supported` and `contradicted`; a schedule with eight beats
whose caps sum to the target; a schedule that names the chosen vignette in
two beats; eight scenes, one over its cap; ledger and structure screen
responses; and a refusal.

Assertions on the step tree, artifacts, verdict log lines, draw status,
`drafts/<draw>/` contents and CLI output: the recurrence filter reports
exactly the recurring findings and orders them; the cross-checker merge
yields one artifact; a dismissed finding does not reappear on re-check;
accept creates a linked draw with `repaired_from`, copies the vignette when
no finding lands in it and rewrites it when one does, applies the ending
rule in both directions, and runs the re-check; the bad schedule fails
`shape` and the retry succeeds; sequential scenes carry the previous scenes
and parallel ones do not; the over-cap scene carries `over_cap`; the
structure screen prompt for beat 5 contains only items with `until > 5` and
the last scene's prompt asks `resolves-everything`; the slop screen on a
fixture text with a planted lexicon word, a planted not-X-but-Y and a
planted repeated trigram reports each, run as a pure function against a
fixture pool; `--auto` accepts the 3/3 findings with evidence and dismisses
the rest with note `auto`; a rewrite at gate 2 replaces scene k, re-screens
k and k+1 only, and leaves the rest of the tree untouched; keep writes the
five export files and the `draft` verdict; a version-3 store migrates and
replays; every new template passes the vocabulary check and states a cap;
the same-family line appears when the fake model reports one family.

Prior art: the draw tests and API tests in the pipeline and server
directories, which already drive a manual draw to `awaiting_gate` and
through the gate with a fake model.

Verification for every change: the relevant seam's tests run after the last
edit, from inside the worktree, and the turn reports what ran.

## Out of Scope

- The slate table and embedding dispersion (Q14; revisit at three kept drafts).
- Draw viewer panes for findings, schedule, scene tree and gate 2 (Q15; the
  next landing, after the stages have run on a real brief).
- Structure modes `template` and `from:<story-id>` (Q11).
- Parallel scenes as the default; per-checker sample counts other than the
  defaults; retired concepts anywhere; a reference-first pass under `world`;
  any instruction to the scene call about theme; a configurable screen
  question list. All on the proposal's revisit list.
- Cross-family judging. Waits on the API path.
- A polish pass, a line edit, or any call that reads the whole story.
- Any score, rank or tier on a story.
- Keeping the simulated story or scripts (Q16).

## Open Questions

- **Slop lexicon and premise list contents.** The files exist and are
  Chris's; their first contents are seeded at implementation from the
  research's lists and are not specified here. Unblocked by writing them.
- **Reference file size under `claims: reference`.** Two pinned domains at
  up to about 2,700 words each fit a prompt; a setting with larger reference
  files or more pinned domains may not. No cap is set; the distill stage's
  60,000-word refusal is the precedent if one is needed.
- **A draft without a check.** `cloudchamber draft` on a draw in `done` has no
  ledger for the scene and screen prompts, so it runs one ledger extraction
  (a single `check-ledger` step storing only the ledger) before the schedule.
  Whether that should instead force a full check is open; the spec lets the
  draft proceed.
- **`ending = "open"`.** Parsed and passed to the schedule prompt; whether
  the schedule's derived ending then replaces the brief's ending as
  material is not decided, since `brief` is the default and the only mode
  simulated. Unblocked by a run under `open`.

## Further Notes

- Measured on brief `b6dd`, 2026-09-05, at these defaults with single-sample
  screens: about sixty calls and fifteen minutes; derivation and ledger
  checks 65–85 s, structure 9–13 s, resemblance 23–31 s, claims verify on
  Sonnet 12–17 s with a URL every time, schedule 80 s, scenes 26–37 s each.
  With screens at three samples, about thirty more calls, in parallel.
- The simulation's scene 5 structure screen already carried the filtered
  withheld list and flagged a hint at beat 6's item; that is why the
  `withheld-revealed` definition above says stated, not implied.
- The proposal's Revisit table is the list of things decided against here
  and the trigger for looking again at each.

### Amendment 2026-09-19 (evening): the signal template

A second shaped template, `signal`, for the long narrated channels whose
stories follow one specialist close, in the third person, with an
ensemble, a mission and a return (Void Signal). `[profiles.signal]` in
`draft.toml`: 10,000 words, 10 to 14 beats of at most 1,100, third past,
linear, prose, open ending, `structure.template = "signal"`. The schedule
ask carries `scheduleSignal`: the noticing at an odd hour, the ensemble
named by role with one habit each, the one who says go today, a contact
in the flesh that does not answer, a split decision with every side
defensible, the cost paid by a named person in the beat before last, and
a return where an official asks for a clean ending and does not get one.
Every scene carries the `sceneSignal` register: the feeling named as it is
felt, quoted plain speech, the exact number and hour, one thing per
sentence. The register rewrites run under any shaped template, not only
`told`; the scene prompt takes the template as a parameter, since a prose
container carries no register of its own.
