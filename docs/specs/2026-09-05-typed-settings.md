# Typed settings

Supersedes the *Settings* subsection of `2026-09-04-ideation-pipeline.md`.
Decided 2026-09-05 after a grill over the design; the twelve decisions and the
loading table are also drawn at the Fog Belt Settings artifact.

## Problem Statement

A setting is meant to make a draw regional: remove the place and a mechanism
should go with it. Today a setting is one 30,000-word file appended whole to
the premise call and the five execute calls, and to nothing else. The two
stages that need only mechanisms and nouns read 24,000 words of statutes they
cannot use, with the six example passages 40,000 tokens away from the ask.
The outline, the one stage asked to name the office and the instrument the
story is built out of, never sees the evidence at all, so it must know the
Probate Code from training or invent it, and inventing is what the setting
forbids. A setting-a draw costs about 250,000 input tokens for this.

The two annex files for setting-c and setting-b have no front
matter worth the name, and their bodies are craft essays, not settings. There
is no way to turn a body of lore into a setting except by hand, and no check
that a setting file has what a draw needs.

## Solution

One file per setting, typed inside. Setting-wide sections carry the
constraints. Under `## Domains`, every domain carries the same nine sections:
Frame, Mechanisms, Roles, Institutions, Instruments, Clocks, Places,
Vocabulary, Sources. Each stage of a draw loads only the sections it is asked
to produce from, for two domains drawn at random and recorded on the draw,
with the hard rules last in every prompt. Sources and the setting's
`reference/` directory of imported lore never enter a prompt.

A `distill` command reads a domain's reference files and fills the empty
sections in place; Chris writes the domain headings and frames, reviews the
diff, and owns every filled line after that. A `lint` command checks the file
before any draw loads it. setting-a migrates by moving its evidence into
`reference/` and distilling; the two annexes become settings by the same path
from the lore already gathered.

## User Stories

### The setting file

1. As Chris, I want a setting to be one markdown file with metadata-only front
   matter and every piece of prose in a named section, so that I write and
   read the setting in one place and the pipeline finds text by name.
2. As Chris, I want the setting-wide sections Matrix, Hard rules, Do not
   build, Open ground and Jobs, so that the constraints on every draw live
   apart from the material the draw builds from.
3. As Chris, I want the outline's setting jobs written as lines in the body's
   Jobs section rather than in front matter, so that front matter holds only
   `id`, `name`, `draw`, `seed_segments` and `names`.
4. As Chris, I want every domain to carry the same nine sections in the same
   order, so that a new setting and an old one are read by the same code and
   a missing section is an error, not a silence.
5. As Chris, I want an empty section to hold the single line `none`, so that
   absence is a statement I made and not a hole the distiller left.
6. As Chris, I want a Frame to be one line stating the domain's question, so
   that the eight Mechanisms under it read as variations on a question and
   not as a list.
7. As Chris, I want Mechanisms lines held to the same shape as bank themes
   (nine to forty-four words, at most two sentences, no designations), so
   that a Mechanism could be a seed and the validator is shared.
8. As Chris, I want a masked setting to keep proper nouns out of every domain
   section except Institutions and Sources, so that a draw under setting-b produces an original story carrying the setting's mechanism rather
   than fan fiction, and I want `names: true` to switch the mask off for a
   setting where the names are the point.
9. As Chris, I want each setting to have a `reference/` directory beside it
   holding imported lore as cited markdown files, so that the source of every
   distilled line is in the tree and a later lore audit has something to
   check against.
10. As Chris, I want the reference directory committed, so that the distill is
    reproducible from the repository.

### Loading

11. As Chris, I want a draw under a setting to pick two domains at random,
    without replacement, independently of the seed, so that each draw is a
    conjunction of a foreign theme and regional ground and two draws on the
    same seed differ by ground.
12. As Chris, I want `draw: N` in front matter to set how many domains a draw
    picks, so that the count is a setting decision and not a code constant.
13. As Chris, I want `fogbelt draw --domains a,b` to pin the domains, so that
    I can repeat a draw on the same ground or force a pairing.
