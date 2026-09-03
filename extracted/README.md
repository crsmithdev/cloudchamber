# EXEMPLARS — register conditioning

*`exemplars.md` is empty until the cull runs. The pool below it is not: `pipeline harvest` fills `exemplars.jsonl` and `pipeline facets` scores it. Reading that pool down is the one thing in the seeding procedure that cannot be automated or delegated to a model.*

## What goes here

Passages of **prose in the target register**, 150–400 words each, verbatim, with nothing but a source line and its facets. No analysis, no framing, no explanation of what the passage demonstrates. They are loaded before a generation call and work by conditioning; a description of an effect conditions for more descriptions.

Target: six to ten passages. More is not better — the set has to fit in front of every call.

## What does not go here

- **Anything a model wrote.** Model-generated exemplars regress to exactly the mean this file exists to escape, and the failure is invisible on inspection. This is the one absolute rule.
- **Anything from `craft.md`, `catalogue.md`, playbook §2, or the `research/` annexes.** Those are criticism and taxonomy. Conditioning on them produces more criticism and taxonomy.
- **Synopses.** A synopsis of a story in the register is not a passage in the register.

## Where to harvest from

In descending order of quality:

1. The `sources/texts/` PDFs — the Datlow volumes, Evenson, Langan, Watts, Chiang — and the SCP articles. Published human prose, exact register, zero contamination.
2. Hand-written passages from `stories/`, where the prose is Chris's own. Anything model-drafted is disqualified.
3. Newly hand-written passages, only where 1 and 2 cannot cover a specific failure.

## Facets

Each passage carries six facets, so the set can be checked for coverage rather
than accumulating along one axis. They are not asserted; they are fitted to
the corpus by `python -m pipeline facets`, which scores every passage on
Biber's (1988) dimensions. See `pipeline/README.md` for the mechanics and
`research/tagging.md` for the evidence.

- **voice** — `informational` | `mixed` | `involved`. The informational pole
  is nouns, prepositions, nominalisation and long words: containment
  procedures, postmortem summaries, timelines. The involved pole is private
  verbs, contractions and first and second person: interviews, transcripts,
  letters.
- **mode** — `non-narrative` | `mixed` | `narrative`. The narrative pole is
  past tense, third person and perfect aspect. Live present-tense dialogue
  sits at the non-narrative pole, which is correct and worth knowing before it
  looks like a bug.
- **reference** — `situated` | `mixed` | `elaborated`. Whether the prose
  points at the situation (here, then, away) or builds its referents in the
  text (relative clauses, nominalisation).
- **persuasion** — `unpersuasive` | `moderate` | `persuasive`. Modals,
  infinitives and suasive verbs: the grammar of ordering and requiring.
- **abstraction** — `non-abstract` | `mixed` | `abstract`. Passives and
  conjuncts — process without an agent.
- **elaboration** — `unelaborated` | `moderate` | `elaborated`. That-clauses
  stacking qualification onto a claim as it is being made.

The last three have no opposite pole. Their low labels name an absence, not a
contrary.

**Only voice and mode bucket the pool** — terciles on those two give nine
cells, and `pipeline stats --target N` says which are short. The other four are
scored and filterable but do not divide the bank, because six of them would
give 729 cells.

One flag rides alongside: **`withheld`**, for redaction and elision — a gap
with a floor under it. It is a surface fact about the text, not a reading of
it, which is why it survived when the six failure tags did not.

### The six failure tags are gone

`[no-resolution]`, `[warm-mechanism]`, `[document-working]`,
`[clinical-body]`, `[scale]` and `[withheld]` were coined in one session on
2026-09-02 and grounded in nothing. They also steered the sort order, so the
first thing read was chosen by an unvalidated taxonomy. `research/tagging.md`
§1 is the replacement and the argument for it. Nothing was ever labelled under
them, so nothing was lost.

## Format

```
### <source> — <work>
`[voice/mode]`

<passage, verbatim>
```
