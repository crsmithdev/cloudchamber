# GENERATION — what shapes a generation call

Evidence on getting unusual, unresolved and genuinely dark premises out of a
language model. Research pass 2026-09-04. Every figure traces to the source
named beside it; where a figure came from a paper's body rather than its
abstract, or from a summary rather than the paper, it says so.

---

## 1. The mechanism

### 1.1 The collapse is trained in, not sampled in

Karouzos, Tan & Aletras traced diversity loss through post-training on OLMo 3
across three recipes, 15 tasks and four diversity metrics. The chain-of-thought
recipe loses most of its semantic diversity at supervised fine-tuning; the
broad instruct recipe loses more of it at DPO. The control that settles it:
suppressing chain-of-thought at inference dropped accuracy on hard tasks and
left answer-level diversity **unchanged**. Their conclusion — diversity collapse
is determined during training by data composition and cannot be addressed at
inference time alone.

Everything below is therefore about *which part of an already-flattened
distribution a call reaches*. No decoding knob restores what training removed,
and a document that promised otherwise would be promising the wrong thing.

> arXiv:2604.16027, April 2026.

### 1.2 Where the flattening comes from, and what survives it

Typicality bias in the preference data: annotators rating pairs prefer text that
sounds familiar, and the tuned model inherits that preference as mass piled on
the genre centre. The representation is not destroyed, only the default route to
it. Direct evidence that it survives: asking a model to verbalize a
*distribution* rather than produce a sample recovers about **66.8%** of the base
model's diversity, with no training, at every post-training stage measured.

The rule that follows is worth stating flatly. **A bland batch is evidence about
the call, not about the ceiling.** Sampling proves presence, never absence.

> Zhang, Yu, Chong, Sicilia, Tomz, Manning & Shi, *Verbalized Sampling*,
> arXiv:2510.01171 — ICML 2026 poster.

### 1.3 Different vendors are not different enough to substitute for this

Wenger & Kenett ran three divergent-thinking tests over 22 models and 102
people. Population-level variability, models against humans: alternate uses
0.459 vs 0.738, forward flow 0.534 vs 0.835, divergent association 0.665 vs
0.819, effect sizes 1.4–2.2. Jiang et al. reach the same shape from the other
side, naming intra-model repetition and inter-model homogeneity together over
26K open-ended queries with 31,250 human annotations.

A practitioner benchmark makes it concrete for fiction: ~15,347 flash stories
from 29 models, and the spread in within-model style diversity across the whole
field is 0.171 to 0.218. All of them converge on past tense at roughly 100% and
on linear chronology at 82–99%, while differing substantially on dialogue
volume and paragraphing.

That last pair of numbers is the useful one. The axes where every model agrees
are the axes worth taking away from it by hand; the axes where they already
vary need no help.

> Wenger & Kenett, arXiv:2501.19361, January 2025 · Jiang et al., *Artificial
> Hivemind*, arXiv:2510.22954, NeurIPS 2025 D&B (oral) · Mazur, *writing_styles*,
> stories generated December 2025.

### 1.4 The failure that matters here: premature resolution

Sui et al. measure narrative tension as unpredictability. At each sentence
boundary a model generates 100 candidate endings and a judge decides whether
each matches the real continuation; the fraction that do not is the *no-rate*.

| | professional fiction | top-10 LLMs |
| :-- | :-- | :-- |
| mean no-rate | 0.765 | 0.630 |
| late-stage no-rate | 0.607 | 0.215 |
| tension retained after a peak | 52% | 23% |

The late-stage row is the finding. Model stories resolve their uncertainty
early and coast; the gap at the end is nearly three-to-one. And the same
stories under a conventional creative-writing rubric score **81–84 against
professional fiction's 78.7** — the rubric ranks it backwards.

It is reachable without being asked for. Structured generation under
constraints drawn from literary theory moved one frontier model from 0.606 to
0.747, closing about half the gap.

The same bias at arc level, from a separate line of work: gradual-fall arcs are
14.6% of human narratives and 1.3% of GPT-4's; the fall-rise-fall arc 9.3%
against 1.7%; gradual-rise 4.4% of human stories against 13.0% of generated
ones. Their summary is that model stories are "homogeneously positive and lack
tension."

> Sui, Zhu, Cheng, West, So, Long & Holtzman, arXiv:2604.09854, April 2026 ·
> Tian et al., EMNLP 2024, arXiv:2407.13248 (arc percentages are body figures).

### 1.5 Negation is the wrong instrument

