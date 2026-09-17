# Ideation pipeline

> Terminology, 2026-09-05: what this spec calls a *run* is now a *draw*, and a
> *packet* is a *brief*, in the store, the CLI, the API, the skill and the UI.
> The text below keeps the words it was written with.

> Amendments, 2026-09-08. The decisions below stand as they were taken; where
> this list and the text disagree, this list is the code.
>
> - **Sampling (US 21, REQ 21, Prompt order).** The premise ask is one of three
>   modes, not a fixed tail. `tail` is what the text describes — every
>   probability under 0.10, the modal answer excluded, the divergence cue — and
>   is the default; `off-centre` asks for 0.10 to 0.35 inside the tradition the
>   seed belongs to; `standard` asks for over 0.35 and for the conventional
>   treatment, openly. Each mode carries its own band *and* its own register,
>   because the model states the probability itself and the prose is what moves
>   it. A premise outside its mode's band is the `shape` failure REQ 21 names.
>   The mode is `--sampling`, stored on the draw and printed in the trail.
> - **Genre (REQ 19, REQ 21, Open Questions).** Genre never filtered the example
>   pool: a segment is a source or an author, and `--genre` is free text that
>   reaches one line of the premise ask and nothing else. The open question
>   *genre when a segment spans both* is closed the other way: with no genre
>   asked for, the draw records the genre most of its six drawn examples carry
>   rather than failing. The form offers the shortcuts in `genres.toml`, several
>   of which join into a blend.
> - **Examples (REQ 19).** `--source` takes several sources, comma-separated.
> - **The gate (REQ 35).** Once a candidate is chosen, any of the other four can
>   be developed as a fork: a draw of its own with the same seed, examples,
>   setting, domains and sampling, carrying the candidate's premise and vignette
>   across as a copied execute step and linked by `forked_from`.
> - **Rejecting (US 23, REQ 35).** There is no reject, and no `rejected` status
>   is written any more. A draw nobody chooses from simply stays at the gate;
>   archive takes it out of the way and it stays choosable. What reject was for
>   is now three separate acts: *redraw* opens the draw form filled from this
>   draw's options and starts nothing until you press Start, so sampling, genre,
>   domains, sources and the seed can all be changed first; *flag* records that
>   the call looked wrong, with its note; *delete* removes a draw and its steps
>   outright, and refuses on one that developed a candidate — that is what
>   archive is for. On the CLI and the Voice Bridge, redraw is
>   `cloudchamber draw --like <draw>`, whose other arguments override the copy.
> - **The trail (REQ 27).** Also carries the sampling mode, and `## forked_from`
>   on a fork.
> - **The viewer (REQ 34).** The distribution header reads `lowest to highest
>   probability`, and choosing is per candidate, in the probability column;
>   the gate bar carries redraw, flag, a note, archive and delete. A
>   draw's example rows offer one `exclude` toggle, which reads `include` once
>   the passage is out of the pool, rather than keep and pass: an example is
>   eligible until it is excluded, so keep was a no-op there. The artifact
>   flag is `flag` / `unflag` there, with a note field beside it; the stored
>   verdict fields are unchanged.
> - **Archiving (new).** A draw at any status can be archived, which takes it
>   out of both lists, out of the browse view and out of the status counts and
>   changes nothing else: `archived_at` on the row, reversible, and the draw is
>   still reachable by id. The list offers `show N archived`.
> - **Draw names (new).** A draw's name — three salient words of its seed, with
>   `-2`, `-3` … for draws that slug the same way — is written to the row when
>   the draw is created and never recomputed. It was derived on every read from
>   the whole list, which made it a function of every other draw; a name is now
>   the draw's own, and nothing that happens to another can change it. Suffixes
>   are never reused.
> - **The tabs (REQ 34, REQ 35).** The UI has four: browse, ideate, check and
>   write. Ideate shows no brief, and `develop` is check and write apart. The
>   rules are in `2026-09-10-four-tabs.md`.
> - **The skill (REQ 36).** The Voice Bridge also takes `--domains` and
>   `--sampling`, and a `knobs` tool prints every tunable and its live values.
>   `cloudchamber help` prints the same on the CLI; `docs/knobs.md` is that output.
> - **Statuses and failures (REQ 33 and the shape flag), 2026-09-17.**
>   `app/pipeline/lifecycle.ts` owns the statuses, each action's preconditions
>   and the failure rule: an action that throws on a draw already standing
>   somewhere puts it back there with the reason in `draws.error`, cleared by
>   the next action that succeeds. `failed` is only for a draw whose own
>   creation failed. A premise call failing `shape` records the error and
>   flags nothing: `flagged` and `flag_note` are the person's alone.
> - **The gate commands, 2026-09-17.** The twelve gate actions are one
>   interface, `app/pipeline/gate.ts`, and the HTTP route and the CLI are two
>   adapters over it. A command validates its own arguments, names the draw to
>   show next and says whether its work continues after the answer; the adapter
>   decides only what to do with that. `POST /api/draws/:id/gate` now answers
>   one shape for every action — `{ draw, running, payload }` — where it used to
>   answer eight. The CLI prints what it always printed.
> - **The queue (REQ 32), 2026-09-17.** The queue view and `GET /api/queue`
>   are gone. The browse tab replaced them; `GET /api/items` with
>   `verdict=unreviewed` and `suspect=true` serves the same items.

Spec derived from the grilling session of 2026-09-04 over `plan.md`. Every
decision below was put to Chris and answered; the few that were not are under
Open Questions. The research it rests on is `research/generation.md`,
`research/themes.md` and `research/tagging.md`; section references below are
to those files.

