# Checking and drafting — proposal

A proposal, not a spec. It lays out the stages after a brief — checking it,
repairing it, writing the story, checking the story — with the evidence for
each choice and the decisions still open. It is written to be grilled; the
spec follows the grilling. Everything here derives from `research/drafting.md`
(new this pass), `research/generation.md` and `research/literature.md`, and
from the shape of the brief the ideation pipeline already produces. Nothing
is taken from the review passes run over the retired concept slate; that
material is not an input.

## Where it starts

A draw ends in `briefs/<draw>/`: the chosen 400-word vignette, an outline in
three sections (debt audit, arithmetic, custody, plus any setting job), two
context vignettes, an ending of up to 600 words, and a trail. About 2,400
words of prose and 1,000 of structure. Two properties of the outline do work
below: the arithmetic section is a list of settled facts, and the debt audit
is a derivation whose validity can be tested.

The brief is a seed, not a story. Its vignettes were written to test whether
the structure can be executed, not to be scenes.

## The graph

```
brief → check ×K (parallel, independent, each sampled S times)
      → GATE 1: accept findings | hold | pass
      → repair (re-derive the outline with accepted findings as constraints; fresh call) → check again, once
      → schedule (beats: what is known, what is withheld, until when; form fixed)
      → scene ×M (each a fresh call)
      → screen ×M (ledger, structure, slop; per scene)
      → GATE 2: keep | rewrite scene k | pass
      → story
      → slate (batch measurement over kept stories, outside any judge)
```

Two gates, both Chris. No model decides anything; every model output is a
finding with a quote, a derived document, or prose.

Checks run before drafting because checking is reliable on short text and
falls to chance on long text (`drafting.md` §1.1), and because a corrected
mechanism costs one outline call on a brief and M scene calls on a story.

## Configuration

Length and structure are configuration, not constants. A file
`app/pipeline/draft.toml` holds the defaults; any key can be overridden per
draw on the command line or in the UI, and the values used are written to the
trail. Named profiles bundle a set of overrides.

```toml
[length]
words = 5000            # target for the whole story
tolerance = 0.2         # stored with a warning outside ±20%

[beats]
count = "auto"          # or an integer; auto lets the schedule choose within min..max
min = 5
max = 10
words_min = 400         # per-beat cap range the schedule assigns from
words_max = 800

[form]                  # "auto" = the schedule derives it from the brief and states it
tense = "auto"          # past | present
person = "auto"         # first | second | third
chronology = "auto"     # linear | nonlinear
container = "auto"      # prose | document | interleaved
ending = "brief"        # brief: the brief's ending is the last beat; open: the schedule may re-derive it

[structure]
template = "auto"       # auto | <name under [structure.templates]> | from:<story-id>

[structure.templates.frame]
beats = ["frame, opening", "inside, first", "inside, turn", "inside, last", "frame, closing"]

[scenes]
order = "sequential"    # sequential | parallel

[checks]
enabled = ["claims", "derivation", "ledger", "structure", "resemblance"]
samples = 3             # independent runs per checker
keep_if = 2             # a finding is reported when it recurs in at least this many runs

[screens]
enabled = ["ledger", "structure", "slop"]
slop_baseline = "pool"  # the passage pool is the human baseline

[repair]
rounds = 1              # automatic rounds before the gate sees it again

[profiles.flash]
length.words = 1500
beats.count = 3

[profiles.novelette]
length.words = 12000
beats.min = 10
beats.max = 18
```

`structure.template` has three modes. `auto`: the schedule derives beats from
the brief. A named template: the beats are the template's slots, each a job
the schedule fills, the way a setting's `jobs` fill outline sections today.
`from:<story-id>`: one extra call extracts the beat structure of a corpus
story — per beat its action, technique and function — and the schedule adapts
that structure to the brief. The third mode is the warm-up stage of the
pipeline that closed half the tension gap (`drafting.md` §1.4), and it means a
Datlow story's shape can be the template for a draft without any of its text
entering a prompt.

Command line: `fogbelt draft <draw> [--profile P] [--words N] [--beats N]
[--tense T] [--person P] [--container C] [--structure S] [--order O]`, and
`fogbelt check <draw> [--checks a,b,c] [--samples N]`.

