# Cloud Chamber

A story-ideation pipeline. A seed and six example passages become premises, one premise becomes a checked brief, and the brief becomes a draft that is judged for listening aloud.

## Corpus

**Source**:
A book or a collection of articles that stories are read from.
_Avoid_: book, input

**Story** (corpus):
One work inside a source, split out at extraction. Distinct from a draft, which the pipeline writes.
_Avoid_: text, chapter

**Passage**:
A window of a story's prose, kept verbatim, that can be shown to a model as an example.
_Avoid_: excerpt, chunk, snippet

**Example**:
A passage drawn into a draw, one of six placed in front of every generation call.
_Avoid_: shot, sample

**Facet**:
A measured stylistic dimension of a passage; the first two give its voice and its mode, and together they place it in a cell.

**Cell**:
One voice-and-mode combination; a draw takes its six examples from different cells.

**Eligible**:
Said of a passage that can be drawn: its latest verdict is not a pass and does not mark it an extraction artifact, and its story has not been passed.

**Extraction artifact**:
A passage that is debris of reading the source, such as a running head or a contents page, rather than the author's prose; marked on the verdict.
_Avoid_: junk, noise

**Theme**:
One abstract sentence stating a story's mechanism and turn, with no names; the bank of themes supplies seeds.
_Avoid_: logline, summary, premise

**Attestation**:
The number of stories a theme was drafted from.

**Narration**:
A transcript of a story told aloud on a long-form channel; the pool a draft's listenability is measured against, and the source it is judged against.
_Avoid_: reference story, podcast

## Judgement

**Verdict**:
An operator's keep or pass on one target: an example, a theme, a brief, a corpus story, a finding or a draft. The latest verdict on a target wins.
_Avoid_: rating, label, review

**Keep** / **Pass**:
The two verdicts. *Pass* means reject; it never means "succeeded".
_Avoid_: accept/reject for verdicts (accept and dismiss are finding actions)

**Verdict log**:
The append-only record of every verdict ever given; everything else about judgement is rebuilt from it.

**Inheritance**:
A verdict carried from a passage that no longer exists to the new passage that replaced it in the same story.

## Settings

**Setting**:
A fictional world a draw can be restricted to, held as five lists; a draw with no setting is **unrestricted**.
_Avoid_: world, universe, lore file

**List**:
One of a setting's five kinds of entry: bodies, events, instruments, places, terms.

**Distillate**:
Everything distilled into a setting's lists and sections, taken whole; the authority a setting's claims are checked against.

**Authority**:
What a claim is checked against: the actual world, a setting's reference material, or its distillate. A setting names at most one.

## Ideation

**Draw**:
One run of the pipeline from a seed to a brief, and every repair or draft that follows it on the same line; the unit everything else hangs from.
_Avoid_: run, job, generation

**Seed**:
The sentence a draw starts from: typed, picked from the theme bank, or drawn at random.
_Avoid_: prompt, idea

**Premise**:
One of five one-paragraph story ideas generated from the seed, each with a stated probability.
_Avoid_: pitch, concept, candidate (a candidate is a premise with its vignette)

**Stated probability**:
How typical the model says a premise is as a reading of the seed; premises are asked for inside one sampling band.

**Sampling**:
The band of stated probability the premises must come from: *tail* (strangest, the default), *off-centre*, or *standard*.

**Darkness**:
How much the story takes from its people: light, grey, dark or black.

**Shape**:
An ask added to the premises for a story told aloud; the only shape is *listen*.

**Vignette**:
A short scene in prose. The **chosen vignette** executes the premise the operator picked; the two **context vignettes** each test one thing about the outline.
_Avoid_: scene (a scene belongs to a draft), sketch

**Candidate**:
A premise together with its executed vignette, as shown at the gate.

**Gate**:
A point where the draw stops for the operator. The **gate** proper is where a candidate is chosen; **gate 1** is where findings on a brief are acted on; **gate 2** is where a draft is kept or rewritten.
_Avoid_: checkpoint, review step

**Auto**:
Said of a draw or a gate the pipeline passes by a fixed rule instead of by the operator. No model decides at a gate.

**Fork**:
A new draw made from another draw's candidate, leaving the original untouched.

## The brief

**Brief**:
The seed, the premise, the outline, the chosen vignette, the two context vignettes and the ending, taken together; what is checked and what is drafted from.
_Avoid_: plan, packet, treatment

**Outline**:
The brief's four sections: *departure* (the one thing not true of the actual world), *particulars*, *knowledge* and *arrival*.

**Departure**:
The single thing in a story that is not true of the actual world, from which everything else must follow.
_Avoid_: premise, conceit, novum

**Ending**:
The brief's last passage of prose, derived from the outline.

**Job**:
The one thing about the outline that a context vignette tests.

## Checking

**Check** / **Check pass**:
One run of every enabled checker over one brief.
_Avoid_: pass alone (a pass is a verdict)

**Checker**:
One kind of check: *derivation*, *ledger*, *claims*, *structure* or *resemblance*.