## Problem Statement

Chris has a corpus of horror and science fiction (29 PDFs, 110 SCP articles)
and three setting references, and wants story seeds generated from it that sit
off the centre of a model's distribution. The previous pipeline extracted
passages and drafted themes but had no way to record what he thought of them,
no UI, no view into what a generation run did, and a workflow tangled with
series doctrine that has since been retired. Its working tree has been deleted
and the repo reset. Every regeneration currently throws away all judgement
already made, and the generation steps run inside a session's own context,
which the research says narrows everything that follows.

## Solution

A two-runtime pipeline. Python reads sources, splits them into stories, cuts
verbatim passages and scores them on Biber's six register dimensions. TypeScript
on bun owns everything with state or a model call: the theme bank, the
append-only verdict log, generation runs as headless `claude -p` subprocesses
per step, an exported plain-text bank a skill can read, and one local web app
with a keyboard review queue, a browser over everything extracted, and a run
viewer that shows every step of a run and holds the human gate.

Everything extracted or drafted is eligible until Chris passes on it. Verdicts
are keyed by content so they survive re-extraction. A run goes: draw examples
and a seed, ask for a five-premise tail distribution, execute all five as
400-word vignettes, gate, reverse-outline the chosen one, then in parallel two
context vignettes and an ending, and export a packet. Settings constrain a run
by appending their reference file and declaring extra outline jobs; unrestricted
mode carries no doctrine at all.

## User Stories

### Sources and extraction

1. As Chris, I want the reset committed with the moved sources tracked, so that
   history records the starting point and a clean checkout has the corpus.
2. As Chris, I want a manifest naming each source, its reader, its genre, its
   author where the file has one, and whether it is in the dev subset, so that
   extraction is scoped without editing code.
3. As Chris, I want anthology and collection PDFs split into individual stories
   using the PDF's embedded outline, so that passages and themes are per story
   and carry the story's author.
4. As Chris, I want a PDF with no outline split from its printed contents page,
   so that the one such book in the corpus still yields stories.
5. As Chris, I want front matter, back matter, running headers, scan furniture,
   drop caps and hyphenation handled before segmentation, so that passages are
   clean prose.
6. As Chris, I want SCP articles read from their wikidot source with markup
   stripped, so that no `[[div]]`, module, colour span or table leaks into a
   passage.
7. As Chris, I want each story to yield about one passage per thousand words,
   floored at three and capped at thirty, each 150–400 words on paragraph
   boundaries, chosen by position-stratified random draw, so that coverage
   across a story is even and no hand-set score steers the pool.
8. As Chris, I want every passage scored on Biber D1–D6 with the fit recorded,
   so that examples can be selected for coverage across voice and mode.
9. As Chris, I want extraction to be re-runnable at any time, so that a stripper
   fix rebuilds the pool.

### Themes

10. As Chris, I want a model to draft up to four one-sentence themes per story
    against the theme rules, so that the theme bank is abstractive rather than
    quoted.
11. As Chris, I want each drafted theme validated per row (length, sentence
    count, no proper nouns or designations, no opening deictic) with rejections
    recorded, so that the bank keeps its shape.
12. As Chris, I want a candidate theme checked for redundancy against the bank
    before admission, so that the bank does not say the same thing twice.
13. As Chris, I want a theme's attestation count and stories recorded rather
    than gating on recurrence, so that a one-story theme is still a seed.

### Verdicts

14. As Chris, I want to mark any example, theme or packet keep or pass, with an
    orthogonal artifact flag and a free-text note, so that my judgement is
    recorded once and used everywhere.
15. As Chris, I want verdicts in an append-only tracked log carrying who, when,
    method and pipeline version, so that a future model can be fitted against
    them.
16. As Chris, I want a verdict to reattach to its passage after re-extraction,
    exactly by content hash and by inheritance when a stripper fix shifts the
    text, so that a regeneration does not cost me the cull.
17. As Chris, I want everything not passed and not flagged to be eligible by
    default, so that the pipeline is usable before any culling.
18. As Chris, I want to pass a whole story and have every passage of it drop
    out, so that the one cull these curated sources need (a story that does not
    belong) costs one verdict, not thirty.

### Bank

18. As Chris, I want the eligible bank exported to plain files, segmented by
    source file, with author and genre on every entry, tracked in git, so that
    a skill can read it without the database.
19. As Chris, I want to filter examples and seeds by source, author or genre
    when starting a run, so that I can work in subsets.

### Generation runs

20. As Chris, I want a run to draw six examples stratified across voice/mode
    cells and a seed drawn at random from eligible themes, with an override to
    pick a theme or type free text, recorded, so that the draw is the default
    and the record says when it was not.
21. As Chris, I want the premise call to ask for five premises with stated
    probabilities under 0.10, the modal answer excluded, and a positive-framed
    divergence cue, so that the batch is the tail.
22. As Chris, I want all five premises executed as 400-word vignettes in
    parallel independent calls, so that the gate judges prose and not pitches.
23. As Chris, I want a manual gate where I pick one vignette, reject the batch
    by redrawing everything or by keeping the seed, or flag the call as looking
    wrong with a note, so that a bad draw and a bad prompt are told apart.
24. As Chris, I want an auto mode that continues with the lowest stated
    probability, so that a run can complete unattended without a model judging.
25. As Chris, I want a reverse outline with debt audit, arithmetic and custody
    jobs, plus any jobs the setting declares, so that the story is derived
    before anything else is written.