14. As Chris, I want the drawn domains stored on the draw row, returned by the
    draw API and printed in the brief's trail, so that a brief says what
    ground it stood on.
15. As Chris, I want the premise call to receive Matrix, Do not build, Open
    ground, and each drawn domain's Frame, Mechanisms and Roles, with Hard
    rules last, so that premises are built from mechanisms and positions and
    nothing else.
16. As Chris, I want each execute call to receive Matrix, Do not build, and
    each drawn domain's Frame, Roles, Instruments, Places and Vocabulary, with
    Hard rules last, so that the vignette has the setting's nouns and its
    words for them and the six examples sit next to the ask.
17. As Chris, I want the outline call to receive Matrix, Do not build, Jobs,
    and each drawn domain's Frame, Mechanisms, Institutions, Instruments and
    Clocks, with Hard rules last, so that the stage asked to name the office
    and the instrument has the offices, instruments and intervals in front of
    it.
18. As Chris, I want the jobs, context and ending calls to receive Matrix, Do
    not build, and each drawn domain's Frame, Institutions, Instruments,
    Clocks and Vocabulary, with Hard rules last, so that execution after the
    outline stays grounded in the same offices and intervals.
19. As Chris, I want Sources and the reference directory excluded from every
    prompt, so that citations and imported text never spend tokens or steer a
    draft.
20. As Chris, I want the setting's slice to keep its markdown headings in the
    prompt, so that the model sees which domain and which kind of thing each
    line is.
21. As Chris, I want an unrestricted draw unchanged, so that the absence of a
    setting still means nothing beyond passages, seed, ask and genre.
22. As Chris, I want the seed under a setting to stay a corpus theme, so that
    the conjunction is preserved.

### Distilling

23. As Chris, I want to write a domain's heading, Frame and Sources by hand,
    so that naming the ground and assigning reference files to it stays my
    creative act.
24. As Chris, I want `fogbelt distill <id>` to fill, for every domain, each
    section that is empty or marked `<!-- redraft -->`, from the reference
    files the domain's Sources names, so that a domain goes from a frame to a
    full block in one command.
25. As Chris, I want `fogbelt distill <id> --domain <slug>` to work on one
    domain, so that I can redraft one block without touching the others.
26. As Chris, I want distill never to change a filled section, so that my
    edits survive every later run.
27. As Chris, I want distill to write in place, so that the review is the diff
    against the commit before it.
28. As Chris, I want every distilled Mechanisms line validated with the theme
    validator and every distilled line in a masked setting checked for proper
    nouns, with failing lines dropped and reported rather than written, so
    that what lands in the file already passes lint.
29. As Chris, I want distill to refuse a domain whose referenced files exceed
    the prompt budget, naming the domain and the word count, so that I split
    the domain or trim its Sources instead of the model silently truncating.
30. As Chris, I want each distill call recorded as a step with its prompt and
    response, so that a bad section can be traced to the call that wrote it.

### Lint

31. As Chris, I want `fogbelt setting lint <id>` to check a setting file and
    print every finding as `domain › section: reason`, so that I fix a file
    from one listing.
32. As Chris, I want `fogbelt draw --setting <id>` and `fogbelt distill <id>`
    to run lint first and stop on findings, so that no draw runs on a broken
    file and no distill writes into one.
33. As Chris, I want lint to check: the front matter keys; the five
    setting-wide sections present; at least one domain; every domain with all
    nine sections in order; every empty section exactly `none`; Mechanisms
    lines passing the theme validator; the mask respected when `names` is not
    true; Sources non-empty with every named reference file present.

### Migration

34. As Chris, I want setting-a's fifteen domains kept with their frames and
    theme lines, the theme lines becoming Mechanisms, so that nothing already
    written is lost.
35. As Chris, I want each setting-a domain's Evidence bullets moved to a
    reference file per domain and the Artifacts section to a reference file
    of its own, each cited to the setting file and dated, so that the evidence
    is where the distiller and the lore audit read from and the `[?]` marks
    survive.
36. As Chris, I want setting-a's Jobs line moved from front matter into the
    body and the `hard_rules` key dropped, so that the file matches the
    standard.