**Sample**:
One of the independent runs of a checker in a pass.

**Finding**:
One defect a checker reports: a quoted span, what it asserts, and the evidence against it.
_Avoid_: issue, error, flag (a flag is a screen's finding in a draft)

**Recurrence**:
How many of a checker's samples found the same finding; a finding is **reported** when it recurs often enough, and otherwise is **under the bar**.

**Score**:
A finding's weight, 0 to 10, from its recurrence, the checkers that agree, what it invalidates and whether it has evidence.
_Avoid_: severity, confidence

**Floor**:
The score at or above which auto repair acts on a finding.

**Invalidates**:
The outline section that would have to change if a finding stands.

**Ledger**:
The brief's settled facts, one per line, extracted once for a chain and **pinned**: every later check and every scene is held to the same ledger.
_Avoid_: fact sheet, bible, canon

**Amendment**:
A ledger line added when a finding is accepted, overriding any earlier line it disagrees with.

**Claim**:
A checkable assertion in the brief about the actual world or about the setting, verified against the authority.

**Profile**:
A checker's description of a brief that is never a finding: the structure answers and the nearest resemblance.
_Avoid_: using profile for a drafting profile outside the configuration

**Accept** / **Dismiss** / **Hold**:
The operator's actions on findings at gate 1: repair it, drop it with a note, or leave it open.

## Repair

**Repair**:
Rewriting the parts of a brief that accepted findings touch, as a new draw that points back to the one it repairs.
_Avoid_: fix, edit, revision

**Chain**:
A brief and every repair made from it, from the **root** to the **tip**.

**Round**:
One repair and the check pass that follows it, in auto repair.

**Carry**:
Taking a part of the brief into the repair unchanged, or with only its patches applied.

**Patch**:
A finding's span rewritten in place, no longer than the span, applied without a model call.

## Drafting

**Draft**:
The story the pipeline writes from a brief: a schedule, then scenes.
_Avoid_: story (a story is corpus), manuscript

**Profile** (drafting):
A named bundle of drafting settings: length, beat range, form and template.

**Form**:
A draft's tense, person, chronology and container. An axis a profile fixes cannot be changed by the schedule.

**Container**:
What the draft is presented as: prose, a document, interleaved strands, or told afterward to a listener.

**Template**:
The shape the schedule is asked for: *told*, *signal*, *listen*, or derived from the brief.

**Register**:
The block every scene ask carries about how the prose sounds: *told* or *signal*.

**Schedule**:
The draft's plan, one entry per beat: what each beat does, when it happens, what the reader knows and what is still withheld.
_Avoid_: outline (the outline is the brief's), beat sheet

**Beat**:
One unit of the schedule, written as one scene with a word cap.

**Cast**:
The three or four named people who speak, each with one habit of speech nobody else has.

**Withheld**:
What the reader is not yet told after a beat, with the beat that reveals it.

**Paying beat**:
The beat where a named person pays a cost they cannot get back.

**Absorbs**:
Said of a beat that takes its material from one of the brief's vignettes or its ending.

**Scene**:
The prose of one beat.

**Story so far**:
The scenes before a beat, which a sequential scene is written after.

## Screens

**Screen**:
A check run on a scene rather than on the brief: *ledger*, *structure*, *restated*, *slop*, *listen*.
_Avoid_: check (a check is on the brief)

**Flag**:
A finding a screen raises on a scene.

**Bound**:
Said of a scene after its ledger flags' patches are applied, before the next beat is written.

**Rewrite**:
One beat written again under constraints, then re-screened with the beat after it.
_Avoid_: regenerate, redo

**Register rewrite**:
A rewrite the pipeline makes by itself when a screen finds the beat breaks the register or a listen ceiling.

**Ceiling**:
A listen screen limit a beat must stay under: the share of long sentences, or the rate of figures.

**Slop**:
Stock phrasing a draft uses and the narration pool does not.

## Evaluation

**Panel**:
The five judges from outside the generator's model family that judge a draft.

**Pass** (judging):
One judge's reading of two texts, answering each axis and an overall call.

**Axis**:
One rubric question a judge answers: hook, presence, people, feeling, cost, ending, clarity, momentum.

**Parity**:
A draft winning or tying a narrated source in a majority of a judge's passes.

**Head to head**:
Two drafts judged against each other, half the passes in each reading order.

## Overloaded words

- **Pass**: a verdict meaning reject; a check pass; a judge's pass. Say *verdict pass*, *check pass*, *judge pass* when it is not clear.
- **Story**: a corpus story; never the draft.
- **Mode**: a draw's auto or manual; a passage's facet tercile; a seed's typed, picked or drawn. Name which.
- **Profile**: a drafting profile, or a checker's profile of a brief.
- **Flag**: a screen's finding on a scene; also the gate action that marks a draw for attention.
- **Artifact**: a stored output of a step (a premise, a vignette, a finding); also the verdict mark for an extraction artifact.
- **Withheld**: a passage held out of the pool; what a schedule keeps from the reader until a later beat.