## Stage 1 — check

K checkers, each its own headless call, none seeing another's output, all
reading the same brief. Each checker runs S times independently with sampling
on; a finding is reported when it recurs in at least `keep_if` runs, matched
by overlap of the quoted span. Recurrence across independent samples is the
filter, in place of a stated confidence: judges are inconsistent with
themselves run to run and majority vote across samples is the mitigation
(`literature.md` §3.5), and a self-reported confidence is the number the
evaluation literature says to ignore (`literature.md` §3).

Every finding has one shape:

```
<finding>
  <checker>claims | derivation | ledger | structure | resemblance</checker>
  <span>verbatim quote from the brief; two quotes for a contradiction</span>
  <statement>what the span asserts, in one sentence</statement>
  <result>supported | contradicted | unverifiable | contradicts:<other span> | absent | present</result>
  <evidence>URL and quoted line, or a second quote from the brief, or none</evidence>
  <invalidates>debt audit | arithmetic | custody | <setting job> | none</invalidates>
  <replacement>a positive statement that would hold, one sentence</replacement>
</finding>
```

`invalidates` is the ranking: which outline section would have to change if
the finding stands. It is a structural question the checker answers by
pointing at the outline, not a severity it estimates. Findings are shown to
the gate ordered debt audit first, then arithmetic, custody, setting jobs,
none. `replacement` is phrased positively because the repair prompt will
carry it verbatim and negation raises the salience of what it forbids
(`generation.md` §1.5). A finding with `evidence: none` is shown as
unsupported.

A checker also returns what it examined — the list of claims extracted, the
list of facts in the ledger, the questions asked — so that an empty result is
auditable. Models are wrong most of the time when they say a text has no
problems (`drafting.md` §1.3); a checker that reports nothing has to show
what it looked at.

The checkers:

**claims.** Extract only verifiable claims about the actual world — statute,
procedure, rate, count, date, place, named institution — from the outline and
vignettes, one extraction call; then one call per claim with web search,
returning supported, contradicted or unverifiable with a source and a quoted
line (`drafting.md` §1.10). Under a fictional setting the setting body is the
first source and an allowlist of domains in the setting's front matter the
second; this is the lore audit the ideation spec deferred, as the same
checker with a different corpus. Not run on an unrestricted draw unless
enabled. Needs the adapter to allow search tools for this checker only.

**derivation.** Read the debt audit and test it against the rest of the
brief: is exactly one impossibility bought, does each assertion in the
vignettes and ending follow from it, is any assertion a second impossibility.
Read the arithmetic and do every sum. This is the check the outline was
built to make possible; its output is contradictions with two quotes.

**ledger.** Extract the facts the outline settles — names, numbers, dates,
places, who holds what, who knows what — into a ledger; then check each
vignette and the ending against the ledger and against each other,
pairwise, quoting both sides. Category-guided extraction then pairwise
contradiction with quoted evidence is the design that beat professional
readers threefold on recall (`drafting.md` §1.2). Categories, in the order
errors are most common: time (absolute, duration, order, cause), factual
detail (names, quantities, appearance), character knowledge and memory,
world rules, perspective.

**structure.** The seven binary questions the evaluation review found
answerable — threat, category violation, agency question, obscure or
confused, thickening, spectacle dependence, consequence — each with a
required quote (`literature.md` §4.1). Reported as a profile of present and
absent, never summed.

**resemblance.** Retrieval, not judgement: match the brief against an
enumerated file of overused premises (the editorial lists in
`literature.md` §4.2) and name the entry; separately name the nearest
published work, title and author, with one sentence on what is shared.
Both are checkable by Chris. Neither asks whether the brief is original,
which the judge cannot measure (`literature.md` §4.3).

No checker reads the brief against a doctrine, a house style, or another
brief. No checker asks whether the brief is good, frightening or original.

## Gate 1

Chris sees findings ordered by what they invalidate, grouped by checker,
each with its span, evidence and replacement, and each checker's examined
list behind a fold. Actions:

