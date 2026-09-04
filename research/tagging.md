# TAGGING — labelling prose so the labels mean something

What published work supports for the job of putting axes on prose passages:
labels that describe how a passage reads, that can be checked for coverage, and
that a second party could reproduce. Research pass 2026-09-04. Sources only —
nothing here is fitted to any particular corpus, and every figure carries the
work it came from.

---

## 1. The frameworks that already exist

### 1.1 Register dimensions — the default, and the only one with 35 years of replication

Biber factor-analysed 67 lexico-grammatical features across a
register-diversified corpus and extracted dimensions from what co-occurs. Six
dimensions, each a scale rather than a category, and a text scores on all of
them.

| dimension | positive pole | negative pole |
| :-- | :-- | :-- |
| **D1** involved vs informational | private verbs, contractions, present tense, 1st/2nd person, discourse particles | nouns, prepositions, attributive adjectives, long words |
| **D2** narrative vs non-narrative | past tense, 3rd person, perfect aspect, public verbs | context-dependent discourse markers |
| **D3** context-independent vs -dependent reference | wh-relatives, nominalisations, phrasal coordination | time and place adverbials, general adverbs |
| **D4** overt persuasion | infinitives, prediction modals, suasive verbs, conditionals | — |
| **D5** abstract vs non-abstract | conjuncts, agentless passives, past participial clauses, by-passives | — |
| **D6** on-line informational elaboration | that-complements, demonstratives, that-relatives | — |

D1 is the most replicated result in register studies; substantially the same
factor recovers across corpora and across languages.

The modern implementation is worth knowing about. **NeuroBiber** predicts 96
Biber-style features (the original 67 plus 29 later ones) at ~117,000 tokens per
second, up to 56× faster than existing open-source taggers, recovers Biber's D1
as a principal component on the CORE corpus, and scores F1 0.77 on PAN 2020
authorship verification against 0.78 for a fine-tuned RoBERTa bi-encoder. Free,
with a rule-based fallback library.

**The caveat that matters when transferring it.** The dimensions were derived to
separate *wildly* different registers — conversation from academic prose. Inside
one genre the higher dimensions may not discriminate at all. Whether they do is
an empirical question about the corpus in hand, answerable by checking the
pairwise correlations and the spread on each dimension before trusting any of
them.

> Biber, *Variation across Speech and Writing*, 1988 · Alkiek, Wegmann, Zhu &
> Jurgens, *NeuroBiber*, arXiv:2502.18590, February 2025.

### 1.2 Style embeddings — similarity without topic

A separate line learns representations of *how* text is written that are
deliberately independent of *what* it is about, trained contrastively on the
distinction "same author or just same topic." StyleDistance supervises this
directly with synthetic parallel examples varying lexis and syntax under fixed
content, and ships a benchmark of 40 content-controlled style axes; a 2026
benchmark suite now aggregates the field. Reported finding worth noting for cost
reasons: purpose-built embeddings beat LLM prompting at authorship
representation at a fraction of the compute.

Use for: "do these two passages read alike," decoupled from "are these two
passages about the same thing." Not usable for naming *what* the style is —
these are coordinates, not labels.

> Wegmann et al. 2022 · *StyleDistance*, arXiv:2410.12757 · *STEB*,
> arXiv:2606.31741.

### 1.3 Narratological axes — focalization is the one that automates

Focalization is the restriction of narrative information to what some
consciousness can access: **internal** (through a character), **external**
(observed from outside), **zero** (omniscient). It is a real axis, it is
annotatable, and it is now automatable.

Hicke et al. built 256 evaluation excerpts and 300 training samples from 16
novels. Trained human annotators reached Krippendorff α 0.55 in the first round
and 0.65 in the second. Zero-shot GPT-4o scored **F1 84.79%**, self-consistent at
α 0.94 across runs, and α 0.74 across six prompt variants. Model confidence
correlated with the cases humans found hard.

Read that table carefully, because it contains the general lesson for every
model-assigned label in this document: **the model is far more self-consistent
than the humans and no more correct.** α 0.94 against itself and 0.85 F1 against
them. Consistency is not validity — §2.2 makes the same point with a much larger
sample.

> Hicke, Bizzoni, Feldkamp & Kristensen-McLachlan, *Says Who?*, arXiv:2409.11390.

### 1.4 Appraisal — the framework for evaluative stance, and it is hard to annotate

Appraisal theory (systemic functional linguistics) decomposes evaluative
language into three systems: **Attitude** (affect, judgement, appreciation),
**Engagement** (how a text positions other voices), and **Graduation** (force —
intensity or amount; focus — prototypicality).

The annotation literature is candid that Attitude is where reliability breaks
down: identifying which spans are evaluative at all, and then sorting affect from
judgement from appreciation, is the documented difficulty. Stepwise protocols
exist specifically to contain it.