37. As Chris, I want to approve setting-a's distilled sections one domain at a
    time, so that the fifteen-domain diff is reviewed in fifteen pieces.
38. As Chris, I want the two annex essays moved into their settings'
    reference directories and new setting files started with front matter,
    the five setting-wide sections, domain headings and frames, so that the
    lore gathered on 2026-09-05 has a setting to distil into.

### Surfaces

39. As Chris, I want the draw form's setting help text and the draw detail
    view to reflect slicing and show the drawn domains, so that the UI does
    not describe the old behaviour.
40. As Chris, I want the `fogbelt` skill to know `distill`, `setting lint` and
    `--domains`, so that a session can drive them.
41. As Chris, I want the ideation spec's Settings subsection to point here, so
    that the two documents do not disagree.

## Acceptance Criteria

1. WHEN a setting file is loaded THE system SHALL parse front matter keys `id`,
   `name`, `draw`, `seed_segments`, `names` only, and SHALL find every prose
   section by heading; IF front matter carries `hard_rules` or `jobs` THEN
   lint SHALL report `front matter: unknown key <key>`.
2. WHEN a setting is loaded THE system SHALL find `## Matrix`, `## Hard
   rules`, `## Do not build`, `## Open ground`, `## Jobs` and `## Domains`
   at heading level two; IF any is absent THEN lint SHALL report
   `setting › <section>: missing`.
3. WHEN the Jobs section holds lines of the form `- <name>: <description>`
   THE outline prompt SHALL carry one `<section name="<name>">` per line and
   the outline parser SHALL require each named section; WHEN the Jobs section
   is `none` THE outline SHALL carry only the three core jobs.
4. WHEN a domain is read THE system SHALL find `#### Frame`, `#### Mechanisms`,
   `#### Roles`, `#### Institutions`, `#### Instruments`, `#### Clocks`,
   `#### Places`, `#### Vocabulary`, `#### Sources` in that order under its
   `### ` heading; IF one is absent or out of order THEN lint SHALL report
   `<domain> › <section>: missing` or `<domain> › <section>: out of order`.
