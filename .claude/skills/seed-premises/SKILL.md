---
name: seed-premises
description: Generate Fog Belt premises by drawing constraints outside the model and tail-sampling the distribution. Use when seeding, pitching, brainstorming or generating new premises for the anthology.
---

# Seeding

The default failure here is not a bad premise. It is a competent one — the premise most writers would reach for given the constraints, delivered fluently. This procedure exists to keep the generator off the centre of its own distribution. The evidence behind every step is in `refs/summaries/generation.md`.

Read `CLAUDE.md` and playbook §0–§1 first. Those say what a Fog Belt premise is. This says how to sample for one. Do not let this replace §1 — it wraps a call around it.

## Order of operations

The order is load-bearing. Do not reorder it, and do not skip step 1 because you already have a direction in mind.

### 1. Draw the constraints — before generating, and without choosing them

From the repo root:

```
node -e "const fs=require('fs');const t=fs.readFileSync('playbook.md','utf8');const m=[...new Set(t.match(/\*\*M\d+\./g)||[])].map(s=>s.slice(2,-1));for(let i=m.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[m[i],m[j]]=[m[j],m[i]];}console.log(m.slice(0,3).join(', '));"
```

Then draw at least one of the four §1.1 pulls the same way — a theme, dread mechanism, artifact or setting-a element picked at random rather than chosen.

You do not get to pick. Left to itself a model reaches for the same handful of moves every time and will report having chosen deliberately. If a drawn move looks impossible against the seed, that is the interesting case, not a reason to redraw. Redraw only when two draws are the same move under different numbers.

### 2. Load the exemplars

Read `seeds/exemplars.md` in full and hold it. It is written by `python -m pipeline export` from Chris's keeps; if it is missing or empty the cull has not been run yet, and you should say so rather than substituting anything. Those are passages of prose in the target register. They are not instructions: do not summarise them, refer to them, or explain what they demonstrate. They work by conditioning or not at all.

If that file does not exist yet, say so and continue, but expect register drift — the resolution pull is structural and instructions are the weakest instrument against it.

**Never write exemplars yourself, and never let model-written prose into that file.** It regresses to exactly the mean this procedure exists to escape, and the failure is invisible on inspection. Do not substitute `craft.md`, `catalogue.md` or playbook §2 — those are criticism and taxonomy, and conditioning on them produces more criticism and taxonomy.

### 3. Check differentiation first, not last

Read `stories/00-undeveloped.md` and skim `stories/` filenames and `catalogue.md`'s collision map. Carry the parked reasoning forward — the point is to not re-attempt a construction that was already rejected. This is cheaper as a constraint than as a filter.

Phrase it to the generator as distance, not prohibition: *generate maximally distant from these*, never *avoid these*.

### 4. Make the call

Exemplar passages first, drawn constraints second, register floor last — immediately before the ask. Negations decay with distance from the point of generation, so anything that must be excluded belongs in the final lines rather than the preamble.

Ask for a distribution, not a list:

> Generate 8 premises under the constraints above. Each in a `<premise>` tag containing a `<text>` — one paragraph, the pitch itself — and a `<probability>`: your estimate of how likely this premise is as a response to these constraints.
>
> Sample from the tails of the distribution. Every premise must carry a probability under 0.08. Do not include the modal response — if a premise is the one most writers would reach for given these constraints, it does not belong in this batch.
>
> Every one of these ends with the programme still running and nobody released. The institution is competent, the paperwork is correct, and the narrator is warm and good at the job.

A stated ceiling matters. Without one the model reports 0.4 and calls it a tail.

**Generate all eight before reading any of them closely.** Do not develop, extend or improve the first. Reading one candidate before the others exist measurably narrows everything that follows.

### 5. Cull before showing anything

The batch is the working set, not the pitch. Chris sees one paragraph at a time and replies take-it or pass; that rule is unchanged. Cut first:

- Drop anything at the high end of the batch's own probabilities. High confidence means near the centre whatever the premise claims about itself.
- Drop anything that fails the angle test: five readers should get five different stories out of it, and it must not be *directly about* its idea. A premise that is an essay in disguise is dead.
- Drop anything the differentiation pass flags.
- Run the remainder through playbook §1.3 — one impossibility, an engine, and a turn on something that works. A premise with no engine is a setting.
- On the last two or three, write 400 words of the strongest. That is the only test shown to discriminate: the novelty advantage of a generated premise lives entirely in the un-executed abstract and inverts once written.

Then pitch the survivor. One paragraph. Do not stack alternatives, do not name the craft moves behind it, do not pre-defend it.

### 6. Do not consult the evals

`doc/corpus.md` is external fiction held as a standard to read against, and `doc/literature.md` is the academic material behind the method. Neither enters a generation call: a generator that has read the comparison set is not being compared.

## Failure signs in a batch

Any of these means the call was shaped wrong rather than the seed being bad. Redraw and regenerate; do not repair.

- Premises pitched back as "it's not X, it's Y."
- Several premises that are one story with the setting swapped.
- Anything that resolves — the programme cancelled, the whistle blown, the institution exposed.
- Warmth used as relief rather than as the mechanism.
- A document that narrates rather than doing a job.
- Probabilities clustered near the ceiling, or absent. The model declined the shape of the call.

## What not to try

Persona prompting as a diversity lever, regenerate-and-pick, and raising temperature to get strangeness are all measured dead ends. `refs/summaries/generation.md` §3.8 has the detail.
