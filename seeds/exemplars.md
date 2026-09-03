# EXEMPLARS — register conditioning

*Empty. This is the harvest job, and it is the one thing in the seeding procedure that cannot be automated or delegated to a model.*

## What goes here

Passages of **prose in the target register**, 150–400 words each, verbatim, with nothing but a source line and a tag. No analysis, no framing, no explanation of what the passage demonstrates. They are loaded before a generation call and work by conditioning; a description of an effect conditions for more descriptions.

Target: six to ten passages. More is not better — the set has to fit in front of every call.

## What does not go here

- **Anything a model wrote.** Model-generated exemplars regress to exactly the mean this file exists to escape, and the failure is invisible on inspection. This is the one absolute rule.
- **Anything from `craft.md`, `catalogue.md`, playbook §2, or the `refs/summaries/` annexes.** Those are criticism and taxonomy. Conditioning on them produces more criticism and taxonomy.
- **Synopses.** A synopsis of a story in the register is not a passage in the register.

## Where to harvest from

In descending order of quality:

1. The `refs/` PDFs — the Datlow volumes, Evenson, Langan, Watts, Chiang — and the SCP articles behind the `[S]` tag. Published human prose, exact register, zero contamination.
2. Hand-written passages from `stories/`, where the prose is Chris's own. Anything model-drafted is disqualified.
3. Newly hand-written passages, only where 1 and 2 cannot cover a specific failure.

## Tagging

Each passage carries one line naming which failure it counters, so the set can be checked for coverage rather than accumulating along one axis. The failures that need covering:

- `[no-resolution]` — an ending that closes the mechanism and leaves the person inside it. The hardest to excerpt; needs its own setup.
- `[warm-mechanism]` — warmth as the instrument rather than as relief.
- `[document-working]` — an artifact doing a job rather than narrating.
- `[clinical-body]` — physical harm at sentence level in institutional register.
- `[scale]` — population-scale harm stated without escalation of tone.
- `[withheld]` — a gap with a floor under it.

## Format

```
### <source> — <work>
`[tag]`

<passage, verbatim>
```
