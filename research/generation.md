# GENERATION — what shapes the model's output before craft gets a vote

*Compiled 2026-09-02. In-house, like `setting-a.md` — written here rather than distilled from a source annex.*

**Where this sits.** `craft.md` is the human evidence behind playbook §1 and §6: how writers generate and kill premises. `research/literature.md` is the evidence behind judging, and is explicitly downstream of generation — no generator reads it. This file is the third leg and the one that was missing: what the machine does to a premise before craft has any say, and what can be done about it at the point of the call.

It does not grade anything and it is not a rubric. Playbook §1 says what to think about. This says how to sample. The two are orthogonal and both are needed: §1 run through a default generation call produces competent premises, which is the failure mode this file exists to name.

All load-bearing claims below were checked against primary sources on 2026-09-01. Where a number could not be confirmed it is marked and not used.

---

## 1. The mechanism

### 1.1 Typicality bias, not ignorance

Mode collapse originates in the *preference data*, not the algorithm and not the base model. Human annotators rating RLHF pairs systematically prefer familiar-sounding text — a documented mere-exposure effect. The tuned model inherits that preference as a concentration of probability mass on the genre centre.

The consequence is the reason any of this is actionable: **the strange material is still in the model.** What was damaged is default sampling behaviour, not representation. A bland premise is evidence about the call, not about the ceiling.

The corollary rule: sampling can prove the presence of knowledge but not its absence.

> Zhang, Yu, Chong, Sicilia, Tomz, Manning, Shi — *Verbalized Sampling*, arXiv:2510.01171

### 1.2 It is worse in tuned models, and worse in fiction

An information-theoretic comparison across 28 models against professional short fiction: human prose carries **2.03–3.9× higher token-level surprisal** and 2.76–8.82× higher perplexity than matched model continuations. The gap is wider in creative writing than in functional text. Instruction-tuned and reasoning models deviate *further* from human writing than their own base counterparts — the assistant persona is part of the problem, not the cure.

Same work: an inverted-U between entropy and judged quality. Too predictable is boring, too high-entropy is incoherent. Weirder is not monotonically better; the target zone simply sits well above the default.

> Sui, arXiv:2602.16162. Preprint, no accepted venue as of checking.

### 1.3 Temperature does not fix it

RLHF'd models can go near-deterministic — over 99% confidence on specific tokens *even at high temperature*. The collapse is in the shape of the logit distribution, not in how it is sampled. Turning the dial cannot recover a flattened tail.

The diagnostic worth keeping: an over-optimised sentiment reward model once taught a policy that describing a wedding party maximised reward, and it would abandon a story mid-telling — scene break and all — to get to one. A model swerving toward resolution mid-generation is that mechanism. A stronger instruction is not the fix.

> Janus, *Mysteries of Mode Collapse*, LessWrong 2022.

### 1.4 Why this bears on §0 specifically

The pull toward redemption, exposure and resolution is the same distributional concentration expressed as narrative shape. Which means the two properties `research/literature.md` identified as **house conventions rather than universals** — the absent impossibility and the added reckoning — are exactly the two the model will erode without being asked to. The haiku run found a reader will not supply them and will not miss them. This file says the generator will not supply them either, and will actively drift off them, and that instructions are the weakest available instrument against that drift.

---

## 2. The evidence, with numbers