26. As Chris, I want two context vignettes with distinct named jobs and an
    ending of up to 600 words, generated from the outline in parallel and not
    from each other, so that they are executions rather than a chain.
27. As Chris, I want a packet directory per run with the chosen vignette,
    outline, two context vignettes, ending and a trail, tracked in git, so that
    I can read and diff it and the drafting stage can consume it.
28. As Chris, I want every step's prompt, model, raw response and parsed output
    stored with its parent, so that the run viewer shows everything from the
    request to the packet.
29. As Chris, I want each stage's model configurable, so that a cheap model can
    do the same-or-different check and a strong one the premises.
30. As Chris, I want a run under a setting to have the setting's reference file
    in every generation prompt with its hard rules last, and its seed filtered
    to the segments the setting names, so that lore-constrained runs are one
    flag away.
31. As Chris, I want unrestricted runs to carry no doctrine beyond the genre
    named once, so that no filter is built in.

### UI

32. As Chris, I want a keyboard-driven queue that shows one item and takes
    keep, pass, artifact flag and note, so that culling is fast.
32a. As Chris, I want the queue to serve first the passages the reader most
    likely mangled, so that the example queue does its real job, finding
    artifacts, before it asks me to confirm prose that is yes by default.
33. As Chris, I want a browser over all passages, stories and themes with
    filters on segment, facet cell, verdict, artifact flag and suspicion, so
    that I can see what was extracted and pass a story in one row.
34. As Chris, I want a run viewer listing runs, showing each step as a tree,
    expandable to prompt and response, with the five candidates shown as a
    distribution sorted by stated probability and labelled so that low reads as
    far from centre, so that I can see what was sampled and what was rejected.
35. As Chris, I want to start a run from the UI and have the gate block there
    until I act, so that the UI and the skill drive the same pipeline.
35a. As Chris, I want the six examples a run drew shown in the run viewer with
    keep, pass and artifact on each, so that a bad example noticed in a trail
    is culled where I noticed it.

### Skill

36. As Chris, I want one skill that runs extraction, reports status, starts a
    run under a setting or unrestricted, and reads a packet, so that a session
    drives the pipeline without touching its internals.

### Housekeeping

37. As Chris, I want the stale `refactor/degrain` worktree and local branch
    removed, so that no edit targets deleted code.

## Acceptance Criteria

1. WHEN the first commit lands THE repo SHALL show `sources/horror`,
   `sources/scifi` and `sources/settings` tracked, the old `pipeline/`,
   `extracted/`, `drafts/`, `series.md`, `catalogue.md`, `seeding-v7.md` and
   `sources/texts` absent, and `git status` clean.
2. WHEN `extract` runs with no scope flag THE system SHALL read only manifest
   entries marked dev: Datlow Vol 01, Evenson *Contagion*, and the ten SCP
   articles listed in Implementation Decisions. IF a manifest entry names a
   reader the system lacks THEN extraction SHALL fail naming the entry.
3. WHEN Vol 01 is read THE system SHALL emit exactly the stories whose outline
   entries contain an em dash, minus entries matching the front/back-matter
   list, each with title and author split on the em dash; and SHALL emit an
   author per story that matches the outline byline verbatim.
4. WHEN *Contagion* is read THE system SHALL find no outline and SHALL emit
   exactly eight stories from page-level cues, titled The Polygamy of Language,
   Two Brothers, A Hanging, Internal, Prairie, Contagion, Watson's Boy and By
   Halves, with part headings `TWO` and `THREE` inside Watson's Boy and not as
   stories; author SHALL be the manifest author. IF the manifest carries a
   `stories` list for a source THEN THE system SHALL use it and ignore both the
   outline and the page cues.
5. WHEN any PDF page is read THE system SHALL drop lines appearing in the top or
   bottom two lines of 25% or more of pages, rejoin words split by line-end
   hyphens, and merge a lone capital at a story's start with its word.
   WHEN the dev pool is searched for `Google Original from`, `Digitized by`,
   or a line that is only a page number THE result SHALL be empty.
6. WHEN the SCP markup fixture is stripped THE output SHALL equal the fixture's
   expected text byte for byte, and WHEN the dev pool is searched for `[[`,
   `]]`, `##`, `@@` or `||` THE result SHALL be empty.
7. WHEN a story of W words is segmented THE system SHALL emit
   `clamp(round(W/1000), 3, 30)` passages, each of 150–400 words, each starting
   and ending on a paragraph boundary, no two overlapping by more than 50% of
   tokens, drawn one per equal-word stratum of the story with a recorded
   random seed, then filled from anywhere in the story when a stratum yields
   nothing; IF the story has fewer than 450 words of paragraphs under 400 words
   per passage owed THEN fewer passages are allowed (a 447-word story yields
   one). WHEN re-run with the same seed THE passages SHALL be identical.
   Windows are anchored to paragraph content: the start paragraph of each
   stratum and the window length are chosen by hash of seed and paragraph
   text, so WHEN a reader fix changes one paragraph THE windows not touching
   it SHALL keep their ids.
7a. WHEN a passage is segmented THE system SHALL screen it for reader residue
   and store the reasons found as a JSON list in `passages.suspect` (NULL
   when clean): `join` (a paragraph ending without terminal punctuation
   followed by one opening lowercase), `dropcap` (a paragraph opening with a
   lone capital before a word, except I, A and O), `hyphen` (a line-end hyphen
   the reflow kept, `\w- \w`), `ocr` (`~`, `|`, `¬`, or a digit inside a
   word), `markup` (`[[`, `]]`, `##`, `@@`, `||`). The screen is
   deterministic and makes no verdict.