Adopt it for the vocabulary, which is better than anything ad hoc. Do not
adopt it expecting agreement to come free.

> *Annotating Evaluative Language*, ISA workshop at LREC-COLING 2024,
> aclanthology 2024.isa-1.17.

### 1.5 Sentiment and emotion arcs — a proxy, and known to be one

Valence sequences over a text are cheap and reveal structure that plot summary
does not. The critical survey literature in computational literary studies is
also clear that they measure a proxy: irony, free indirect discourse and
figurative language are exactly where the measurement degrades, and those are
not incidental features of literary prose. Transformer-based scoring improves
this over lexicon methods without removing the objection.

Usable as a coarse shape. Not usable as the ground truth for anything.

> Kim & Klinger, *A Survey on Sentiment and Emotion Analysis for Computational
> Literary Studies* · *Sentiment Analysis in Literary Studies: A Critical
> Survey*, DHQ 17.2.

---

## 2. What is known about letting a model do the labelling

### 2.1 It is competent and cheap, and its agreement is only moderate

The largest comparison of LLM and human span annotation — quality assessment,
translation error location, propaganda technique identification, 40,000+
released annotations — finds LLMs reach only *moderate* inter-annotator
agreement with humans, while making errors **at a rate similar to skilled
crowdworkers**, at a fraction of the cost per annotation.

Both halves are load-bearing. The error rate says a model annotator is not
obviously worse than the humans usually hired for this. The agreement says you
cannot treat its labels as the humans' labels.

> Kasner, Zouhar, Dušek et al., *LLMs as Span Annotators*, MME workshop 2026,
> aclanthology 2026.mme-main.1.

### 2.2 Reliability is not validity, and the usual statistics hide the gap

The largest systematic audit to date — 21 judges from 9 providers, 3 benchmarks,
118 runs, ~541,000 individual judgments — separates *consistency of output* from
*correctness of judgment* and finds them decoupled:

| finding | figure |
| :-- | :-- |
| test–retest reliability coexisting with severe position bias | >0.95 alongside >0.10 |
| worst case: near-perfect stability, highest position bias | 0.992 / 0.192 |
| exact-match accuracy overstates chance-corrected agreement | by 33–41 points |
| judge rank shift across benchmarks | up to 14 positions |
| verbosity bias, contra the 2023 literature | <0.011 correlation |

Three rules fall straight out. Report chance-corrected agreement, never exact
match. Never validate an annotator on one benchmark. And a stable annotator is
not thereby a good one — stability is the thing a broken annotator has most of.

> Norman, Rivera & Hughes, *Reliability without Validity*, arXiv:2606.19544,
> June 2026.

### 2.3 Closed label sets collapse

Given a fixed label vocabulary and an instruction to use all of it, models
concentrate predictions on a narrow subset anyway — named and benchmarked as
instruction-induced label collapse. The instruction does not fix it; it is a
property of the annotator, not of the prompt.

Practical consequence: **a label distribution is a diagnostic, not an
afterthought.** If one label carries most of the rows, the vocabulary is not
discriminating, and no amount of reading individual labels will reveal that.

> *MultiSoc-4D*, arXiv:2605.06940, May 2026.

### 2.4 There is a published procedure for deciding whether to allow it at all

Rather than arguing about it: a statistical procedure exists that determines
whether an LLM can justifiably replace human annotators *for a given task*,
along with reproducibility standards (fixed prompts, model versions, comparison
across prompts and models, released annotations) and field guidelines for
research use. The recurring recommendation is the same everywhere: label a human
sample first, compute chance-corrected agreement against it before shipping the
rubric, and re-sample periodically because the annotator drifts.

> Carlson et al., *Strategic Management Journal* 2026 · *To Err Is Human; To
> Annotate, SILICON?*, arXiv:2412.14461.

---

## 3. Disagreement is data

The perspectivist line in NLP treats annotator disagreement as signal rather
than noise, and distinguishes three things usually conflated: **disagreement**
(observable label variability), **subjectivity** (interpretive dependence on the
annotator), and **reliability** (an annotator's consistency, independent of their
stance). A shared task now runs on learning from unaggregated labels — soft label
distributions, or alignment to specific annotators' viewpoints.

The design consequence for any axis that is a matter of taste: **majority-voting
to a single label destroys precisely the information the axis exists to
capture.** Keep the distribution. Low agreement on a subjective axis is a finding
about the axis, not a defect in the annotators.

> LeWiDi-2025 at NLPerspectives, arXiv:2510.08460 · *Perspectives in Play*,
> arXiv:2506.20209.

---

## 4. If the labels exist to choose demonstrations