| Finding | Figure | Source |
| :-- | :-- | :-- |
| Five AI story ideas raised judged novelty; AI-assisted stories grew more similar to each other | +8.1% | Doshi & Hauser, *Science Advances* 2024 |
| Ten divergent AI personas preserved story diversity vs a human-only baseline. Within one persona, cosine ≈0.92; across personas, ≈0.20 | 0.92 → 0.20 | Wan & Kalman, arXiv:2504.13868 (preprint) |
| ChatGPT users' ideas less distinct *from each other* than users of the Oblique Strategies deck. No individual-level gain | 0.24 vs 0.28 | Anderson, Shah & Kreminski, ACM C&C 2024 |
| Users felt less responsible for AI-aided ideas than card-deck-aided ideas | 48% vs 64% | same |
| LLM research ideas rated more novel than expert human ideas at pitch stage — ranking **flipped** after execution | −1.05 vs −0.01 | Si, Hashimoto & Yang, arXiv:2506.20803 |
| Exposure to one AI example raised fixation and produced fewer ideas, less variety, lower originality than no AI at all | below baseline | Wadinambiarachchi et al., CHI 2024 |
| Best of 35 prompting strategies for idea diversity was chain-of-thought decomposition; persona prompting middling | 0.255 vs human 0.243 | Meincke, Mollick & Terwiesch, arXiv:2402.01727 |
| Verbalized sampling — asking for a distribution and sampling its tail — vs direct prompting, creative writing, no quality loss | 1.6–2.1× | Zhang et al., arXiv:2510.01171 |
| Negative instruction can raise the probability of the forbidden content; worse with more intervening context | r ≈ 0.44 | Mann et al., arXiv:2511.12381 |
| Best off-the-shelf LLM judge agreement with human creative-writing preference | 73% | LitBench, arXiv:2507.00769 |
| Min-p sampling's diversity claim: significant in 1 of 12 comparisons after correction; 2–10× more tuning than its baselines | 1 / 12 | Schaeffer, Kazdan & Denisov-Blanch, arXiv:2506.13681 — **disputed, do not cite the original** |

**The one that governs the rest.** The AI novelty advantage exists only in the un-executed abstract and inverts once ideas are built. A premise that reads as novel in a list is not the same object as a premise that survives being written. No pitch-stage rubric substitutes for cheap partial execution — which is the same conclusion `research/literature.md` reaches from the judging side, arrived at independently.

**Not settled.** Two results complicate the homogenisation story rather than confirming it. A dynamic experiment with 844 participants and iterated idea chains found high AI exposure *increased* collective diversity over time and reversed a decline that occurred without AI (Ashkinaze et al., CI 2025, arXiv:2401.13481). And the persona result above shows diversity is recoverable. Honest summary: homogenisation is a property of one-shot designs where everyone sees the same suggestions, not an inevitable property of assistance.

---

## 3. What to do about it, in order of return

### 3.1 Ask for a distribution, not a list

The highest-return change and the cheapest. Verbalizing a distribution is a different task from sampling one, and instruction-tuning damaged the second far more than the first. Measured at 1.6–2.1× diversity on creative writing with no quality cost, and the gain is **larger** on more capable models — this is not a crutch for a weak one.

The paper's recommended form, verbatim:

> Generate 5 responses to the user query, each within a separate `<response>` tag. Each `<response>` must include a `<text>` and a numeric `<probability>`. Please sample at random from the tails of the distribution, such that the probability of each response is less than 0.10.

Two details make it bite. A stated ceiling — without one the model reports 0.4 and calls it a tail. And an explicit exclusion of the modal response, because "sample the tail" alone is a suggestion the model can satisfy nominally.

Second-order benefit: the stated probability is a free triage signal. High confidence means near the centre whatever the premise claims about itself.

### 3.2 Draw constraints; do not let the model choose them

Left to itself the model reaches for the same handful of moves every time, and will report having chosen deliberately. §2's seventy-eight numbered moves are already a morphological box with seventy-eight columns; what is missing is that the draw happens outside the model.

Precedent worth noticing: the Oblique Strategies deck — 1975, paper — beat ChatGPT on group-level idea distinctness in a controlled study. Randomness sourced outside the generator is doing real work there, and it is the same work here.

If a drawn move looks impossible against the seed, that is the interesting case rather than a reason to redraw.

### 3.3 Condition register with examples, never with instructions

The pull toward resolution is structural (§1.4). Instructions are the weakest instrument against it; hand-written examples are the strongest documented one. Three rules, all load-bearing:

- **Never model-written.** Model-generated examples regress to exactly the mean the technique exists to escape, and the failure is invisible on inspection.
- **Strongest last.** Recency carries disproportionate behavioural weight in a few-shot set.
- **Match the input's tone to the examples'**, or the model treats them as decoration.

Independent convergence: examples that visibly diverge *from each other* also pull a model out of a collapsed mode, by showing it live evidence that its one-true-answer assumption is wrong. So they do two jobs — set register, break collapse.