8. WHEN `facets` runs THE system SHALL store six z-scores per passage, the fit
   (mean, sd, n, backend) in the store, tercile labels on D1 and D2, and print
   the range, skew and largest correlation per dimension. IF the pool differs
   from the fitted n by more than 20% THEN `facets` SHALL warn. IF the backend
   differs from the fitted one THEN `facets` SHALL refuse without `--refit`.
9. WHEN `extract` runs a second time on unchanged sources THE system SHALL
   produce the same passage ids, and WHEN sources are unchanged but a reader
   changed THE system SHALL replace the pool and reattach verdicts per
   criterion 16.
10. WHEN `themes` runs THE system SHALL make one model call per story not yet
    drafted, with the story's full text, the theme rules stated as properties
    (abstractive, self-contained, one sentence, under 30 words, mechanism and
    turn, no names), and SHALL accept at most four rows per story regardless
    of story length. WHILE fewer than twelve themes carry a keep verdict THE
    prompt SHALL contain no few-shot lines. WHEN twelve or more do THE prompt
    SHALL contain eight of them sampled at random, and nothing else as
    example; no external corpus and no pre-reset material ever enters it. WHEN the run ends THE system
    SHALL print a word-count histogram and the semicolon and colon rate over
    the rows banked in that run. The simulation's bank ran 31–43 words, median
    36, against an ask of 9–44; the histogram is how that is seen.
11. WHEN a drafted row has fewer than 9 or more than 44 words, more than two
    sentences, a capitalised token not at sentence start, a designation
    matching `SCP-\d+` or a bare alphanumeric code, or opens with *this*,
    *that*, *these*, *those*, *it* or *here* used as a pointer THE system SHALL
    reject it and store the row with its reason. A relative opener (*Those
    who*, *Those kept on*, *That which*) is not a pointer and SHALL pass; the
    second simulation rejected two good rows on it.
12. WHEN a row passes validation THE system SHALL embed it, retrieve the ten
    nearest banked themes, and make one model call returning `same:<id>` or
    `different`. IF `same` THEN THE system SHALL increment that theme's
    attestation, add the story, and store the candidate as a duplicate of it.
    IF `different` THEN THE system SHALL bank the candidate with attestation 1.
13. WHEN a theme is shown anywhere THE system SHALL show its attestation count
    and story list. THE system SHALL never reject a theme for attestation.
14. WHEN a verdict is recorded THE system SHALL append one line to the verdict
    log with `kind` in `{example, theme, packet, story}`, `verdict` in
    `{keep, pass}`, `artifact` boolean, `note`, `method` in
    `{queue, browse, gate, cli, run}`, `at`, `by`, `pipeline_version`, and
    never modify or delete an existing line.
15. WHEN the verdict log is replayed into an empty store THE system SHALL
    reproduce the same eligibility for every item, and a corrupt line SHALL
    fail replay naming the line number.
16. WHEN a passage's id (hash of story id and whitespace-normalised text) is
    present in the log THE verdict SHALL attach exactly. WHEN a new passage in
    the same story shares 80% or more of its tokens with a verdicted passage
    that no longer exists THE system SHALL copy the latest verdict with
    `inherited_from` set. WHEN neither holds THE passage SHALL be unreviewed.
17. WHEN an item's latest verdict is absent or keep, and its artifact flag is
    unset THE item SHALL be eligible. WHEN it is pass or flagged THE item SHALL
    not be eligible. WHEN a story's latest story verdict is pass THE story's
    passages SHALL not be eligible, SHALL not appear in the queue, the
    browser's example list, the export or the draw, whatever their own
    verdicts say, and SHALL return when the story is kept again. Two verdicts
    in the same second are ordered by insertion.
18. WHEN `export` runs THE system SHALL write one file per source segment under
    the bank directory containing every eligible passage verbatim with source,
    story, author, genre and facet cell on each entry, plus one themes file
    with every eligible theme and its attestation; a passed or flagged item
    SHALL not appear.
19. WHEN a run is started with `--segment` naming a source, author or genre THE
    examples and the seed draw SHALL come only from that segment; IF the
    segment has fewer than six eligible passages THEN the run SHALL fail
    naming the count.
20. WHEN a run draws THE system SHALL take one eligible passage from each
    non-empty voice/mode cell in random order until six are held, then fill at
    random, and SHALL store the six ids and the seed with `seed_mode` in
    `{drawn, picked, typed}`.
21. WHEN the premise step runs THE prompt SHALL contain, in order: the six
    passages verbatim; the setting file if any; the ask block with the seed,
    the genre word, the instruction for five premises each as a `<text>` under
    100 words with a `<probability>` under 0.10, the modal exclusion, and the
    divergence cue as its last lines; and the setting's hard rules last of all
    if a setting is set. No element asks how a premise was reached. IF the
    response has fewer than five premises or any probability of 0.10 or above
    THEN the step SHALL fail with reason `shape` and the run SHALL be flagged.
    IF a premise text exceeds 120 words THEN it SHALL be stored with a `length`
    warning and not rejected.
22. WHEN premises are parsed THE system SHALL start five execute steps at once,
    each prompted with the six passages, the seed and only its own premise, and
    each SHALL store a vignette; a vignette outside 300–500 words SHALL be
    stored with a `length` warning and not rejected.
