# Four lists

Supersedes `2026-09-05-typed-settings.md` in full, and the *Settings*
subsection of `2026-09-05-drafting-pipeline.md`. Decided 2026-09-13 over a
long pass on what a domain was actually buying.

## Problem Statement

A setting carries nine typed sections per domain, and a draw takes two
domains at random. Three things are wrong with that.

The domain is a selector made before the story exists. A seed can belong to a
setting and to none of its domains — the case that opened this — and the pick
is random, so it restricts the premise stage without knowing anything about
the seed. Worse, it does not even save what it claims to: a setting-a draw
already spends 23,106 words of setting text across its eleven generation
calls, and the whole setting-a lexicon is 23,133 words. The draw pays for the
entire setting and spends it on two domains repeated eleven times.

The nine sections were cut for setting-a, a setting of civic administration,
and the contracts show it. `Instruments: documents and forms. Who issues it,
who reads it, the consequence of filing it late` is a clerk's ontology.
`Institutions: bodies` assumes the antagonist can be petitioned. A setting
whose horror is not administrative cannot fill them, so every setting has to
be a bureaucracy.

Four of the nine cannot be enumerated and do not prevent a canon violation.
Roles are infinite and derivable from a body. Clocks belong to the
instrument or the body that keeps them. Sensation is texture, not canon.
Mechanisms is forbidden to name anything — a rule inherited from the themes
bank, where a line must read with the story unavailable — so it is the one
section structurally unable to be specific to its setting.

## Solution

Four lists, uniform across every setting: **Bodies**, **Instruments**,
**Places**, **Terms**. A section earns its place only if it can be sanely
enumerated and if inventing an entry would be a canon violation. These four
pass; the other five do not.

Every entry is one line in one shape:

```
name — what it does; what it cannot do, or what follows from it
```

The second clause carries the numbers and the pressure, which is where the
cut sections relocate rather than disappear. `eight calendar days` belongs to
the certificate. `four months` belongs to the Public Administrator. A rite is
an instrument, so the bodily cost of the Chemical Baptism is its own second
clause. Roles are derived: a body that takes possession of a dead resident's
rooms implies the deputy who does the taking, and — unlike an enumerated role
list — also implies the resident.

Domains are removed entirely. The lists are setting-wide, complete on every
call that loads them, and nothing is pre-selected. `distill` becomes a
map-reduce so the lists can be rebuilt from a corpus too large for one call,
and re-cut without reading the corpus again.

## User Stories

### The setting file

1. As Chris, I want one setting file holding the setting-wide prose and four
   flat lists, so that the whole file reads in one sitting and no heading
   level exists that a draw could select on.
2. As Chris, I want every entry in the same shape whatever list it is in, so
   that reviewing a distillate is one judgement repeated rather than four.
3. As Chris, I want a list to be able to hold `none`, so that a setting that
   genuinely has no places says so instead of being padded.
4. As Chris, I want the reference tree indexed by `reference/INDEX.md` rather
   than by Sources lines inside the setting, so that the map lives beside the
   files it maps.

### Loading

5. As Chris, I want the premises call to carry every Body, so that the
   subject of the story is chosen by something that has read both the seed
   and the whole world.
6. As Chris, I want the execute and context calls to carry Instruments,
   Places and Terms, so that prose has the nouns and none of the machinery it
   cannot use.
7. As Chris, I want the outline, jobs and ending calls to carry Bodies and
   Instruments, so that custody is settled against real bodies and arithmetic
   against real numbers.
8. As Chris, I want each list to state whether it is the record or the kind,
   so that a cap chosen for token budget never silently becomes the boundary
   of the world.

### Distilling

9. As Chris, I want `distill` to read every reference file for a setting
   once, and to write candidate entries to a sidecar, so that a re-cut costs
   four calls instead of re-reading 276,000 words.
10. As Chris, I want a second pass per list that dedupes, prefers the
    specific and cuts to the cap, so that the compression is one deliberate
    editorial act I can inspect.
11. As Chris, I want an entry rejected when it names nothing this setting
    names, so that a line that could appear in another setting is never
    written.