**A caution specific to this repo.** `craft.md`, `catalogue.md` and playbook §2 are *criticism and taxonomy*. Few-shot conditioning acts on form, so feeding those in as examples conditions the model to produce more criticism and taxonomy — more named moves, more confident craft-talk. That is a thing an LLM is already too good at, and a plausible explanation for generated premises that read as competent rather than disturbing. The example slot wants 150–400 words of prose that simply *is* the register, with no framing.

The corpus for that already exists in `refs/` — the Datlow volumes, Evenson, Langan, Watts, Chiang — plus the SCP material behind the `[S]` tag. Harvesting it is a passage-extraction job, not a writing job. **Nothing distilled or summarised is a substitute**, which is the same distinction `research/literature.md` draws when it keeps `CORPUS.md` out of `refs/`.

Open problem, flagged rather than papered over: nobody has documented a technique for *sustaining* bleakness across a long context. Since rebound worsens with intervening context and the sentiment pull is structural, drift toward uplift probably gets worse over a long run — which argues for shorter separately re-anchored passes. Untested.

### 3.4 Move the negations, and change their shape

Instructing a model not to produce something can make it more probable, and the effect worsens with distance between the prohibition and the point of generation. `CLAUDE.md`'s *"Avoid the conventional"* and *"No comedy, and nothing heartwarming"* are the worst configuration available: blanket negation, top of a long file, maximum distance from the ask.

- Positive-frame where possible. *"Every one of these ends with the programme still running and nobody released"* states the same constraint as a thing to hit.
- Restate anything genuinely excluded in the final lines before generating, not in the preamble.
- Prefer earned exclusions — have the model produce its defaults, state why they are weak, then generate against that reasoning — to a-priori prohibition.
- Convert `stories/00-undeveloped.md` and the collision map from *avoid these* to *generate maximally distant from these*. Distance is a computation; avoidance is a suppression task the model is bad at.
- Accept the ceiling. Banning the top five clichés moves mass to the sixth-most-typical option, not out to the tail. Exclusion is hygiene; the distribution is the lever.

### 3.5 Generate the batch blind

Reading one candidate closely before the others exist measurably narrows everything downstream — the CHI result is that AI-exposed participants produced *fewer, less varied, less original* ideas than participants shown nothing. Generate the full batch before evaluating any of it, and do not develop or extend the first.

This reconciles cleanly with the house rule of one pitch at a time: the batch is the generator's working set, not the pitch. §1.11 is unchanged.

### 3.6 Form as an end-run around the resolution reflex

The most underused technique found, and the one closest to what §4 already does. Ask for the artifact that *implies* a story rather than the story: a review of a book that does not exist, a containment report, a decommissioning schedule, an adjuster's file. These registers carry no narrative expectation — the model pattern-matches *report*, not *story*, and the schema holding the resolution reflex never fires. Reports do not have endings in the way stories do.

Caveat with evidence behind it: the one careful experiment feeding cut-up found text to a commercial model reported it **constantly smoothed** — inserting conjunctions, repairing transitions, refusing broken grammar. Its coherence drive fights collage. Cut outside the model, and forbid it explicitly from resolving a document into a satisfying whole.

Note this collides with §4's standing caution that document-as-monster is at or near capacity. The point here is the *generation-side* benefit of the register, which survives even where the finished story does not use a document at all — *Second Circulation* is the existing proof.

### 3.7 Pool across model families, not personas

One persona generates at cosine ≈0.92 with itself; persona prompting ranked among the *weaker* of 35 tested strategies. Three vendors on one seed beats three characters on one model. Pooling is also what `research/literature.md` already requires on the judging side for a different reason — judge model must differ from generator model.

### 3.8 What to stop doing

- **Persona prompting as a diversity lever.** Middling in the only systematic comparison.
- **Best-of-N / regenerate-and-pick.** Re-selection systematically favours the most typical-sounding completion. It is an anti-technique here.
- **Raising temperature to get strangeness.** §1.3.
- **Citing min-p.** The result failed reanalysis.
- **Letting a model make the final cut.** 73% agreement with human preference. Tiering, yes; deciding, no — the same conclusion `evals/` reaches independently.

---

## 4. What this implies for playbook §1 — proposed, not applied