23. WHILE a manual run is at the gate THE run status SHALL be `awaiting_gate`
    and no later step SHALL exist. WHEN one vignette is chosen THE outline step
    SHALL start. WHEN reject-redraw is chosen THE system SHALL create a new run
    with a fresh draw and set `superseded_by` on the old. WHEN reject-keep-seed
    is chosen THE new run SHALL reuse `seed_text` and draw new examples. WHEN
    the flag is set THE run SHALL record `flagged` and the note and start
    nothing.
24. WHEN an auto run reaches the gate THE system SHALL choose the vignette with
    the lowest stated probability, ties broken at random, and record
    `gate_method: auto`.
25. WHEN the outline step runs THE prompt SHALL contain the chosen vignette,
    the seed, the three core jobs by name with a cap of 400 words per section,
    and the setting's declared jobs if any; THE parsed output SHALL contain one
    section per job or the step SHALL fail with reason `shape`.
26. WHEN the outline completes THE system SHALL run one jobs step that names
    two distinct vignette jobs, then start two context-vignette steps and the
    ending step at once. Each context step's prompt SHALL contain the outline,
    the chosen vignette and its job only. The ending's prompt SHALL contain the
    outline and the chosen vignette only. IF the two jobs are identical strings
    THEN the jobs step SHALL be retried once and then fail.
27. WHEN the ending completes THE system SHALL write the packet directory with
    `vignette.md`, `outline.md`, `context-1.md`, `context-2.md`, `ending.md`
    and `trail.md`; `trail.md` SHALL list the seed and its mode, the six
    example ids with source lines, all five premises with their probability, all five vignettes' ids, the gate method and choice, the
    setting, the genre and the model per stage.
28. WHEN any step runs THE system SHALL store its stage, parent step, model,
    full prompt, raw response, parsed output, status, start and end times, and
    error text if any, before the next step starts.
29. WHEN any step is invoked THE command line SHALL carry an explicit
    `--model` from the stage config (the config SHALL fail to load if a stage
    has none), `--no-session-persistence`, `--tools ""`,
    `--setting-sources ""` and a `--system-prompt`, and never `--bare`; the
    step row SHALL store the model and the system prompt. WHEN a call returns `stop_reason: refusal` THE
    step SHALL rerun once on the stage's `fallback_model`, store both calls,
    and IF the rerun also refuses THEN fail with reason `refusal`, never
    `shape`. WHEN any prompt template is loaded THE system SHALL fail if the
    template text (not the story, passage or outline substituted into it)
    contains *reason*, *reasoning*, *think*, *chain of thought*, or a phrase
    asking how the model arrived at anything.
30. WHEN a run names a setting THE system SHALL read the setting file's front
    matter for `jobs` and `seed_segments`, filter the seed draw to those
    segments, append the file body after the examples in every generation
    prompt, and place the section named by `hard_rules` after everything else.
31. WHEN a run names no setting THE prompts SHALL contain no text beyond the
    passages, the seed, the ask block and the genre word.
32. WHEN the queue view is open THE system SHALL show one unreviewed item with
    its source line, facet cell and suspect reasons; `k` SHALL record keep,
    `p` pass, `a` toggle the artifact flag, `n` focus the note, and each
    verdict SHALL advance to the next item within one round trip. By default
    THE queue SHALL serve suspect passages before clean ones, sources
    round-robin and random within a source; `GET /api/queue?suspect=true`
    SHALL serve only suspects and `sample=true` SHALL ignore the screen. The
    response SHALL carry `remaining` and `suspects` counts.
33. WHEN the browser view is filtered by any combination of segment, facet
    cell, verdict state, artifact flag and suspicion THE list SHALL contain
    only matching items and show the count. WHEN the browser lists stories
    (`GET /api/items?kind=story`) each row SHALL carry title, author, source,
    genre, word count, passage count and latest story verdict, with keep and
    pass and no artifact flag.
34. WHEN a run is opened THE viewer SHALL show its steps as a tree in parent
    order, each expandable to prompt, raw response and parsed output; the
    premise step SHALL render five rows sorted by probability ascending with
    the header text `stated probability · lower is further from centre`.
    `GET /api/runs/:id` SHALL return `examples`: the six drawn passages in
    draw order with source line, cell and latest verdict (id only, text null,
    for a passage no longer in the pool); the viewer SHALL show them with
    keep, pass and artifact, recorded with `method` `run`.
35. WHEN a run is started from the UI THE server SHALL invoke the same command
    the CLI does, and WHEN the run reaches the gate THE viewer SHALL present
    choose, reject-redraw, reject-keep-seed and flag.
36. WHEN the skill is invoked THE session SHALL be able to run extraction,
    print status (pool size, bank size, eligible counts per segment, runs by
    status), start a run with setting, genre, segment, seed and auto flags, and
    print a packet; the old `seed-premises` skill SHALL not exist.
37. WHEN housekeeping is done `git worktree list` SHALL not show `degrain` and
    `git branch` SHALL not show `refactor/degrain`; the remote branch SHALL be
    untouched.

## Implementation Decisions

### Layout

- `extract/`: the Python package, run as `python -m extract`. Subcommands
  `read` (which splits: a PDF is read into stories, not into a file),
  `segment`, `facets`, `embed`. It reads sources and writes
  rows into the SQLite store; it makes no model call and no network call.
- `app/`: the bun workspace. `app/cli` (the `cloudchamber` command), `app/pipeline`
  (stages, model adapter, store), `app/server` (Fastify), `app/ui` (React,
  Vite). One process serves API and UI.
- `bank/`: tracked. `examples/<source-slug>.md` exports, `themes.md` export,
  `themes.jsonl` canonical theme bank, `verdicts.jsonl` append-only log.