A common downstream use of passage labels is picking few-shot examples. The
selection literature does not say "pick the most similar ones."

- **Diversity beats similarity on hard work.** Diversity-aware selection wins on
  complex generation, on out-of-distribution queries and on the harder items
  within a task; pure top-k similarity wins on simple classification. The split
  is by task difficulty, not by preference.
- **Coverage has a formal footing.** Framing selection as conditional mutual
  information maximisation is monotone submodular, which derives diversity as a
  consequence rather than as a heuristic.
- **Correct examples can still hurt.** Task alignment of the demonstration set
  matters independently of whether the demonstrations are right.

> *The Role of Diversity in In-Context Learning*, arXiv:2505.19426 · *When
> Correct Demonstrations Hurt*, arXiv:2605.26350 · example selection via
> conditional mutual information, Springer 2026.

---

## 5. Design rules that follow

1. **Prefer scales to categories.** Every framework with a replication record
   here — register dimensions, style embeddings, graduation — is continuous.
   Invented categorical tag sets have neither a derivation nor a coverage test.
2. **Prefer deterministic features where they exist.** A counted feature costs
   nothing, does not drift, and does not need a validation sample. Spend the
   model on what cannot be counted.
3. **Validate before adopting, on the corpus in hand.** Dimensions derived to
   separate conversation from academic prose are not thereby informative within
   one genre. Check spread and inter-dimension correlation.
4. **Every model-assigned label needs three things**: a human-labelled sample
   with chance-corrected agreement against it, a usage histogram over the label
   vocabulary, and a re-check for drift.
5. **Never report exact-match agreement.** It overstates by 33–41 points.
6. **Do not aggregate away disagreement on subjective axes.**
7. **Self-consistency is not evidence of correctness.** It is compatible with
   being consistently wrong, and the largest audits find exactly that pairing.

---

## 6. Gaps

- **Nothing here validates a scheme on horror or on genre fiction.** The
  focalization work uses one novelist's corpus; the register work uses
  register-diversified reference corpora; the appraisal work uses news and
  institutional discourse.
- **No published guidance exists on how many dimensions are too many** for a
  narrow corpus, beyond "check whether they discriminate."
- **The perspectivist and the LLM-annotator literatures barely talk to each
  other.** Whether a model can be prompted to emit a *distribution* matching
  human disagreement — rather than a confident single label — is open.
- **Style embeddings are unlabelled by construction.** Nothing found this pass
  maps a point in a style space back to a term a person would use, which is what
  a legible axis requires.

---

## Sources

Biber, *Variation across Speech and Writing*, CUP 1988 ·
Alkiek, Wegmann, Zhu & Jurgens, *NeuroBiber* — https://arxiv.org/abs/2502.18590 ·
*StyleDistance* — https://arxiv.org/abs/2410.12757 ·
*STEB: Style Text Embedding Benchmark* — https://arxiv.org/abs/2606.31741 ·
Hicke, Bizzoni, Feldkamp & Kristensen-McLachlan, *Says Who? Effective Zero-Shot Annotation of Focalization* — https://arxiv.org/abs/2409.11390 ·
*Annotating Evaluative Language: Challenges and Solutions in Applying Appraisal Theory* — https://aclanthology.org/2024.isa-1.17/ ·
Kim & Klinger, *A Survey on Sentiment and Emotion Analysis for Computational Literary Studies* — https://arxiv.org/abs/1808.03137 ·
*Sentiment Analysis in Literary Studies: A Critical Survey*, DHQ 17.2 — https://www.digitalhumanities.org/dhq/vol/17/2/000691/000691.html ·
Kasner, Zouhar, Dušek et al., *LLMs as Span Annotators* — https://aclanthology.org/2026.mme-main.1/ ·
Norman, Rivera & Hughes, *Reliability without Validity* — https://arxiv.org/abs/2606.19544 ·
*MultiSoc-4D: Diagnosing Instruction-Induced Label Collapse* — https://arxiv.org/abs/2605.06940 ·
*To Err Is Human; To Annotate, SILICON?* — https://arxiv.org/abs/2412.14461 ·
Carlson et al., *The use of LLMs to annotate data in management research*, Strategic Management Journal 2026 — https://sms.onlinelibrary.wiley.com/doi/10.1002/smj.70023 ·
*LeWiDi-2025 at NLPerspectives* — https://arxiv.org/abs/2510.08460 ·
*Perspectives in Play* — https://arxiv.org/abs/2506.20209 ·
Xiao, Zhao & Huang, *The Role of Diversity in In-Context Learning* — https://arxiv.org/abs/2505.19426 ·
Qiu, Peng, Yang, Huang & Zhou, *When Correct Demonstrations Hurt* — https://arxiv.org/abs/2605.26350