Nothing in the playbook has been edited. Recorded here for a deliberate decision:

1. **§1.1 gains a draw.** The pull from §2–§5 currently lets whoever is generating choose. Drawing at least one of the four at random, outside the model, is the §3.2 change and it is small.
2. **§1.9–1.10 gain a batch.** Steps 9 and 10 assume one premise. The batch-blind discipline of §3.5 sits between 8 and 9.
3. **A new pre-step 0: load examples.** Requires `extracted/examples.md`, which does not exist yet.
4. **`CLAUDE.md`'s register paragraph wants rewriting per §3.4** — same constraints, positive form, and restated at the point of generation rather than only at the top of the file.
5. **§1.10's read-back is the right place for a 400-word partial execution** on anything that survives, per the ideation–execution result.

The procedure that follows from all of this is implemented as a skill at `.claude/skills/seed-premises/SKILL.md`. It does not modify the playbook; it wraps a call around it.

---

## 5. Coverage gaps

- Reddit was unreachable throughout the research pass; a meaningful share of practitioner discourse plausibly lives there and is unrepresented.
- science.org and several ACM pages blocked automated access; a small number of figures come from secondary sources and are marked above.
- A frequently-quoted Doshi & Hauser figure — 5.4% novelty gain in the single-idea condition — could not be confirmed and appears to be a conflation with a similarity metric. It is deliberately absent.
- No first-person account by a working horror writer of holding a model in an uncomfortable register at the *ideation* stage exists in the public record as of September 2026. Neither does a published kill-test that preserves why an idea died, nor a morphological premise generator. These are open, not merely unfound.

## Sources

Zhang et al., *Verbalized Sampling* — https://arxiv.org/abs/2510.01171 ·
Doshi & Hauser — https://www.science.org/doi/10.1126/sciadv.adn5290 ·
Anderson, Shah & Kreminski — https://arxiv.org/abs/2402.01536 ·
Si, Hashimoto & Yang, *Ideation–Execution Gap* — https://arxiv.org/abs/2506.20803 ·
Wadinambiarachchi et al., CHI 2024 — https://arxiv.org/abs/2403.11164 ·
Meincke, Mollick & Terwiesch — https://arxiv.org/abs/2402.01727 ·
Mann et al., *Don't Think of the White Bear* — https://arxiv.org/abs/2511.12381 ·
Sui — https://arxiv.org/abs/2602.16162 ·
Wan & Kalman — https://arxiv.org/abs/2504.13868 ·
Ashkinaze et al. — https://arxiv.org/abs/2401.13481 ·
Fein et al., LitBench — https://arxiv.org/abs/2507.00769 ·
Schaeffer, Kazdan & Denisov-Blanch — https://arxiv.org/abs/2506.13681 ·
Kirk et al., RLHF and diversity — https://arxiv.org/abs/2310.06452 ·
Guo et al., *From Pen to Prompt* — https://arxiv.org/abs/2411.03137 ·
Reza et al., *Co-Writing with AI, on Human Terms* — https://arxiv.org/abs/2504.12488 ·
Janus, *Mysteries of Mode Collapse* — https://www.lesswrong.com/posts/t9svvNPNmFf5Qa3TA/mysteries-of-mode-collapse ·
Gwern, *Towards Better LLM Creative Writing* — https://gwern.net/blog/2025/better-llm-writing ·
Sorrentino, *How LLMs Set My Fiction Free* — https://yalereview.org/article/christopher-sorrentino-machine-stories ·
*The Five Jobs I Would Actually Give an AI Co-Writer* — https://artisanosalpha.substack.com/p/fiction-writing-with-llms-the-five ·
Vollmer, *A Field Guide to AI Tells* — https://matthewvollmer.substack.com/p/i-asked-the-machine-to-tell-on-itself ·
*Add More Darkness* — https://promptingweekly.substack.com/p/add-more-darkness-how-to-knock-the ·
*Experiments in Generating Cut-up Texts with Commercial AI* — https://electronicbookreview.com/essay/experiments-in-generating-cut-up-texts-with-commercial-ai ·
Brander, *Generating your own Oblique Strategies* — https://newsletter.squishy.computer/p/prompt-generator