- `packets/<run-id>/`: tracked packet directories.
- `sources/manifest.toml`: one table per source with `path`, `reader`
  (`pdf` | `scp`), `genre`, optional `author`, `dev` boolean. The settings
  directory is not in the manifest; settings are addressed by id.
- `data/`: the SQLite database, gitignored. Rebuildable from sources plus the
  two tracked JSONL files.
- `.claude/skills/cloudchamber/SKILL.md`: the driving skill. `seed-premises` is
  deleted.
- `docs/specs/`: this file and its successors.

### Salvage

Four modules come from git history at HEAD `00f4eec`, copied into `extract/`
and rewritten to the new interface: `read_pdf` (page reading, drop caps,
running lines, reflow, contents-page parsing), `segment` (windows), the SCP
reader with its selftest fixture, and `biber` (biberplus adapter, numpy 2
workaround, local fallback with probe). Nothing else is carried over, and no
pre-reset *content* is: the old grain reference, theme bank, playbook and
catalogue stay in history. Theme drafting starts zero-shot from the
property rules and bootstraps its few-shot from kept themes (see Themes).

### Splitting

Outline first: level-1 entries from the PDF outline, front and back matter
dropped by a title list (introduction, contents, publishing details,
dedication, about the authors, acknowledgment, copyright, about the editor,
also by), story boundaries at each entry's destination page, title and author
split on an em dash where present, author otherwise from the manifest.

When the PDF has no outline, split on page-level cues: a body page whose first
non-empty line is short (under 40 characters), all-caps and not a running line
starts a story, titled by that line. If a printed contents page is found its
titles are matched fuzzily against those lines to drop false starts (part
headings like `TWO`, `THREE`) and to confirm coverage; the contents page is
never the sole source of boundaries, because OCR mangles its page numbers.
*Contagion* is a Google Books scan: eight stories, each opening on a page with
an all-caps title, a contents page with five of eight page numbers OCR'd to
letters, and a scanner running line on every page. The simulation's parser
took boundaries from the contents page alone and got three stories.

Last resort, for any PDF: the manifest may carry a `stories` list of
`{title, page}` pairs that overrides both the outline and the page cues.

### Dev subset

Datlow *The Best Horror of the Year Volume 01*, Evenson *Contagion and Other
Stories*, and ten SCP articles chosen one per word-count decile: 2151, 610,
3929, 5740, 2845, 2000, 3625, 001-djk1-the-children, 4390, 8947 (789 to
25,256 words).

### Themes

Drafting is zero-shot to start: the prompt carries the story and the property
rules (abstractive, self-contained, one sentence, under 30 words, mechanism
and turn, no names, no opening deictic) and no examples. Once twelve themes
carry a keep verdict, eight of them are sampled per call as few-shot. Plotto
(CC0, 1,852 conflicts) was evaluated and rejected: its lines are plot
situations with lettered parties, no mechanism and no cost, and would pull
drafts toward incident. The row validator keeps the 44-word hard cap; the
histogram printed after each run is how drift toward the cap is seen.

### Store

SQLite via `bun:sqlite`. Tables: `sources`, `stories`, `passages` (id, story,
text, word count, position stratum, facets, cell, seed, suspect), `facet_fit`,
`themes` (id, text, attestation, stories, embedding, drafted_at, duplicate_of),
`theme_rejections`, `verdicts` (mirror of the log), `runs`, `steps`,
`artifacts`. Passage id is the hash of story id plus whitespace-normalised
text. Theme id is the hash of the normalised sentence. The log is the source
of truth for verdicts; the table is a replay.

`schema.sql` only creates (`IF NOT EXISTS`); both runtimes execute it on open.
A change to an existing table is a migration in `app/pipeline/store/db.ts`
keyed on `PRAGMA user_version`, owned by the TypeScript side: the verdicts
table is dropped, recreated and replayed from the log, columns are added with
`ALTER TABLE`. A fresh store is stamped with the current version. The Python
side mirrors the version number and refuses a store that is behind, naming
the `cloudchamber` command that migrates it. Version 1 (2026-09-05): `story` kind,
`run` method, `passages.suspect`.

### Verdict log line

```
{ id, kind: "example"|"theme"|"packet"|"story", target_id,
  verdict: "keep"|"pass", artifact: boolean, note: string,
  method: "queue"|"browse"|"gate"|"cli"|"run",
  at: ISO-8601, by: string, pipeline_version: string,
  inherited_from?: target_id, snapshot?: { story_id, text } }
```

Latest line per target wins; a tie on `at` breaks on insertion order. A
`story` verdict's target is the story id; it carries no snapshot and is never
inherited. Story eligibility is applied as a filter on the story, on top of
each passage's own verdict, in `eligiblePassages`, so export, draw, status,
queue and browser all follow from one place. Inheritance runs at the end of every extraction,
comparing new passages in a story against verdicted passage texts that no
longer exist in that story, at 80% token overlap.

### Model adapter

One function in `app/pipeline`: given a stage name and a prompt, it writes the
prompt to a file and spawns `claude -p` with `CLAUDECODE` unset and these
flags: `--output-format json`, `--no-session-persistence`, `--tools ""`,
`--setting-sources ""`, `--system-prompt <one line per stage>`, and the stage's
`--model`, always explicit. Together these drop hooks, plugins, skills, MCP,
tool schemas and both CLAUDE.md files: measured overhead fell from about 20,000
tokens per call to 5,757. `--bare` is not used: it skips the stored
subscription login and returns "Not logged in", so it needs an API key.
`--setting-sources ""` also drops the configured default model, which is why
`--model` is mandatory per stage. The per-stage system prompt is stored on the
step.