12. As Chris, I want the run to be resumable and to run detached, so that a
    263-file pass survives a closed terminal.

### Migration

13. As Chris, I want setting-a's existing 901 distilled lines used as its
    candidate pool, so that the 2026-09-07 pass is re-cut rather than thrown
    away and its corpus is not read again.
14. As Chris, I want `--domains`, the `draws.domains` column, the domain
    chips and `claims: reference` removed in the same change, so that no
    surface still offers a knob that does nothing.

## Acceptance Criteria

1. WHEN a setting file is parsed THE system SHALL return the Matrix, the Jobs
   as name and description pairs, and four ordered lists of entries. Matrix and
   Jobs are optional; a setting may be its four lists alone.
2. IF a setting file carries a `## Domains` heading, a `### ` heading, or any
   of Hard rules, Do not build, Open ground, Frame, Mechanisms, Roles, Clocks,
   Sensation or Sources THEN lint SHALL report it as a finding naming the
   heading. A setting is reference: it states what is in the world and never
   how to write it.
3. WHEN lint runs on an entry THE system SHALL report a finding when the
   entry has no ` — ` separator, when the name is empty, when the entry
   exceeds 40 words, or when a list exceeds 40 entries.
4. WHEN lint runs on an entry THE system SHALL report a finding when the
   entry carries no proper noun, no numeral and no quoted term, since such an
   entry names nothing this setting names.
5. WHEN `slice(setting, stage)` runs THE system SHALL return the setting-wide
   sections for that stage, then each loaded list in full under its own `##`
   heading and intent line, and SHALL never return a subset of a list.
6. WHEN a draw runs under a setting THE system SHALL load: Bodies at
   premises; Instruments, Places and Terms at execute and context; Bodies and
   Instruments at outline and jobs; Bodies, Instruments and Terms at ending.
   The ask SHALL be last in every prompt.
7. WHEN `cloudchamber distill <id> --map` runs THE system SHALL create one
   `distill-map` step per reference file and append its candidate entries to
   `sources/settings/<id>/candidates.jsonl` with the file's topic as the
   entry's source, skipping files already present in the sidecar.
8. WHEN `cloudchamber distill <id> --reduce` runs THE system SHALL create one
   `distill-reduce` step per list over that list's candidates, and write the
   returned entries into the setting file in place, touching no other byte.
9. WHEN `distill` runs with neither flag THE system SHALL run the map pass
   for any file not in the sidecar, then the reduce pass for all four lists.
10. WHEN a draw is started THE system SHALL accept no `--domains` option, and
    POST /api/draws SHALL reject a `domains` key with 400.
11. WHEN the store is migrated THE system SHALL drop the `draws.domains`
    column and raise the schema version.
12. WHEN a setting declares `claims: setting` THE system SHALL verify against
    `distillate()`, which is the four lists and the setting-wide sections.
    `claims: reference` SHALL no longer be a legal value.

## Implementation Decisions

### File shape

```
---
id: setting-a
name: The setting-a
claims: setting
seed_segments: []
---
## Bodies
- Office of the Public Administrator — issues Authority for Summary
  Administration under $50,000; must petition for letters above $150,000;
  cannot distribute to beneficiaries before four months have run
## Instruments
- Certificate of death — registered by the funeral director through CA-EDRS;
  without it no permit issues and the body cannot lawfully be held past eight
  calendar days
## Places
- Office of Vital Records, 101 Grove Street, Room 105 — issues the permit
  without which nothing may be buried, burned or scattered
## Terms
- Ellis — to withdraw every unit on a parcel from rent; used as a verb
```

`draw` and `names` leave the front matter. `draw` had no meaning once domains
went. `names` masked proper nouns everywhere but Institutions and Sources,
which destroys the property that makes an entry identifiable, so the mask goes
and every list may name anything.

Open ground leaves the file: a writer's to-do list of story shapes not yet
used, not material about the world. It moves to `research/`.

