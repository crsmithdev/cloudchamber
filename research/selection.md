# SELECTION.md

Third stage of the seed pipeline. Drafted 2026-09-02. Still unbuilt as of 2026-09-03 — the harvest and
example-bank stages it assumed are now `pipeline/`, but nothing here is.
Companion to `pipeline/` (example sourcing, built 2026-09-02) and `research/generation.md`
(the underlying findings). Untested — this is a design, not a validated process.

## The goal, stated correctly

Not "pick the winner." The goal is **the best possible options to pick from**.
Chris makes the final cut. The machinery exists to make sure nothing good is
thrown away before he sees it.

This inverts the usual tuning target. **Optimise for recall, not precision.**
False positives cost one read. False negatives cost the story permanently.
A judge that passes 40% of a batch and never discards a good one is doing its
job. A judge that passes 10% and is occasionally right is not.

## Why a judge cannot decide

Two findings from `generation.md`, both hard limits:

1. **73% agreement.** The best available model judge matches human creative-writing
   preference 73% of the time. Adequate for binning. Not adequate for choosing.
2. **The inversion.** Model-rated novelty at pitch stage *inverts* once ideas are
   executed (−1.05 vs −0.01 for executed work). Ideas that score best as pitches
   score worst as prose. **This is the important one.** A rubric applied to a
   one-sentence premise is not measuring what it claims to measure.

Corollary: **no pitch-stage rubric substitutes for cheap partial execution.**
Judge prose. Never judge premises.

Third constraint, from §3.7: **the judge must be a different model family from
the generator.** Same-family judging measures house style, not quality.

## The loop

Four stages. Each one cheap enough to throw away.

**0. Draw.** Constraints from outside the model — institution, role, document
type, register tag, pressure. Script below. No model involvement. If a drawn
combination looks impossible, that is the interesting case; do not redraw.

**1. Generate blind.** Examples loaded as raw prose, then the drawn seed, then
verbalized sampling — five responses, stated ceiling 0.10, modal answer
explicitly excluded. Batch generated in one call without seeing prior batches.

**2. Execute the survivors.** 400 words each, in form, for the two or three that
survive the free filters. This is the step that cannot be skipped. Everything
before it is measuring the wrong object.

**3. Judge the prose.** Different model family. Three bins only:
   - `not working` — file it, do not delete it
   - `unclear` — Chris reads
   - `worth attention` — Chris reads first

No scores, no rankings, no averaging. Bins.

## Free signals (use before spending anything)

- **Stated probability.** Verbalized sampling reports a number per response.
  Anything the model rates high-confidence sits near the centre regardless of
  what it claims. Costs nothing; already in the output.
- **Surprisal.** Human professional prose runs 2.03–3.9× the token-level
  surprisal of matched model continuations. Mechanically measurable. Catches
  blandness without pretending to have taste. Does not detect quality — a high
  score is necessary, not sufficient.
- **Tag coverage.** Six register tags. If a batch skews to two, the draw is
  narrow, not the model.

## On training something

Deferred, deliberately. Fine-tuning a judge needs a few hundred labelled
preference pairs and they do not exist yet.

But they are being produced for free. **Every "that one, not those" in a session
is a labelled pair.** The only infrastructure worth building right now:

    seeds/log.jsonl   — one line per batch
      { draw, batch (with probabilities), chosen, rejected, notes, date }

Accumulate for some months of sessions. Revisit when the file is large enough to
be worth something. Building the trainer before the data exists is the same
mistake as judging the premise before the prose.

## The draw script

```python
import random, json
random.seed()

institutions = [
 "a municipal water quality lab","a biotech vivarium in Emeryville",
 "a Caltrain grade-crossing safety office","a hospice pharmacy in Daly City",
 "a semiconductor fab's chemical waste line","a public health vector control district",
 "a container terminal at the Port of Oakland","a seismic retrofit inspection unit",
 "a crematorium and mortuary transport service",
 "a clinical waste autoclave facility in Hayward",
 "a landfill methane monitoring station","an animal shelter intake ward",
 "a wastewater epidemiology sampling program","a blood bank apheresis floor",
 "a bridge painting and lead abatement crew",
]
roles = [
 "the person who signs off on the paperwork","the most junior technician",
 "the longest-serving employee","the contractor nobody employs directly",
 "the one who trains the new hires","the person being audited",
 "the night shift lone operator","the union rep",
 "the one who found the previous person's notes",
]
documents = [
 "an after-action report","a quarterly attestation",
 "a maintenance log with initials","a training manual written for the next person",
 "an incident narrative in the third person","a decommissioning checklist",
 "a set of support tickets","a deposition transcript",
 "a standard operating procedure with handwritten margin notes",
 "an insurance adjuster's file",
]
registers = ["[clinical-body]","[scale]","[document-working]",
             "[withheld]","[warm-mechanism]","[no-resolution]"]
pressures = ["disgust","malice","violence","contamination","appetite","waste"]

draw = {k: random.choice(v) for k, v in [
  ("institution", institutions), ("role", roles), ("document", documents),
  ("register", registers), ("pressure", pressures)]}
print(json.dumps(draw, indent=2))
```

Columns are extensible. The 78 numbered moves in playbook §2 should be folded in
as a sixth column when someone has ten minutes at a desk.

## Session results, 2026-09-02

Live A/B on the seed "a setting-a tech company and an ancient biblical demon."

- **Default batch:** all five collapsed to one story — modern thing is secretly
  old thing. Recommendation algorithm, legacy code, wellness app, data centre,
  founder's bargain. Five surfaces, one premise.
- **Tail batch (VS, ceiling 0.10, modal excluded):** compliance officer filing to
  a regulator dissolved in 1988; org structure redistributing a fixed quantity of
  suffering; demon as notary at a name-change service; demon as an excellent
  onboarding buddy; demon weighing hearts reassigned to e-waste triage.

**Finding worth recording: that gain came from sampling alone.** No examples
were loaded in that call. §3.1 is the cheap lever and it works unassisted;
example conditioning is a separate, unspent multiplier acting on register and
prose texture rather than premise shape.

Second run, with the SCP-2270 passage loaded, showed the predicted effect —
output stopped narrating and started behaving like an artifact.

Third run, first full draw (hospice pharmacy / union rep / third-person incident
narrative / document-working / contamination), against SCP-835's register.
Chris: interesting, not the thing. Correct outcome for a first draw.

## Note on SCP-835 as an example source

Read this session. The horror is **not** the gore — it is the redaction. The
black bars carry the load and the narrator's voice cracks around them: warm,
profane, traumatised, apologising to Bill for being unprofessional in his own
after-action report. Strong candidate for `[withheld]`, possibly `[clinical-body]`.
Passage not yet selected — needs Chris's nomination.

Source: `sources/texts/scp/scp-835.md`, ID `1YyCowr_fvLDRdZ7cMcgLNoeFyWIXdsqd`.
Dr Gears and DrClef, CC BY-SA 3.0.