Every stage config has `model` and `fallback_model`. The adapter reads
`stop_reason` from the JSON:

| outcome | action |
| :-- | :-- |
| `end_turn`, parse succeeds | step done |
| `end_turn`, parse fails | retry once on the same model, then fail `shape` |
| `refusal` | rerun once on `fallback_model`, record both calls, then fail `refusal` |
| any other error | fail with the CLI's error text |

Structured pieces of a response are tagged XML elements (`<premise>`,
`<probability>`, `<text>`, `<vignette>`, `<job>`, `<ending>`,
`<section name="">`), parsed by the stage. The adapter is the one seam the
tests substitute.

**Prompt vocabulary rule.** No prompt template uses *reason*, *reasoning*,
*think*, *chain of thought*, or asks how the model arrived at anything. The
check runs on the template, not the filled prompt: fiction contains *think*.
The second simulation's premise ask carried a `<how>` element ("two or three
sentences on how you arrived at it") and Fable refused it under a one-line
system prompt with the same `reasoning_extraction` category, though it had
passed the day before under the full Claude Code system prompt. So §3.2's
chain-of-thought is dropped from the call, not renamed (Open Questions). The simulation's outline
prompt opened "Reason backward from them" and Fable's `reasoning_extraction`
safeguard refused it twice with zero output; the same prompt with "Derive from
them" passed. Prompts say *derive*, *state*, *settle*, *name*.

**Length caps everywhere.** Every generation ask states a word cap. The outline
asks for under 400 words per section; Fable produced 25,000 tokens against an
uncapped ask where Opus produced 2,400 words.

### Stage graph

```
draw → premises → execute ×5 → gate → outline → jobs → { context ×2, ending } → packet
```

Fixed in code. Each step row records its parent. Later stages (fact check,
lore audit, red team, drafting) append to the graph without schema change.

### Prompt order

Examples verbatim first, with no framing text between them. Then the setting
body if any. Then the ask block: the seed, the genre word, the instruction, the
ceiling, the modal exclusion, the divergence cue. Then the setting's hard rules
if any. Nothing negated; every constraint positive-framed. Each step is its own
subprocess; no step sees another's transcript.

### Settings

Superseded by `2026-09-05-typed-settings.md`.

A setting is a file under `sources/settings/` with YAML front matter:

```
id: setting-a
name: The setting-a
jobs: [matrix]
seed_segments: [scp, datlow-01]
hard_rules: "Hard rules"
```

`jobs` are appended to the outline's core jobs by name, each with a one-line
description in the front matter. `seed_segments` filters the seed draw.
`hard_rules` names the heading whose section goes last in every prompt. The
existing three files get front matter added; their bodies are untouched. A lore
audit step is designed as a future stage that checks the outline against the
setting body; it is not built now.

### UI

React with Vite, served by Fastify from one bun process, dev port at or above
3002. Views: queue, browser, runs, run detail. API: `GET /api/queue`
(`kind`, `n`, `source`, `suspect=true` | `sample=true`), `POST /api/verdicts`,
`GET /api/items` (`kind` in example | story | theme | packet, plus filters),
`GET /api/runs`, `POST /api/runs`, `GET /api/runs/:id` (steps, artifacts,
candidates, examples), `POST /api/runs/:id/gate`. The server runs the
pipeline in-process; the CLI calls the same functions.

### Skill

`cloudchamber` skill wraps the CLI: `cloudchamber extract`, `cloudchamber facets`,
`cloudchamber themes`, `cloudchamber export`, `cloudchamber run`, `cloudchamber status`,
`cloudchamber packet <id>`, `cloudchamber serve`. The skill never generates in its own
context; it triggers steps and reads results.

### Rejected alternatives

- Restoring or evolving the old Python tree: the spine it had (draw in Python,
  doctrine in the playbook) is what the plan replaces.
- All-TypeScript: pdfplumber and biberplus are Python and work here.
- In-session generation: fixation across candidates, §3.4.
- Heuristic or model-chosen passage selection: unvalidated scorer; model
  annotator without a validation sample, `tagging.md` §2.2.
- Recurrence as a gate: starves the bank during dev.
- Embedding threshold alone for redundancy: retrieval alone scores F1 0.36 on
  recurrence, `themes.md` §3.1.
- Executing one candidate: gates on a premise, which inverts, §3.8.
- Any model judging at the gate: 73% ceiling and rubric inversion, §1.4, §3.8.
- Sequential vignettes then ending: the pilot found them siblings of the
  outline.
- Personas now, planning call now: recorded as experiments, not built.
- Retrieval or distilled rule sheets for settings: no measured benefit and the
  files fit in a prompt.

## Testing Decisions

Two seams, no test calls a real model.

**Python extraction CLI.** Run `python -m extract` over the dev subset and the
salvaged SCP markup fixture. Assert on emitted rows: story count and titles for
Vol 01 against the outline, the eight named stories for *Contagion*,
author per story, passages per story within floor and cap, every passage in
150–400 words on paragraph boundaries, overlap under 50%, no surviving markup
or scan furniture by grep, six facet columns present, determinism under a fixed
seed, windows surviving a one-paragraph insertion, the suspect screen naming
each reason on a fixture string and marking a minority of the pool. The SCP fixture asserts byte equality against expected text, as the old
selftest did. Tests that need the PDFs skip with a message when the sources
directory is absent.