Instructing a model not to mention X requires internally activating X, and
under load the suppression inverts. Circuit tracing puts early layers on
suppression and middle layers on amplification. Semantic distractors produce
the strongest rebound; mere repetition the weakest. Released with a 5,000-item
negation benchmark.

> *Don't Think of the White Bear*, arXiv:2511.12381.

### 1.6 Constraints decay by turn two, and not through forgetting

DriftBench: 38 briefs with hard constraints and banned moves, 24 domains, seven
current models, 2,146 scored runs. Models restate the constraints back at
near-perfect accuracy and violate them anyway — a knows-but-violates rate of
**8% to 99%** depending on model, under identical prompts. **74% of violations
appear by turn 2.** Under pressure all seven inflate structure, from 9.7 to 14.6
methodological components. Structured checkpointing helps unevenly (55%→36% on
one model, 93%→92% on another).

Forgetting does not explain this; the recall probes rule it out. Instruction
arbitration or late-turn compliance does.

Caveat kept in view: the domain is scientific briefs, not tone. Reading it as
"a register instruction will not hold across a long session" is an inference,
and it is flagged as one in §5.

> Kruthof, arXiv:2604.28031, May 2026.

---

## 2. The ledger

| Finding | Figure | Source |
| :-- | :-- | :-- |
| Diversity collapse is fixed at training by data composition; inference-time suppression of CoT left answer diversity unchanged | — | arXiv:2604.16027 |
| Verbalized distribution vs direct prompting, creative writing, quality held | 1.6–2.1× | arXiv:2510.01171 |
| Same, share of base-model diversity recovered post-training | 66.8% | same |
| Model stories vs professional fiction, late-story unpredictability | 0.215 vs 0.607 | arXiv:2604.09854 |
| Rubric score for the same comparison — inverted against the metric | 81–84 vs 78.7 | same |
| Structured constraint-driven generation, one frontier model, mean no-rate | 0.606 → 0.747 | same |
| Gradual-fall arcs, human corpus vs GPT-4 | 14.6% vs 1.3% | arXiv:2407.13248 |
| Cross-model output variability vs human, three divergent-thinking tests | 0.46–0.67 vs 0.74–0.84 | arXiv:2501.19361 |
| Style-diversity spread across 29 models writing flash fiction | 0.171–0.218 | writing_styles |
| Unique idea combinations: default prompting / +CoT / +ordinary personas / both / humans | 83 / 152 / 193 / **248** / 197 | arXiv:2602.20408 |
| Fixation slope: default / CoT / personas alone / both / humans (higher is less fixated) | 1.013 / 1.363 / **0.876** / 1.086 / 1.035 | same |
| First-idea spread, humans vs models — the collective-knowledge gap | 9.17 vs 5.88 | same |
| Knows-but-violates rate across seven models on hard constraints | 8–99% | arXiv:2604.28031 |
| Share of constraint violations occurring by turn 2 | 74% | same |
| Best off-the-shelf LLM judge agreement with human creative preference | 73% | LitBench |
| Purpose-trained reward models on the same test set | 78% | same |
| People shown AI examples during ideation: fewer ideas, less variety, lower originality than people shown nothing | below baseline | CHI 2024, N=60 |

**The one that governs the rest** is the rubric inversion in row five. An
instrument that rates model stories above professional fiction on the axis the
project cares about is not a weak instrument, it is an inverted one. Any
scoring step that reads a premise back has to be treated as capable of
preferring exactly the wrong thing, confidently.

---

## 3. What to do, in order of return

### 3.1 Ask for a distribution with a stated ceiling

The cheapest change and the largest single effect: 1.6–2.1× diversity on
creative writing at no quality cost, and the gain is *larger* on more capable
models — not a crutch for a weak one. Ask for k responses, each with a numeric
probability, and require sampling from the tail below an explicit threshold.

Two details carry it. **A stated ceiling** — without a number the model returns
0.4 and calls it a tail. And **explicit exclusion of the modal answer**, because
"sample the tail" alone is satisfiable nominally.

Free second-order benefit: the stated probability is a triage signal. High
confidence means near the centre, whatever the premise claims about itself.

### 3.2 Batch, with reasoning, under ordinary personas — never personas alone

The cleanest result of the pass, and it corrects the usual advice twice over.
Deng, Brucks & Toubia decompose the diversity gap into two mechanisms:
**fixation** (early outputs constrain later ones) and **knowledge aggregation**
(one unified distribution where a human population has partitioned knowledge).
The second is the larger one — models are not less diverse than an individual
person, they are dramatically less diverse than a *population* of them.