| action | effect |
| :-- | :-- |
| accept finding | its replacement goes into the repair constraints |
| dismiss finding | recorded with a note; a re-check does not raise it again |
| hold | brief stays, findings stored, nothing runs |
| pass | brief verdict `pass`, existing log |
| flag | the check call looked wrong; note; nothing runs |

Acceptance is per finding. When at least one is accepted, repair runs.

## Stage 2 — repair

One fresh call re-derives the outline from the chosen vignette, the seed,
and a `constraints` block holding the accepted replacements verbatim. The
context vignettes and ending are regenerated from the new outline as before.
The chosen vignette is kept unless a finding's span is inside it; then it is
regenerated from its premise with the constraints and the gate sees it
again.

Bounded: `repair.rounds` runs automatically, each followed by one check. A
further round is Chris asking for it. Accumulated pressure inflates structure
rather than sharpening it (`generation.md` §1.6); the shape that held
diversity under revision was one private revision from the original plus
feedback, never a revision of a revision (`drafting.md` §1.8). The repaired
brief is a new brief directory with `repaired_from` in the trail, as a
redraw sets `superseded_by`.

## Stage 3 — schedule

One call derives the beat sheet from the brief under the configured
`[beats]`, `[form]` and `[structure]`. Per beat: its job, its word cap, what
the reader knows at its end, what is still withheld and until which beat,
what is at stake, and which brief vignette if any it absorbs. This is the
beat layer that closed half the tension gap (`drafting.md` §1.4): tension is
a property of the information schedule, and the schedule is a document.

The schedule states tense, person, chronology and container. Where the
config says `auto` it derives them from the brief and says so; where the
config fixes them it obeys. These are the axes every model converges on
(`generation.md` §1.3) and the ones a hand-drawn choice buys most from.
With `ending = "brief"` the last beat is the brief's ending and the
schedule's work is what stays hidden until it.

## Stage 4 — scenes

One call per beat, each a fresh subprocess. The prompt carries: the six
example passages the draw used (from the trail, so the register is
continuous with the brief), the outline, the ledger, the schedule, and this
beat's entry. Under `order = "sequential"` it also carries the text so far;
under `parallel` it does not, and all M run at once. Nothing continues a
transcript; each scene is re-anchored (`generation.md` §3.5). The beat's word
cap is in the ask.

Sequential is the practitioner default and what the decomposition evidence
was measured on (`drafting.md` §1.9); parallel is what the diversity work
predicts more variety from. Unmeasured against each other (`drafting.md`
§5), which is why it is a switch and the draw viewer shows either.

Scenes are never polished. A polish pass homogenises style and mutes voice
(`drafting.md` §1.7). The only rewrite is a scene regenerated from its beat
with a finding's replacement as a constraint.

## Stage 5 — screen

Per scene, after all scenes exist, each screen its own call or its own
deterministic pass:

**ledger.** The scene against the ledger and against the previous scene:
the Stage 1 checker, same finding shape, `invalidates` pointing at the beat
instead of the outline section.

**structure.** Presence checks with quotes, drawn from the features that
separate machine fiction from human fiction on structure alone
(`drafting.md` §1.5): the narrator states the theme; emotion is rendered as
bodily sensation; the scene reveals what the schedule withholds; the
protagonist is never wrong. On the last scene: the ending resolves
everything. Flags with locations, not a score.

**slop.** Deterministic, outside any model: over-represented words, "not X
but Y" constructions and trigrams scored against `slop_baseline`
(`drafting.md` §1.6); paragraph-length trend across scenes, since
fragmentation late in a draft is the known degradation. It marks; it does
not judge.

## Gate 2

Chris reads the story with the screen flags beside it. Actions: keep
(verdict on the draft), rewrite scene k (fresh call, the flag's replacement
as a constraint, then screen k and k+1 again), pass. A kept story is
exported to a directory the pipeline owns, with the brief id, the schedule,
the configuration used and the trail. `stories/` as it stands is the retired
concept slate and is not that directory.

## Stage 6 — slate

