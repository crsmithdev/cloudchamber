# Checking and drafting — proposal

A proposal, not a spec. It lays out the stages after a brief — checking it,
repairing it, writing the story, checking the story — with the evidence for
each choice and the decisions still open. It is written to be grilled; the
spec follows the grilling. Research is in `research/drafting.md` (new this
pass), `research/generation.md` and `research/literature.md`. The one piece
of local prior art is the pair of review passes run over the concept slate on
2026-08-28 and 2026-08-29, whose method is at `redteam.md` in commit
`24aef1e` and whose findings sit in every `stories/*.md`; its *method* is
reused below, its *content* is not an input to anything.

## Where it starts

A draw ends in `briefs/<draw>/`: the chosen 400-word vignette, an outline in
three sections (debt audit, arithmetic, custody, plus any setting job), two
context vignettes, an ending of up to 600 words, and a trail. About 2,400
words of prose and 1,000 of structure. The outline already contains two
things the checks below need: the arithmetic section is a fact ledger, and the
debt audit is a derivation whose validity can be tested.

The brief is a seed, not a story. Its vignettes were written to test whether
the structure can be executed, not to be scenes.

## The graph

```
brief → check ×N (parallel, independent)
      → rank (one call per checker: the one finding that breaks the premise)
      → GATE 1: repair | hold | pass
      → repair (re-derive one outline section or one vignette; fresh call) → check again, once
      → schedule (beats: what is known, what is withheld, when)
      → scene ×M (sequential, each a fresh call)
      → screen ×M (ledger, structure, slop; per scene)
      → GATE 2: keep | rewrite scene k | pass
      → story
      → slate (batch sameness over finished stories, outside any judge)
```

Two gates, both Chris. No model decides anything; every model output is a
finding with a quote, a derived document, or prose.

Checks run before drafting because checking is reliable on short text and
falls to chance on long text (`drafting.md` §1.1), and because a fixed
mechanism costs one outline call on a brief and eight scene calls on a
story.

## Stage 1 — check

Several checkers, each its own headless call, none seeing another's output,
all reading the same brief. Each returns findings in one shape:

```
<finding>
  <kind>fact | lore | derivation | ledger | structure | cliché | prior-art</kind>
  <quote>verbatim span from the brief</quote>
  <claim>what the brief asserts</claim>
  <what-holds>what is actually the case, or "unverifiable"</what-holds>
  <source>URL and quoted line, or "none"</source>
  <carries>premise | mechanism | detail</carries>
  <how-noticed>who would catch it</how-noticed>
  <smallest-fix>one sentence, positive form</smallest-fix>
</finding>
```