Chain-of-thought decomposition addresses fixation (slope 1.013 → 1.363).
Personas address partitioning. **Personas alone make fixation worse** (0.876,
below the default). Together: 248 unique combinations against a human baseline
of 197.

And the personas that work are *ordinary* ones — a nurse, a commuter — not
famous creatives. Ordinary 210 combinations, creative-entrepreneur 164. Asking
for a visionary's voice returns the genre centre wearing a costume.

### 3.3 Stratify the directions before generating, in one planning call

Rather than generating sequentially and diversifying against what came before,
one planning call lays out broad semantic directions and generations are
allocated across them. Ibrahim, Azad & Baten find this gives the best
diversity–quality–compute frontier, beating self-, peer- and
representative-anchor regeneration. Anchored regeneration's advantage largely
disappears once full pipeline token cost is counted rather than just the
diversity of the final pool.

Stratify along the axes where models converge — tense, chronology, the shape of
closure — since those are where a hand-drawn constraint buys something (§1.3).

### 3.4 Let the candidates not see each other

Two independent lines converge here. In multi-agent ideation, Chen et al. name
**structural coupling**: interaction contracts exploration, denser communication
and larger groups converge sooner, authority-led groups produce less semantic
diversity than junior-led ones, and stronger, better-aligned models show
*diminishing marginal diversity* despite higher per-sample quality. On the human
side, people given AI suggestions during ideation produced fewer, less varied
and less original ideas than people given no inspiration at all.

So: generate the batch before reading any of it, and do not extend or develop
the first thing that comes back.

### 3.5 Say what to do; re-anchor rather than accumulate

Negation raises the salience of what it forbids (§1.5), and constraints drift
by turn two without being forgotten (§1.6). Both point the same way. Phrase
every constraint positively; keep passes short and separately anchored rather
than piling correction onto a long session; expect that adding pressure inflates
structure rather than sharpening it.

### 3.6 Constraints buy strangeness and cost coherence — pay it knowingly

Increasing constraint specificity forces a model off retold training material,
which is the point; it also degrades story quality, and models struggle to hold
instruction-following and narrative coherence together at high specificity. The
same work finds preference tuning helps a model *select* better stories from
what it has seen and does little for producing what it has not.

Two consequences. A drawn constraint that looks impossible against the seed is
the interesting case rather than a reason to redraw. And a premise generated
under heavy constraint should be read for what it *reaches*, not for how well it
reads — the polish is the part the constraint was paid for.

### 3.7 Sample enough to see a distribution; choose the model per call

Variance decomposition over 12 models × 10 prompts × 100 samples: for
originality, model choice explains 40.9% and prompt strategy 36.4%, with
within-model sampling noise at 10.6%; for sheer volume, model choice 51.3% and
prompt only 4.2%. Prompt effectiveness is model-contingent — the best prompt
depends on which model runs it. And some models are far more stable across
samples than others (rank variance 0.18 against 8.32).

A single sample per configuration measures noise. Separately, there is no
single most-diverse model: which one gives the widest spread varies by prompt
and domain enough that routing per prompt beats any fixed choice.

Pool across models for that reason — per-call fit and sampling coverage — not
because vendors disagree (§1.3).

### 3.8 Never let a model make the final cut

Best off-the-shelf judge, 73% agreement with human creative-writing preference;
purpose-trained reward models 78% on a 2,480-pair test set. Worse, models are
specifically poorly calibrated on exactly the outputs where human annotators
disagree with each other — which is the whole territory of taste. And the
rubric inversion in §1.4 shows a scoring step can rank confidently in the wrong
direction on the axis that matters.

Tiering and ordering, yes. Deciding, no.

---

## 4. What to stop doing

| | Why |
| :-- | :-- |
| One direct prompt for a batch | The single largest recoverable loss (§3.1) |
| Personas as the diversity lever | Raises fixation on its own (§3.2) |
| Famous-creative personas | Worse than ordinary ones, 164 vs 210 (§3.2) |
| Lists of what to avoid | Rebound (§1.5) |
| Long sessions accumulating correction | 74% of drift by turn 2 (§1.6) |
| Reading one candidate before the rest exist | Fixation, both sides (§3.4) |
| Trusting a rubric score | Ranks backwards on tension (§1.4) |
| Regenerate-and-pick against a model's own preference | Re-selection favours the typical; 73% ceiling (§3.8) |
| Expecting a decoding parameter to fix any of it | §1.1 |

---

## 5. Gaps