**TypeScript pipeline and HTTP API with a fake model.** The model adapter is
replaced by one that returns canned responses per stage from fixture files,
including one malformed premise response and one over-ceiling response. Tests
run against a temporary database: a full auto run produces the expected step
tree, artifacts and packet directory; a manual run stops at `awaiting_gate` and
resumes on each gate action; reject creates a linked run; the flag starts
nothing; verdict POSTs append log lines and change eligibility; a story pass hides
its passages from items, queue, status and draw; the queue serves suspects
first, only suspects, or a sample; a run's examples carry verdicts recorded
with method `run`; a version-0 store migrates in place and replays its log;
replay of a log reproduces eligibility; inheritance attaches at 80% and not at 70%; export
omits passed and flagged items; segment filters restrict draw; setting front
matter changes prompt composition and jobs; queue, browser and run endpoints
return the documented shapes. Run with `bun test`.

Prior art: the old `pipeline/selftest.py` fixture for wikidot markup leaks is
the model for the Python side.

Verification for every change: the relevant seam's tests run after the last
edit, from inside the worktree, and the turn reports what ran.

## Out of Scope

- Fact check, lore audit, red team, drafting and assembly stages. The schema
  admits them; nothing builds them.
- Cross-vendor pooling and a different-family judge. Waits on an API path.
- Personas, the planning call, focalization, style embeddings. Recorded as
  experiments.
- Any model-assigned label on passages.
- Anything derived from `stories/`. Not an input, not a filter.
- Training or fitting anything on the verdict log.
- Extraction of the 26 PDFs outside the dev subset. Same code; run later.
- Audio.

## Open Questions

- **Chain of thought (§3.2).** Any element that asks the model to account for
  how it reached a premise trips Fable's safeguard under a minimal system
  prompt. If the fixation benefit is wanted, it needs a shape that is not an
  account of arriving; untested. Unblocked by an experiment in the run viewer.
- **API path.** When cross-model pooling or a judge is wanted, Anthropic SDK or
  OpenRouter, and how a key is held. All calls today run on the claude.ai
  subscription login through the CLI; the cost figures the CLI reports are
  notional. Unblocked by wanting it.
- **Embedding model.** A local sentence-transformers model, exact name pinned
  in the manifest at implementation time after checking what installs cleanly
  on this machine.
- **Artifact routing.** A flagged artifact is a stripper bug; the fix loop is
  manual for now (read flagged items, fix the reader, re-extract, verdicts
  inherit). The browser's artifact and suspect filters are the view. The
  suspect screen's rules are a first list from the residue seen in the dev
  subset; a rule that marks too much is removed, not tuned.
- **Genre when a segment spans both.** The run's `--genre` flag is required if
  the examples' segment is not a single genre directory; otherwise inferred.
- **Queue order.** Settled 2026-09-05: suspects first, then random within
  source, sources round-robin. Chris found passages from these sources are
  yes by default, so the queue's job is artifacts and the story row is the
  cull.

## Further Notes

- The two papers that resisted extraction were read this session. IDEAFix
  (arXiv:2606.00875): explicit divergence cues beat method-based prompts on
  novelty and rarity at near-baseline fluency; nothing fixes homogenisation
  outright. Folded in as the cue line. Seeing the Hivemind (arXiv:2606.09587)
  is a decoding-time repulsion technique, not applicable through `claude -p`;
  its one UI finding, that 38% of users read a consensus zone as "optimal
  responses", is why the distribution view labels probability as distance from
  centre rather than as a score.
- The lore-constraint survey found no published system measuring retrieval
  against full context. The strongest measured design is a fact ledger audited
  by a model per turn; the best model stayed conflict-free 42% of the time over
  20 turns. That argues for a check stage, which is the deferred lore audit.
- Anthology splitting: 28 of 29 PDFs carry embedded outlines with title and
  author per story. Page-level cues are the fallback, exercised by *Contagion*.
- **Simulation, 2026-09-04.** The whole stage graph was run by hand in the
  scratchpad against the dev subset, every model step a `claude -p`
  subprocess: 274 passages, 24 themes, five premises at 0.04–0.07, five
  vignettes, auto gate, outline, two context vignettes, ending, packet. 19
  calls, about six minutes, on a subscription login. Five findings went into
  this amendment: refusal handling, the Contagion split, contents-page author
  attribution (already covered by the outline path), per-call overhead, and
  theme length. The packet read as a story.
- **Simulation run 2, 2026-09-04**, with the amendment applied: bare mode
  breaks login; `--setting-sources ""` drops the default model; the
  vocabulary check must be scoped to templates; `<how>` is refused; the
  deictic rule over-rejects relative openers; themes under the under-30 ask ran
  20–29 words, median 24; page-cue splitting gave Contagion its eight stories;
  the capped outline passed on Fable at 383/348/372 words. Premises fell back
  to Opus; everything else ran on Fable.
- **Review pass, 2026-09-05.** After the first nineteen verdicts Chris found
  the example queue asking the wrong question: the passages are yes by default
  and the only real finds were reader residue (a dropped short-paragraph rule,
  18.7% of paragraphs, fixed in `591478e`). Three changes followed: the
  content-anchored draw (`b47bd3d`), so a reader fix keeps most ids and most
  verdicts without inheritance; the story verdict, so a source that does not
  belong is one pass; and the suspect screen with suspects-first queue order.
  The run viewer took keep, pass and artifact on the drawn examples at the
  same time, since that is where a bad example is noticed.
- `research/generation.md` §5 gaps remain gaps: nothing measures horror, tone
  drift is unstudied. The run viewer is where those get measured, by hand.