5. IF a section's body is blank THEN lint SHALL report `<domain> › <section>:
   empty sections hold the line none`; a body that is exactly `none` is an
   empty section and passes.
6. WHEN lint reads a Frame THE system SHALL accept exactly one non-blank line;
   IF the Frame has two or more lines THEN lint SHALL report `<domain> ›
   Frame: one line`.
7. WHEN lint reads Mechanisms THE system SHALL run each line through the theme
   validator and report each failure as `<domain> › Mechanisms: <line
   prefix…> <reasons>`.
8. WHILE `names` is absent or false, WHEN lint reads any domain section other
   than Institutions and Sources THE system SHALL report each capitalised
   word not at sentence start and not `I` as `<domain> › <section>: proper
   noun <word>`; WHILE `names: true` THE system SHALL skip this check.
9. WHEN a setting's reference directory is scanned THE system SHALL read only
   `sources/settings/<id>/reference/*.md`; WHEN any generation or distill
   prompt is composed THE prompt SHALL contain no line of any Sources section
   and no text of any reference file, except that the distill prompt carries
   the reference files the domain's Sources name.
10. WHEN the repository is inspected after the migration THE tree SHALL track
    `sources/settings/setting-c/reference/`, with 64 topic files and
    `INDEX.md`, and `sources/settings/setting-b/reference/`, with 47
    topic files and `INDEX.md`, each file opening with front matter `topic`,
    `sources`, `fetched`.
11. WHEN `fogbelt draw --setting <id>` runs without `--domains` THE system
    SHALL choose `draw` distinct domains from the setting using the
    pipeline's rng, without regard to the seed; WHEN the rng is fixed in a
    test and two draws use different seeds THE chosen domains SHALL be the
    same.
12. WHEN front matter omits `draw` THE system SHALL use 2; WHEN `draw`
    exceeds the number of domains THE system SHALL fail before any model call
    with `setting <id>: draw <n> exceeds <m> domains`.
13. WHEN `--domains a,b` names domain slugs (the `### ` heading lower-cased,
    non-alphanumerics to hyphens, leading numbering dropped) THE draw SHALL
    use those domains in that order; IF a slug matches no domain THEN THE
    system SHALL fail before any model call with `setting <id>: no domain
    <slug>`; IF `--domains` is given without `--setting` THEN THE system SHALL
    print usage and exit 1.
14. WHEN a draw under a setting starts THE draws row SHALL carry `domains` as
    a JSON array of slugs; WHEN a draw is unrestricted THE column SHALL be
    NULL; WHEN `GET /api/draws/:id` is called THE response SHALL carry
    `domains` as an array or null; WHEN the brief is written THE trail SHALL
    contain a `## domains` heading followed by one line per domain heading in
    draw order.
15. WHEN the premises prompt is composed under a setting THE prompt SHALL
    contain, in order: the examples; `## Matrix`, `## Do not build`, `## Open
    ground`; for each drawn domain in draw order its `### ` heading then
    `#### Frame`, `#### Mechanisms`, `#### Roles`; the ask; `## Hard rules`
    as the last heading. The prompt SHALL contain none of `#### Institutions`,
    `#### Instruments`, `#### Clocks`, `#### Places`, `#### Vocabulary`,
    `#### Sources`, `## Jobs`, nor any undrawn domain's heading.
16. WHEN an execute prompt is composed under a setting THE prompt SHALL
    contain the examples, `## Matrix`, `## Do not build`, each drawn domain's
    `#### Frame`, `#### Roles`, `#### Instruments`, `#### Places`,
    `#### Vocabulary`, the ask, and `## Hard rules` last; and SHALL contain
    none of `#### Mechanisms`, `#### Institutions`, `#### Clocks`,
    `#### Sources`, `## Open ground`, `## Jobs`.
17. WHEN the outline prompt is composed under a setting THE prompt SHALL
    contain the seed, premise and vignette, then `## Matrix`, `## Do not
    build`, each drawn domain's `#### Frame`, `#### Mechanisms`,
    `#### Institutions`, `#### Instruments`, `#### Clocks`, then the ask with
    the Jobs lines as sections, then `## Hard rules` last; and SHALL contain
    none of `#### Roles`, `#### Places`, `#### Vocabulary`, `#### Sources`,
    `## Open ground`.
18. WHEN a jobs, context or ending prompt is composed under a setting THE
    prompt SHALL contain the head, then `## Matrix`, `## Do not build`, each
    drawn domain's `#### Frame`, `#### Institutions`, `#### Instruments`,
    `#### Clocks`, `#### Vocabulary`, then the ask, then `## Hard rules`
    last; and SHALL contain none of `#### Mechanisms`, `#### Roles`,
    `#### Places`, `#### Sources`, `## Open ground`, `## Jobs`.
19. WHEN any prompt under a setting is composed THE last heading in it SHALL
    be `## Hard rules` and the Hard rules body SHALL follow it.
20. WHEN a prompt is composed under a setting THE domain sections SHALL keep
    their `### ` and `#### ` headings verbatim from the file.
21. WHEN a draw runs with no setting THE premises, execute, outline, jobs,
    context and ending prompts SHALL contain no `## ` or `#### ` heading from
    any setting and the draws row SHALL have `setting` and `domains` NULL.
22. WHEN a draw runs under a setting THE seed SHALL be drawn from the theme
    bank exactly as without a setting, `seed_segments` still applying.
23. WHEN lint reads Sources THE system SHALL require at least one line and
    SHALL resolve each line's leading `reference/<file>.md` token to an
    existing file under the setting's reference directory; IF a token
    resolves to no file THEN lint SHALL report `<domain> › Sources: no file
    <token>`.
24. WHEN `fogbelt distill <id>` runs THE system SHALL lint first and, for each
    domain, for each of Mechanisms, Roles, Institutions, Instruments, Clocks,
    Places and Vocabulary whose body is `none` or contains `<!-- redraft -->`,
    make one model call per domain carrying the Frame, the section names to
    fill, and the full text of the reference files the domain's Sources name,
    and SHALL write each returned section's surviving lines under its heading,
    removing the marker.
25. WHEN `--domain <slug>` is given THE system SHALL distil that domain only;
    IF the slug matches no domain THEN THE system SHALL fail with `setting
    <id>: no domain <slug>`.
26. WHEN distill runs THE bytes of every section not `none` and not marked
    SHALL be identical before and after, and Frame and Sources SHALL never be
    written.
27. WHEN distill runs THE only file written SHALL be the setting file; the
    draws, briefs and reference directories SHALL be unchanged.
28. WHEN distill receives a Mechanisms line failing the theme validator, or,
    while masked, any line carrying a proper noun outside Institutions, THE
    system SHALL not write the line and SHALL print `<domain> › <section>:
    dropped <line prefix…> (<reasons>)`; IF every line of a section is
    dropped THEN the section SHALL be written as `none` and reported as
    `<domain> › <section>: nothing survived`.
29. IF a domain's referenced files together exceed 60,000 words THEN distill
    SHALL make no call for that domain and SHALL print `setting <id> ›
    <domain>: <n> words of reference exceeds 60000; split the domain or trim
    Sources`, continuing with the other domains.
30. WHEN a distill call is made THE steps table SHALL gain a row with stage
    `distill`, `draw_id` NULL, `story_id` equal to `setting/<id>/<slug>`, the
    prompt, the raw response, and status; WHEN the model refuses twice THE
    domain SHALL be reported as `<domain>: refusal` and left unchanged.
31. WHEN `fogbelt setting lint <id>` finds nothing THE command SHALL print
    `<id>: <n> domains, clean` and exit 0; WHEN it finds anything THE command
    SHALL print one finding per line in the `<domain> › <section>: <reason>`
    form and exit 1.
32. IF lint has findings THEN `fogbelt draw --setting <id>` SHALL print them
    and exit 1 before inserting a draws row, and `fogbelt distill <id>` SHALL
    print them and exit 1 before any model call; the UI draw form SHALL show
    the same findings as the error when it posts a setting that fails lint.
33. WHEN lint runs THE checks SHALL be exactly those in criteria 1, 2, 4, 5,
    6, 7, 8 and 23, and no others.
34. WHEN the migrated setting-a file is linted THE command SHALL report clean,
    the file SHALL carry fifteen `### ` domains with the same headings and
    frames as before, and every former theme line SHALL appear verbatim under
    its domain's `#### Mechanisms`.
35. WHEN the migration runs THE tree SHALL gain
    `sources/settings/setting-a/reference/<slug>.md` per domain holding that
    domain's former Evidence bullets verbatim, and
    `sources/settings/setting-a/reference/artifacts.md` holding the former
    Artifacts section verbatim, each with front matter `topic`, `sources`
    citing the setting file, `fetched: 2026-09-05`; the count of `[?]` marks
    across the reference files SHALL equal the count in the setting file
    before migration; every domain's Sources SHALL name its own file and
    `artifacts.md`.
36. WHEN the migrated setting-a front matter is read THE keys SHALL be `id`,
    `name`, `draw: 2`, `seed_segments: []` and THE body's `## Jobs` SHALL hold
    `- matrix: <the former front matter description>`.
37. WHEN setting-a distill runs THE command SHALL be run once per domain with
    `--domain` and each result committed after review; THE final state SHALL
    lint clean with no section `none` other than by Chris's decision.
38. WHEN the annexes are migrated THE tree SHALL hold
    `sources/settings/setting-c/reference/annex.md` and
    `sources/settings/setting-b/reference/annex.md` with the former
    bodies verbatim, and new `setting-c.md` and `setting-b.md` that
    lint clean with every domain section `none` except Frame and Sources,
    which Chris writes.
39. WHEN the draw form renders THE setting help text SHALL read `A setting
    draws two of its domains and slices its sections into each stage; hard
    rules go last.`; WHEN a draw detail renders under a setting THE view
    SHALL show the drawn domain headings.
40. WHEN the fogbelt skill is read THE text SHALL name `fogbelt distill <id>
    [--domain <slug>]`, `fogbelt setting lint <id>` and `fogbelt draw
    --domains a,b`.
41. WHEN the ideation spec is read THE Settings subsection SHALL open with
    `Superseded by 2026-09-05-typed-settings.md.`
42. WHEN `bun test app` runs after the change THE suite SHALL pass, and WHEN
    the setting-a premises prompt is composed in the test fixture with two
    domains THE prompt SHALL be under 5,000 words.

## Implementation Decisions

### File shape

```
---
id: setting-a
name: The setting-a
draw: 2
seed_segments: []
names: false
---
## Matrix
## Hard rules
## Do not build
## Open ground
## Jobs
- matrix: Close the regional element. Name the place, institution or
  instrument the story is built out of, and show that removing it removes a
  mechanism, not an image.
## Domains
### 12. Death and its administration
#### Frame
#### Mechanisms
#### Roles
#### Institutions
#### Instruments
#### Clocks
#### Places
#### Vocabulary
#### Sources
- reference/death-and-its-administration.md
- reference/artifacts.md
```

Front matter is metadata only. `names` defaults false. The domain slug is
derived from the heading, so `### 12. Death and its administration` is
`death-and-its-administration`. Section bodies are markdown; an empty one is
the line `none`. A Sources line begins with a `reference/<file>.md` token and
may continue with a URL or note after a space.

The setting module replaces the `hard_rules` heading lookup with a parser
that returns the five setting-wide bodies, the jobs as name and description
pairs, and an ordered list of domains, each with its slug, heading and nine
bodies. It grows a `slice(setting, domains, stage)` function returning the
prompt text for a stage: setting-wide sections for the stage, then each
domain's heading and loaded sections, and separately the Hard rules body.
The loading table is a constant in the setting module, one row per stage.

Rejected: one file per domain (fifteen tabs and a directory listing, for a
900-word block); a separate distilled card beside a reference (two copies
that drift); slicing by the heading names the front matter points at (every
setting would then need to tell the pipeline where its rules are).

### Prompt order

Examples, then the setting slice, then the ask, then the Hard rules. For the
outline and later stages the head (outline and vignette) precedes the slice.
Jobs from the body's Jobs section replace the front matter jobs in the
outline template and the outline section parser. Nothing negated, every
constraint positive-framed, one prompt in and one text out per step: all
unchanged.

### Draw

Domains are chosen with the pipeline's rng, uniformly without replacement,
before the seed is drawn and independent of it. `--domains` bypasses the rng.
The draws table gains a nullable `domains` TEXT column holding a JSON array
of slugs, added in a `user_version` 2→3 migration; fresh stores are stamped 3;
the Python store mirrors the version. The API and the brief's trail expose
the column. Draws made before the migration read NULL and display as
unrestricted for domains, which is what they were.

Rejected: biasing the draw toward the seed by embedding (rebuilds the
typicality the pipeline exists to break); drawing Mechanisms across all
domains (loses the frame and the domain's institutions and clocks).

### Distill

A `distill` stage in the stage table, Fable with the Opus fallback, system
line "You classify reference material into typed sections. Output only the
tags asked for." One call per domain. The prompt carries the setting's
Matrix, the domain's heading and Frame, the list of sections to fill with a
one-line definition of each (Roles are positions never identities; an
Instrument names issuer, reader and the consequence of filing late; a Clock is
an interval; Vocabulary is the setting's own word for a thing, with a gloss),
the Mechanisms shape rules from the theme prompt, the mask rule when masked,
and the referenced files' text. Output is one tag per requested section, each
holding list lines. Lines are validated as in criterion 28 and written under
the heading, replacing the body and the marker. The command runs through the
Pipeline so it records steps and shares the model adapter and refusal
handling.

The 60,000-word budget is a constant; a domain over it is refused, not
chunked. The distiller never writes Frame or Sources.

Rejected: distill proposing the domain list (the frame is the creative act);
writing to a draft file (the diff is the review); chunk-and-merge for big
domains (a domain that needs it is two domains).

### Lint

A pure function from file text and a file-existence callback to a list of
findings, each `{ domain, section, reason }` with `domain` `setting` or
`front matter` for file-level findings. The CLI, the draw command, the
distill command and the draw API call the same function. The proper-noun
check reuses the theme validator's capitalised-word rule.

### Migration

A one-off script under the extraction tooling, run once and committed with
its output, then deleted in the same change. It splits the current setting-a
file at its domain and Evidence headings, writes the reference files with
front matter, rewrites the setting file in the new shape with theme lines as
Mechanisms and `none` elsewhere, moves the Jobs line, drops `hard_rules`, and
moves each annex body to its `reference/annex.md`. Chris then writes the
annex settings' setting-wide sections, domain headings, Frames and Sources by
hand, and runs distill per domain on all three settings.

### Surfaces

The draw form help text and the draw detail view change copy and show
domains. The fogbelt skill gains the three command forms. The ideation spec's
Settings subsection gets a one-line supersession note.

## Testing Decisions

Two seams.

**Pipeline seam.** `Pipeline.start` with a scripted `FakeModel`, asserting on
`model.calls[stage].prompt`, the draws row, and the brief on disk, as
`draw.test.ts` already does for the setting-a setting. Tests use fixture
setting files in a temporary settings directory, so the Pipeline (or the
setting loader it calls) takes a settings directory option rather than reading
the tracked files. One fixture with three domains, `draw: 2`, and a fixed
rng covers criteria 11 through 22 by asserting which headings each stage's
prompt contains and does not contain and that `## Hard rules` is the last
heading. A second fixture with `names: true` covers the mask switch. Distill
tests script the `distill` stage, run the command through the Pipeline
against a fixture setting and reference directory, and assert the file bytes
after: filled sections byte-identical, marked sections rewritten, dropped
lines absent and reported, the over-budget domain untouched, the steps row
present.

**Lint seam.** The lint function on strings, one test per criterion in 33,
plus one clean fixture.

Good tests here assert prompt contents by heading and line, never by prompt
length or position arithmetic beyond "last heading". They do not test the
slicer or the front matter parser directly; a wrong slice shows up as a
wrong prompt.

Prior art: the setting tests in `draw.test.ts`; `validateTheme` tests in
`themes.test.ts`; the replay test's byte-level assertions on the theme log.

Migration is verified by running lint on the three files, by the `[?]` count
in criterion 35, and by `git diff --stat`, not by tests.

## Out of Scope

- The lore audit or any check stage reading `reference/`; the drafting
  proposal owns that and this spec only guarantees the directory and the
  Sources tokens it will read.
- Writing the Matrix, Hard rules, Do not build, Open ground, Jobs, domain
  headings and Frames for setting-c and setting-b. Chris's
  creative work; the migration leaves the slots.
- Agentic reading of the reference directory by a stage (`--tools Read,Grep`
  on a step). Deferred until outlines are seen reaching for evidence the
  slice did not carry.
- Chunk-and-merge distilling for domains over budget.
- Regenerating a filled section without the marker.
- Any change to theme drafting, verdicts, the bank or extraction.

## Open Questions

- `--seed-from setting`, taking a drawn domain's Mechanism as the seed. Agreed
  as the explicit alternative to the corpus seed; not built until a run of
  briefs shows the conjunction failing often enough to want it. Needs a
  `seed_mode` value and a table rebuild.
- The setting-b domain list. Eight were sketched for setting-c during design
  (the Administratum, the psychic tithe, the Mechanicus, the warp as shipping
  lane, the Ecclesiarchy, the Inquisition, the Militarum, the made body);
  setting-b's are Chris's to name from the 47 reference topics.
- Whether Vocabulary earns its slot. Kept on the recommendation; the first
  three distilled settings will show whether the vignettes use it.

## Further Notes

Prompt size under setting-a drops from about 31,000 words per premise or
execute call to about 3,000, and from about 250,000 input tokens per draw to
about 60,000, while the outline gains about 2,000 words of evidence it never
had. Those are estimates from the current file; criterion 42 pins the
premise call only.

The reference directories were gathered on 2026-09-05 on the `feature/raw-refs`
branch: setting-c from the Fandom wiki through the MediaWiki API, CC
BY-SA 3.0, Lexicanum being unreachable; setting-b from Wayback snapshots
of the official lore pages, the two official PDFs, and the Miraheze wiki. Each
file cites its source and licence. The repository is private and the text is
held for reference; nothing from it is quoted into a brief.
