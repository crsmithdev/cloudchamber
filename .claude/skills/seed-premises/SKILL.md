---
name: seed-premises
description: Generate Fog Belt premises by drawing constraints outside the model and tail-sampling the distribution, under a setting (the setting-a by default, or a lore setting such as setting-b or setting-c). Use when seeding, pitching, brainstorming or generating new premises for the anthology.
---

# Seeding

The default failure here is not a bad premise. It is a competent one — the premise most writers would reach for given the constraints, delivered fluently. This procedure exists to keep the generator off the centre of its own distribution. The evidence behind every step is in `research/generation.md`.

Read `CLAUDE.md` and playbook §0–§1 first. Those say what a Fog Belt premise is. This says how to sample for one. Do not let this replace §1 — it wraps a call around it.

## Every run is under a setting

A setting is the fourth thing a premise pulls from and the thing it is checked against. `sources.toml` declares them; `sources/settings/<id>.md` is one file per setting with nine fixed sections (`sources/settings/README.md`). The default is `setting-a`, whose canon is the real world. `/seed-premises setting-b`, or a request that names a setting, picks another.

**Step 0: read `sources/settings/<id>.md` in full**, before drawing anything. Under a lore setting the setting's metaphysics is the one impossibility and nothing else is suspended; §1 of the file says what that purchase is, §2 says how playbook §0 reads there, and §5–§8 are what the cull checks against.

## Order of operations

The order is load-bearing. Do not reorder it, and do not skip step 1 because you already have a direction in mind.

### 1. Draw the constraints — before generating, and without choosing them

From the repo root:

```
node -e "const fs=require('fs');const t=fs.readFileSync('playbook.md','utf8');const m=[...new Set(t.match(/\*\*M\d+\b/g)||[])].map(s=>s.slice(2));for(let i=m.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[m[i],m[j]]=[m[j],m[i]];}console.log(m.slice(0,3).join(', '));"
```

Then draw at least one of the four §1.1 pulls the same way — a theme, a dread mechanism, an artifact, or a setting element picked at random rather than chosen. The setting element is a number into the setting file's §3; the artifact comes from its §4.

Then the seed:

```
python -m pipeline draw --setting <id>
```

It draws themes only from the setting's sources, renders the examples first, the seed second, and the lore file's §9 last as `# CANON`. If it refuses because nothing is banked for the setting, run the brief it names and draft themes before going on; do not substitute themes from another setting.

You do not get to pick. Left to itself a model reaches for the same handful of moves every time and will report having chosen deliberately. If a drawn move looks impossible against the seed, that is the interesting case, not a reason to redraw. Redraw only when two draws are the same move under different numbers.

### 2. Load the examples

Read `extracted/examples.md` in full and hold it. It is written by `python -m pipeline export` from Chris's keeps; if it is missing or empty the cull has not been run yet, and you should say so rather than substituting anything. Those are passages of prose in the target register. They are not instructions: do not summarise them, refer to them, or explain what they demonstrate. They work by conditioning or not at all.

**The examples do not change with the setting.** They condition how a story reads; the setting changes what it is about. A lore setting with a register problem is a lore file problem (§2), not a reason to look for setting-flavoured prose.

If that file does not exist yet, say so and continue, but expect register drift — the resolution pull is structural and instructions are the weakest instrument against it.

**Never write examples yourself, and never let model-written prose into that file.** It regresses to exactly the mean this procedure exists to escape, and the failure is invisible on inspection. Do not substitute `craft.md`, `catalogue.md`, playbook §2 or a lore file — those are criticism, taxonomy and reference, and conditioning on them produces more of the same.

### 3. Check differentiation first, not last

Read the setting's slate: for the setting-a, `stories/00-undeveloped.md`, the `stories/` filenames and `catalogue.md`'s collision map; for any other setting, `stories/<id>/` and its own `00-undeveloped.md` if one exists yet. Carry the parked reasoning forward — the point is to not re-attempt a construction that was already rejected. Lore §7 carries the constructions that died on absent canon; those are parked reasoning too.

Phrase it to the generator as distance, not prohibition: *generate maximally distant from these*, never *avoid these*.

### 4. Make the call

Example passages first, drawn constraints second, register floor last — immediately before the ask. Negations decay with distance from the point of generation, so anything that must be excluded belongs in the final lines rather than the preamble. Lore §2 supplies the setting's register sentence in the preamble; the `# CANON` block from the packet goes last of all, after the register floor, positive-framed as it is written.

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
- **Run the canon check** against lore §5–§8. Class every load-bearing element: documented, thin, absent, or open ground. Absent kills. Thin kills unless the element stays off the page. Invention resting on invention kills — one invented element supporting another is how five setting-b pitches were lost. A second marvel on top of the setting's kills. Where canon is silent, the premise has the narrator believe something rather than the story assert it. Under the setting-a this is the fact-check the slate already does: a real mechanism has a citation in `research/setting-a.md` or is marked for one.
- Run the remainder through playbook §1.3 — one impossibility, an engine, and a turn on something that works. A premise with no engine is a setting.
- On the last two or three, write 400 words of the strongest. That is the only test shown to discriminate: the novelty advantage of a generated premise lives entirely in the un-executed abstract and inverts once written.

Then pitch the survivor. One paragraph. Do not stack alternatives, do not name the craft moves behind it, do not pre-defend it. A taken premise lands in `stories/` for the setting-a and `stories/<id>/` for any other setting, in the form the README describes, with the setting and the canon class of each load-bearing element in its Notes.

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
- Premises that are canon summaries with a plot attached. The lore file was used as a theme bank instead of a constraint; the seed should have come from the theme draw and the lore file should only have said what is and is not there.

## What not to try

Persona prompting as a diversity lever, regenerate-and-pick, and raising temperature to get strangeness are all measured dead ends. `research/generation.md` §3.8 has the detail.