Over every kept story, a table built by extraction and by regex, one call
per story with quotes required, never a judge asked whether stories are
alike. Columns are the dimensions the structural fingerprint work found
discriminating (`drafting.md` §1.5) and the axes models converge on
(`generation.md` §1.3): narrator person, tense, chronology, container,
whether the theme is stated, whether the ending resolves, subplot present,
protagonist wrong at any point, the closing sentence's construction, the
last word. Beside it, embedding dispersion over the stories. Sameness is a
corpus-level measurement outside any judge (`literature.md` §3.8) and this
is its table. It reports; it decides nothing.

Whether the retired concepts join the table is an open question; the
standing rule is that nothing in `stories/` is an input or a filter.

## Adapter

- A stage may declare `tools` in `stages.toml`; the claims checker declares
  web search and fetch, every other stage keeps `--tools ""`. The step row
  stores the tool list.
- The vocabulary rule holds: checkers *verify*, *cite*, *state*, *name*;
  none is asked how it reached anything.
- Every check prompt states an output cap, as the generation prompts do.
- Judge family ≠ generator family is still wanted for every checker
  (`literature.md` §3.2) and still waits on the API path. Until then the
  checkers run on Fable against Fable's briefs, and every findings view
  says so.

## Store, UI, skill

- New stage names on `steps`: `check-<checker>`, `repair`, `schedule`,
  `scene`, `screen-<screen>`, `slate`. New artifact kinds: `finding`,
  `schedule`, `scene`, `draft`. No schema change beyond the enum on
  `artifacts.kind`.
- Verdict kinds: `brief` exists. Add `draft` for the finished story; the
  existing `story` kind is a corpus story and stays what it is. A dismissed
  finding is a verdict of kind `finding`, `pass`, with the note.
- Draw viewer: a findings pane ordered by what they invalidate, accept and
  dismiss per row, examined lists behind a fold; a schedule view showing
  the form and the withholding per beat; the story as a scene tree with
  screen flags inline; gate bars for both gates; the configuration used on
  the draw. The slate table is its own view.
- Skill: `fogbelt check <draw>`, `fogbelt gate <draw> accept <finding>... |
  dismiss <finding> | hold | pass`, `fogbelt draft <draw> [overrides]`,
  `fogbelt story <id>`, `fogbelt slate`.

## Open Questions

For the grilling. Each has a proposed answer.

1. **Default length and beats.** Proposed defaults above: 5,000 words, five
   to ten beats of 400–800. The beat scaffold was measured at EQ-Bench
   prompt lengths; nothing fixes the number.
2. **Do the brief's vignettes go into the story?** Proposed: the schedule
   decides per vignette. They were written as tests of the structure.
3. **Sequential or parallel scenes by default.** Proposed: sequential.
   Unmeasured either way; the switch exists so the viewer can compare.
4. **Samples per checker.** Proposed: three, keep at two. Cost is K × S
   calls per check; with five checkers that is fifteen plus one per claim.
5. **Does a repair regenerate the context vignettes and ending, or only the
   outline?** Proposed: all of them; they were derived from the outline.
6. **The slate and the retired concepts.** Proposed: no, until the pipeline
   has produced enough stories for the table to say anything.
7. **Claims sources.** Proposed: open web under `setting-a`, an allowlist in
   the setting's front matter under a lore setting.
8. **Rewrite scope at Gate 2.** Proposed: one scene; under sequential order
   a changed scene k can invalidate k+1, so the screen re-runs on k+1 and
   Chris decides.
9. **Auto mode.** Proposed: `--auto` accepts every finding that recurs in
   all S samples and carries evidence, dismisses the rest, runs
   `repair.rounds`, drafts, and stops at Gate 2. Mechanical; no model judges.
10. **Story export.** Proposed: `drafts/<draw>/story.md` plus `schedule.md`,
    `findings.md`, `config.toml`, `trail.md`, tracked.
11. **Structure templates.** Which named templates ship, if any, and whether
    `from:<story-id>` is in the first cut. Proposed: `auto` and `from:` in
    the first cut, templates as a file Chris edits.

## What this does not do

- Score, rank or tier a story. The gates are the only judgement.
- Ask any model whether the draft is frightening, good or original.
- A polish pass, a line edit, or any call that reads the whole story and
  improves it.
- Train or fit anything on findings or verdicts.
- Cross-family checking, until the API path exists.