- **Nothing measures horror.** The tension work uses literary short fiction; the
  ideation work uses product ideas and research briefs. Every transfer to a
  horror premise in this document is an inference.
- **Sustaining a bleak register across a long generation is unstudied.** The
  drift evidence (§1.6) concerns hard constraints in scientific briefs. Whether
  tone drifts the same way, and whether it drifts *toward uplift* specifically,
  is unmeasured. The prediction — it does, and shorter re-anchored passes beat
  one long one — is untested.
- **Two relevant papers resisted extraction this pass.** A defixation-prompting
  evaluation framework ranks strategies against each other and its result table
  could not be read out of the PDF; a consensus-visualisation study asks whether
  showing users the modal model answer helps or harms their own diversity and
  its results likewise. Both are worth a second attempt.
- **The one study of a model steering a writer away from dark material is very
  small** — 24 scenarios, one model, three annotators who are also the authors.
  Its figures (sycophancy 91.7%, moralizing 25%, tone policing 20.8%, and
  hyper-agreeableness on sensitive topics) are a hypothesis worth testing, not
  numbers to lean on.
- **No usable practitioner account exists.** Searches for a working horror
  writer's first-person account of holding a model in an uncomfortable register
  at the ideation stage return SEO content farms. Still an open hole, not merely
  an unfound one.

---

## Sources

Karouzos, Tan & Aletras, *Where does output diversity collapse in post-training?* — https://arxiv.org/abs/2604.16027 ·
Zhang, Yu, Chong, Sicilia, Tomz, Manning & Shi, *Verbalized Sampling* — https://arxiv.org/abs/2510.01171 ·
Sui, Zhu, Cheng, West, So, Long & Holtzman, *Spoiler Alert: Narrative Forecasting as a Metric for Tension* — https://arxiv.org/abs/2604.09854 ·
Tian et al., *Are Large Language Models Capable of Generating Human-Level Narratives?*, EMNLP 2024 — https://arxiv.org/abs/2407.13248 ·
Deng, Brucks & Toubia, *Examining and Addressing Barriers to Diversity in LLM-Generated Ideas* — https://arxiv.org/abs/2602.20408 ·
Wenger & Kenett, *We're Different, We're the Same: Creative Homogeneity Across LLMs* — https://arxiv.org/abs/2501.19361 ·
Jiang et al., *Artificial Hivemind*, NeurIPS 2025 D&B — https://arxiv.org/abs/2510.22954 ·
Kruthof, *Models Recall What They Violate* (DriftBench) — https://arxiv.org/abs/2604.28031 ·
*Don't Think of the White Bear: Ironic Negation Under Cognitive Load* — https://arxiv.org/abs/2511.12381 ·
Ibrahim, Azad & Baten, *Anchorless Diversification for Parallel LLM Ideation* — https://arxiv.org/abs/2605.30150 ·
Chen et al., *Diversity Collapse in Multi-Agent LLM Systems*, ACL 2026 Findings — https://arxiv.org/abs/2604.18005 ·
Haase, Gonnermann-Müller, Hanel et al., *Within-Model vs Between-Prompt Variability* — https://arxiv.org/abs/2601.21339 (CHI 2026 EA: *It's Not Just the Prompt*) ·
Liu, Xu, Padmakumar, Ippolito & Choi, *No Single Best Model for Diversity* — https://arxiv.org/abs/2604.02319 ·
Fein, Russo, Xiang, Jolly, Rafailov & Haber, *LitBench* — https://arxiv.org/abs/2507.00769 ·
Wadinambiarachchi, Kelly, Pareek, Zhou & Velloso, *The Effects of Generative AI on Design Fixation and Divergent Thinking*, CHI 2024 — https://arxiv.org/abs/2403.11164 ·
*CS4: Measuring Creativity by Controlling the Number of Story-Writing Constraints* — https://arxiv.org/abs/2410.04197 ·
Li, Qu & Chang, *Lighting Up or Dimming Down? Dark Patterns of LLMs in Co-Creativity*, AAAI 2026 Spring Symposium — https://arxiv.org/abs/2604.04735 ·
Carichon, Sharma, Girard, Rampa & Farnadi, *IDEAFix* — https://arxiv.org/abs/2606.00875 ·
Khan & Wester, *Seeing the Hivemind* — https://arxiv.org/abs/2606.09587 ·
Dhingra, *Magic, Madness, Heaven, Sin: LLM Output Diversity* — https://arxiv.org/abs/2604.01504 ·
Mazur, *writing_styles* — https://github.com/lechmazur/writing_styles