**Hard rules and Do not build leave too, and Matrix and Jobs become optional.**
A setting is reference; rules are suspect in it. Tracing them on 2026-09-14
found they all descend from the retired `playbook.md`: setting-a's Matrix is
§5's preamble verbatim, and setting-b's Matrix, Hard rules and every
domain Frame are restatements of `WHAT A WRITER CAN STEAL` from an annex essay
that had been carried into its reference tree. Both annexes — 22,264 words,
`Evidence for playbook.md`, outside the provenance their own INDEX files
document — were deleted with them. setting-a now carries no prose at all: front
matter and four lists.

### Intent per list

The slice states, per list, whether it is closed or open:

```
## Bodies — the setting records these; anything else must be marked for a source
## Instruments — the setting records these; anything else must be marked for a source
## Places — the setting records these; anything else must be marked for a source
## Terms — the setting records these; anything else must be marked for a source
```

All four are closed, which is the point of the four-way cut: each is a class
a setting genuinely enumerates. People, intervals and sensations are open by
being absent — nothing lists them, so nothing constrains them, and the Hard
rules' `nothing else is invented, or is marked for a source` now applies to
exactly the four classes and to nothing else.

### Caps and budget

40 entries per list, each under 40 words, in `config.ts`. Weighted by the
loading table a draw carries Bodies ×4, Instruments ×10, Places ×7, Terms ×8.
At setting-a's measured line lengths that is about 38,000 words of setting
text per draw, against 23,106 today: 1.6×, in exchange for every list
complete on every call that loads it. The lever, if it is ever too rich, is
Instruments at ×10; dropping it from jobs and ending saves about 3,000 words.

### Distill

Two passes, because 276,000 words will not fit one call.

*Map.* One call per reference file, cheap model, prompt carrying the Matrix,
the four list definitions and the file. Output is candidate entries tagged
with the file's `topic:`. Appended to `sources/settings/<id>/candidates.jsonl`
as `{list, entry, source, file}`. A file already in the sidecar is skipped, so
the pass is resumable by re-running it.

*Reduce.* One call per list over that list's candidates, carrying the Matrix
and the cap. Output is the final entries, deduped, the specific preferred
over the generic, cut to the cap. Written into the setting file in place.

The sidecar is the point: changing a cap, a list or the house style re-runs
reduce only, four calls, no corpus read. setting-a's 901 existing lines are
loaded straight into the sidecar as candidates, so its 2026-09-07 pass is
re-cut rather than repeated.

Rejected: distilling per domain (the thing being removed); one call over the
whole corpus (does not fit for any of the three settings); writing candidates
into the setting file (two copies that drift).

### Surfaces

`--domains` and the domain chips go. `--setting` is the only setting knob.
The `draws.domains` column is dropped and the schema version raised; the
trail's `## domains` block goes with it. `claims: reference` and
`referenceText()` go, `claims: setting` and `distillate()` stay, and
`distillate()` becomes the four lists plus the setting-wide sections.
`cloudchamber help` loses the domains row and the per-setting domain list,
and gains the caps.

## Testing Decisions

The settings fixture becomes a four-list file with entries in the canonical
shape, one of which is over-long and one of which names nothing, so lint has
something to find. Draw tests assert that a stage's prompt carries a whole
list rather than any subset, and that no prompt carries a `###` heading.
Distill tests use a two-file fixture corpus and assert: the map pass writes
one sidecar line per candidate and skips a file already present; a second map
run adds nothing; the reduce pass respects the cap and rewrites only the
list's own bytes. A migration test asserts an existing draw row survives the
dropped column.

## Out of Scope

Retrieval at draw time — picking entries by the seed — stays out. The whole
point of this pass is that nothing is selected before the premise exists.
Every entry's `source` is in the sidecar, so a later retrieval step has what
it needs without another restructure.

Rebuilding any reference tree. setting-a's is domain-nested and the other two
are flat; both shapes read the same to the map pass, which walks files, not
directories.

## Open Questions

Whether setting-a's Bodies list survives the cut to 40 entries with its
character intact: it has 120 Institutions lines today and they are its best
material. If 40 proves wrong for that setting the cap is one number in
`config.ts` and a reduce re-run.