`carries` is the ranking axis, taken from the 2026-08-29 panels' own rule
("on impact rather than certainty"). Stated confidence is not asked for:
`literature.md` §3 says it is noise, and the 08-29 panels disagreed on it for
the same claim (13's 220 words a minute, certain and correct at once).
`source: none` is allowed and is what it says; a fact finding with no source
is reported as unsourced, never as certain.

The checkers:

**fact.** Extract only verifiable claims about the actual world — statute,
procedure, rate, count, date, place, named institution — from the outline and
vignettes, one extraction call; then one call per claim with web search,
returning source and quote or unverifiable (`drafting.md` §1.10, §3.4). For
a run under `setting-a` the setting's evidence and its `[?]` marks are in
scope; the setting body already says which specifics it wants confirmed.
Needs the adapter to allow search tools for this stage only (see Adapter).

**lore.** The same shape as fact, for a run under a fictional setting: the
setting body is the first authority and an allowlist of wiki domains the
second. This is the lore audit the ideation spec deferred; it is fact-check
with a different corpus, not a new stage.

**derivation.** Read the debt audit and test it: is there one impossibility,
does everything else follow from it, is there a second one wearing a
metaphor. Read the arithmetic and do the sums. This is the check the outline
step was built to make possible.

**ledger.** Extract the facts the outline settles (names, numbers, dates,
places, who holds what, who knows what) into a ledger; check each vignette
and the ending against the ledger and against each other, pairwise, with
quotes on both sides (`drafting.md` §1.2). Taxonomy: timeline, character
knowledge, world rules, factual detail, perspective. Factual and temporal
first.

**structure.** The seven binary questions from `literature.md` §4.1 —
threat, category violation, agency question, obscure-or-confused,
thickening, spectacle dependence, consequence — each with a required quote.
Reported as a profile, never summed.

**cliché.** Retrieval against the Strange Horizons and Clarkesworld lists,
stored as an enumerated file; the checker names the list entry matched and
quotes the brief. Not "is this a cliché" (`literature.md` §4.2).

**prior-art.** Name the nearest published story or film, title and author,
and state in one sentence what the brief shares with it. This is a retrieval
Chris can check, which is different from asking the model whether the brief
is original (`literature.md` §4.3).

What is not a checker: anything that reads the brief against a doctrine.
The 2026-08-28 pass produced about twenty findings per story; on review 92
were relabelled "playbook conformance" and 14 "load-bearing lens", and
eleven of twenty-four appendices recommended the same shape — one prompt
defect reported eleven times. What survived unchanged was domain and factual
findings, internal logic, prior art and sameness. Those four are the checker
list above. No checker asks whether the brief is good, frightening or
original.

**rank.** After all checkers return, one call per checker with its own
findings only: name the single finding that, unfixed, breaks the premise
rather than a detail. Feedback models produce specific local findings and
miss the biggest one unless asked for it separately (`drafting.md` §1.3).
The ranked finding from each checker is what the gate shows first.

## Gate 1

Chris sees the ranked findings, then all findings grouped by checker, each
with its quote and its smallest fix. Actions:

| action | effect |
| :-- | :-- |
| repair | chosen findings become positive constraints in a repair step |
| hold | brief stays, findings stored, nothing runs |
| pass | brief verdict `pass`, existing log |
| flag | the check call looked wrong; note; nothing runs |

Repair is chosen per finding, not per brief: a fact finding with a smallest
fix that improves the story (the 08-29 panels found several: "the record
exists because the landlord bought it") is accepted; a finding Chris
disagrees with is dismissed with a note. Dismissed findings are recorded so a
second check does not raise them again.

## Stage 2 — repair

One fresh call re-derives the outline from the chosen vignette, the seed,
and a `corrections` block holding the accepted findings' smallest fixes in
positive form ("The calendar is juvenile dependency; the reporter is
mandated by Welf. & Inst. Code §347"). The context vignettes and ending are
regenerated from the new outline as before. The chosen vignette is kept
unless a finding names it; then it is regenerated from its premise with the
corrections and the gate sees it again.

Bounded: one repair round runs automatically, followed by one more check.
A second round is Chris asking for it. Pressure inflates structure rather
than sharpening it (`generation.md` §1.6); private revision that does not
see other revisions is the shape that held diversity (`drafting.md` §1.8),
and here the only revision is the outline's.

The repaired brief is a new brief directory with `repaired_from` in the
trail, the way a redraw sets `superseded_by`.

## Stage 3 — schedule

One call derives the beat sheet from the brief: M beats, each stating its
job, what the reader knows at its end, what is still withheld and until
which beat, what is at stake, and which brief vignette if any it absorbs.
The ending is the last beat and is derived already; the schedule's work is
what stays hidden until it. This is the beat layer that closed half the
tension gap (`drafting.md` §1.4).

The schedule also fixes the axes every model converges on and a hand-drawn
choice buys something (`generation.md` §1.3): tense, person, chronology,
container form (prose, document, interleaved). The brief's ending often
implies the form (b6dd ends on a custody log); the schedule states it.

Beats are executions of the outline, not discovery. Word cap per beat is
stated. M and the total length are open (see Open Questions).

## Stage 4 — scenes

One call per beat, sequential, each a fresh subprocess. The prompt carries:
the six example passages the draw used (from the trail, so the register is
continuous with the brief), the outline, the ledger, the schedule, the full
text so far, and this beat's entry only. Nothing continues a transcript;
this is the re-anchoring the drift evidence asks for (`generation.md` §3.5,
`drafting.md` §3.5). Word cap per scene in the ask.

Parallel scenes from the schedule are the alternative: the diversity work
predicts more variety, the practitioner default predicts seams. Untested
either way (`drafting.md` §5). Sequential is proposed as the default and
parallel as an experiment the draw viewer can show side by side.

Scenes are never polished. A polish pass homogenises style and mutes voice
(`drafting.md` §1.7). The only rewrite is a scene regenerated from its beat
with a finding as a positive constraint.

## Stage 5 — screen

Per scene, after all scenes exist:

**ledger.** The scene against the ledger and against the previous scene,
same checker as Stage 1, same shape.

**structure.** Presence checks with quotes, from the features that
separate machine fiction from human fiction at 93% on structure alone
(`drafting.md` §1.5): does the narrator state the theme; is emotion rendered
as bodily sensation; does the scene resolve what the schedule said to
withhold; is the protagonist allowed to be wrong. On the last scene: does
the ending tidy everything. Flags with locations, not a score.

**slop.** Deterministic, outside any model: over-represented words, "not X
but Y", trigrams, against the passage pool as the human baseline
(`drafting.md` §1.6). Paragraph-length trend across scenes, since
fragmentation late in a draft is the known degradation. Runs like the
suspect screen: it marks, it does not judge.

## Gate 2

Chris reads the story with the screen flags beside it. Actions: keep
(verdict on the story), rewrite scene k (fresh call, the flag as a positive
constraint, then screen again), pass. A kept story is exported to a stories
directory the pipeline owns, with the brief id, the schedule and the trail;
`stories/` as it stands is the retired concept slate and is not that
directory.

## Stage 6 — slate

Over every kept story, tabulated by extraction (one call per story, quotes
required) and by regex where it can be: narrator person and gender, tense,
chronology, container form, ending shape, the closing clause's construction,
the last word. The 2026-08-29 pass found the concept slate collided on
temperature rather than premise — one narrator in twenty-three costumes,
fourteen endings of one sentence shape, "correctly" closing five, "nobody"
closing four, twelve of twenty-four relocatable to Denver without changing a
sentence — and none of that is visible from inside one story. It is a
batch-level measurement outside any judge (`literature.md` §3.8), reported
as a table, not a verdict.

Whether the twenty-four concepts join that table is an open question; the
standing rule is that nothing in `stories/` is an input or a filter.

## Adapter

- A stage may declare `tools` in `stages.toml`; the fact and lore stages
  declare web search and fetch, every other stage keeps `--tools ""`. The
  step row stores the tool list.
- The vocabulary rule holds: checkers *verify*, *cite*, *state*, *name*;
  none is asked how it reached anything. The 08-29 fact-check format
  (claim, what is actually true, how a reader would notice, smallest fix)
  is already in that vocabulary.
- Every check prompt states an output cap, as the generation prompts do.
- Judge family ≠ generator family is still wanted for every checker
  (`literature.md` §3.2) and still waits on the API path. Until then the
  checkers run on Fable against Fable's briefs, and the proposal says so on
  every findings view.

## Store, UI, skill

- New stage names on `steps`: `check-<kind>`, `rank`, `repair`, `schedule`,
  `scene`, `screen-<kind>`, `slate`. New artifact kinds: `finding`,
  `schedule`, `scene`, `story`. No schema change beyond the enum on
  `artifacts.kind`, per the ideation spec's stage-graph note.
- Verdict kinds: `brief` exists. Add `draft` for the finished story; the
  existing `story` kind is a corpus story and stays what it is. A dismissed
  finding is a verdict of kind `finding`, `pass`, with the note.
- Draw viewer: a findings pane (ranked first, then by checker, quote and fix
  on each, dismiss and accept per row); a schedule view; the story as a
  scene tree with screen flags inline; gate bars for both gates. The slate
  table is its own view.
- Skill: `fogbelt check <draw>`, `fogbelt gate <draw> repair|hold|pass`,
  `fogbelt draft <draw>`, `fogbelt story <id>`, `fogbelt slate`.

## Open Questions

For the grilling. Each has a proposed answer.

1. **Target length.** The corpus runs 3,000–8,000 words a story. Proposed:
   4,000–6,000, six to nine beats of 500–700 words. Nothing in the research
   fixes this; the beat scaffold was measured at EQ-Bench lengths.
2. **Do the brief's vignettes go into the story?** Proposed: the schedule
   decides per vignette (absorbed into a beat, or dropped). They were written
   as tests of the structure and read as scenes by accident.
3. **Sequential or parallel scenes.** Proposed: sequential by default,
   parallel as a viewer experiment. Unmeasured either way.
4. **Which checks are on by default.** Proposed: all seven on a `setting-a`
   run (fact), all seven on a lore run (lore replaces fact), five on an
   unrestricted run (no fact, no lore).
5. **Does a repair regenerate the context vignettes and ending, or only the
   outline?** Proposed: all of them, since they were derived from the
   outline and a changed outline makes them stale. Cost: three calls.
6. **The slate and the concept slate.** Do the twenty-four concepts sit in
   the sameness table so a new story is measured against them? The standing
   rule says no. Proposed: no, until the pipeline has produced enough stories
   for the table to say anything; revisit then.
7. **Fact-check sources.** Open web via the CLI's search tool, or a curated
   allowlist per setting (statutes, court rules, the setting-c and setting-b
   wikis)? Proposed: open web for `setting-a`, allowlist for lore settings,
   the list in the setting's front matter.
8. **Rewrite scope at Gate 2.** One scene at a time only, or allow "rewrite
   from scene k onward"? Proposed: one scene; the sequential draft means a
   changed scene k can invalidate k+1, so the screen re-runs on k+1 and Chris
   decides.
9. **Auto mode.** Should `--auto` run check → repair → draft unattended, and
   with what defaults at Gate 1? Proposed: auto accepts every fact finding
   with a source and every derivation finding, dismisses the rest, one repair
   round, drafts, stops at Gate 2. No model judges; the rule is mechanical.
10. **Story export.** Where kept stories live and what the file carries.
    Proposed: `stories-out/<draw>/story.md` plus `schedule.md`,
    `findings.md`, `trail.md`, tracked; name to be chosen.

## What this does not do

- Score, rank or tier a story. The gates are the only judgement.
- Ask any model whether the draft is frightening, good or original.
- A polish pass, a line edit, or any call that reads the whole story and
  improves it.
- Train or fit anything on findings or verdicts.
- Cross-family checking, until the API path exists.
