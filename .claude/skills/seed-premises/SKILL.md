---
name: seed-premises
description: Generate Fog Belt premises by conditioning on drawn examples, seeding from the theme bank, and tail-sampling the distribution, under a setting (the setting-a by default). Use when seeding, pitching, brainstorming or generating new premises for the anthology.
---

# Seeding

The default failure here is not a bad premise. It is a competent one — the premise most writers would reach for given the seed, delivered fluently. This procedure exists to keep the generator off the centre of its own distribution. The evidence behind every step is in `research/generation.md`.

Read `CLAUDE.md` and `series.md` first. Those say what a Fog Belt premise is. This says how to sample for one, and it is now the whole workflow: the playbook that held it was retired on 2026-09-03.

## Every run is under a setting

A setting says what a premise is about; the examples say how it reads. Its material is a reference register under `sources/summaries/` — `setting-a.md` by default, or `setting-b.md` / `setting-c.md`. The register is read, not drawn from: settings stopped being a pipeline concept on 2026-09-03, when the lore files and the `# CANON` block went with the decision layer.

## Order of operations

The order is load-bearing. Do not reorder it, and do not skip step 1 because you already have a direction in mind.

### 1. Draw the seed — before generating, and without choosing it

From the repo root:

```
python -m pipeline draw
```

It renders the examples first and the seed second, immediately before the ask.

*(A second draw stood here once: a move, a dread mechanism, an artifact and a
setting element, pulled from the playbook's banks. Two of those banks were
retired on 2026-09-03 and the remaining pulls came off the same document, so
the whole notion of drawn constraints was removed the same day rather than
repointed. If constraints are wanted again they get designed again.)*

You do not get to pick. Left to itself a model reaches for the same handful of
moves every time and will report having chosen deliberately — which is the
whole reason the seed comes out of the bank rather than out of the session. If
a drawn seed looks impossible against the setting, that is the interesting
case, not a reason to redraw. Redraw only when two draws say the same thing in
different words.

### 2. Load the examples

The packet's `# REGISTER` block is the examples, drawn from the pool by `pipeline draw`. Those are passages of prose in the target register. They are not instructions: do not summarise them, refer to them, or explain what they demonstrate. They work by conditioning or not at all.

**The examples do not change with the setting.** They condition how a story reads; the setting changes what it is about. A setting whose reference register reads wrong is a problem with that file in `sources/summaries/`, not a reason to look for setting-flavoured prose.

If that file does not exist yet, say so and continue, but expect register drift — the resolution pull is structural and instructions are the weakest instrument against it.

**Never write examples yourself, and never let model-written prose into that file.** It regresses to exactly the mean this procedure exists to escape, and the failure is invisible on inspection. Do not substitute `craft.md`, `catalogue.md` or a setting file — those are criticism, taxonomy and reference, and conditioning on them produces more of the same.

### 3. Check differentiation first, not last

Read the setting's slate: for the setting-a, `stories/00-undeveloped.md`, the `stories/` filenames and `catalogue.md`'s collision map; for any other setting, `stories/<id>/` and its own `00-undeveloped.md` if one exists yet. Carry the parked reasoning forward — the point is to not re-attempt a construction that was already rejected.

Phrase it to the generator as distance, not prohibition: *generate maximally distant from these*, never *avoid these*.

### 4. Make the call

Example passages first, the seed second, register floor last — immediately before the ask. Negations decay with distance from the point of generation, so anything that must be excluded belongs in the final lines rather than the preamble. The hard rules in `sources/summaries/setting-a.md` go last of all, after the register floor, positive-framed as they are written.

Ask for a distribution, not a list:

> Generate 8 premises under the seed above. Each in a `<premise>` tag containing a `<text>` — one paragraph, the pitch itself — and a `<probability>`: your estimate of how likely this premise is as a response to this seed.
>
> Sample from the tails of the distribution. Every premise must carry a probability under 0.08. Do not include the modal response — if a premise is the one most writers would reach for given this seed, it does not belong in this batch.
>
> Every one of these ends with the programme still running and nobody released. The institution is competent, the paperwork is correct, and the narrator is warm and good at the job.

A stated ceiling matters. Without one the model reports 0.4 and calls it a tail.

**Generate all eight before reading any of them closely.** Do not develop, extend or improve the first. Reading one candidate before the others exist measurably narrows everything that follows.

### 5. Cull before showing anything

The batch is the working set, not the pitch. Chris sees one paragraph at a time and replies take-it or pass; that rule is unchanged. Cut first:

*(Four more cuts stood here until 2026-09-04: an angle test, a differentiation
flag, a canon check and the one-impossibility test. The first had no source
anywhere in the repo, the canon classes were defined in the lore files and went
with them, and the other two restated documents the run has already read. The
two below are the ones with evidence behind them; the rest were removed rather
than repaired.)*

- Drop anything at the high end of the batch's own probabilities. High confidence means near the centre whatever the premise claims about itself.
- On the last two or three, write 400 words of the strongest. That is the only test shown to discriminate: the novelty advantage of a generated premise lives entirely in the un-executed abstract and inverts once written.

Then pitch the survivor. One paragraph. Do not stack alternatives, do not name the craft moves behind it, do not pre-defend it. A taken premise lands in `stories/` for the setting-a and `stories/<id>/` for any other setting, in the form the README describes, with the setting named in its Notes.

### 6. Do not consult the evals

`research/corpus.md` is external fiction held as a standard to read against, and `research/literature.md` is the academic material behind the method. Neither enters a generation call: a generator that has read the comparison set is not being compared.

## Failure signs in a batch

Any of these means the call was shaped wrong rather than the seed being bad. Redraw and regenerate; do not repair.

- Premises pitched back as "it's not X, it's Y."
- Several premises that are one story with the setting swapped.
- Anything that resolves — the programme cancelled, the whistle blown, the institution exposed.
- Warmth used as relief rather than as the mechanism.
- A document that narrates rather than doing a job.
- Probabilities clustered near the ceiling, or absent. The model declined the shape of the call.
- Premises that are canon summaries with a plot attached. The setting register was used as a theme bank; the seed comes from the draw, and the register only says what is and is not there.

## What not to try

Persona prompting as a diversity lever, regenerate-and-pick, and raising temperature to get strangeness are all measured dead ends. `research/generation.md` §3.8 has the detail.
