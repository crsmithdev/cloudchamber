# TAGGING — established practice for classifying passages

*What the literature actually offers for the job `extracted/` does: labelling
prose passages along axes that (a) describe how they read and (b) can be
checked for coverage. Compiled 2026-09-03. The six failure tags currently in
`pipeline/signals.py` were coined in one session on 2026-09-02 and are grounded
in nothing below; this document is the alternative.*

---

## 1. Biber's Multi-Dimensional Analysis — the standard framework

The established empirical method for exactly this problem. Biber (1988,
*Variation across Speech and Writing*) factor-analysed 67 linguistic features
across a register-diversified corpus and extracted six dimensions. Features
that co-occur define a dimension; a text scores on each.

| dimension | positive pole | negative pole |
| :-- | :-- | :-- |
| **D1 Involved vs Informational** | private verbs, contractions, present tense, 1st/2nd person, discourse particles | nouns, prepositions, attributive adjectives, long words |
| **D2 Narrative vs Non-narrative** | past tense, 3rd person, perfect aspect, public verbs | context-dependent discourse markers |
| **D3 Context-independent vs -dependent reference** | wh-relatives, nominalisations, phrasal coordination | time/place adverbials, general adverbs |
| **D4 Overt persuasion** | infinitives, prediction modals, suasive verbs, conditionals, necessity modals | — |
| **D5 Abstract vs Non-abstract** | conjuncts, agentless passives, past participial clauses, by-passives | — |
| **D6 On-line informational elaboration** | that-clauses as complements, demonstratives, that-relatives | — |

**This reproduced in the Fog Belt corpus.** Running a PCA over grammatical
features (pronoun person, tense, nominalisation, passives, sentence variance —
chosen *not* to match the six tags, so the test is not circular) across 944 SCP
passages gives a first dimension at 25% of variance loading on first/second
person and short words against nominalisation, prepositions and long words.
That is D1. The third dimension — third person, connectives, progressives
against necessity modals — is D2. D1 is the most robust and most replicated
finding in register studies; getting it out of this corpus is a good sign that
the method transfers.

**Caveat worth holding.** Biber's dimensions were derived to separate *wildly*
different registers — conversation from academic prose. Fog Belt's corpus is
narrow by comparison. D1 clearly still discriminates here; D3–D6 may not.

### Tooling, all free

- **MAT (Multidimensional Analysis Tagger)**, Nini — replicates Biber's tagger,
  computes all six dimension scores, and assigns each text to one of Biber's
  eight text types. Implements the same 67 features.
- **BiberPlus / Neurobiber**, Jurgens et al. (arXiv 2502.18590) — `pip install
  biberplus`, plus a transformer that predicts **96 Biber-style features** at
  ~117k tokens/sec, macro-F1 0.97. On authorship verification it matches a
  fine-tuned bi-encoder (F1 0.77 vs 0.78) while staying interpretable.
- **pybiber** (browndw), **biberpy** (ssharoff) — alternative implementations.

*Neither pip nor the Cowork VM could reach PyPI when this was written (proxy
403). Install from your own terminal.*

---

## 2. Genette's focalization — for "who is speaking"

Narratology's standard answer to the voice question, and the one axis where an
LLM annotator is demonstrably good enough.

- **internal** — from a character's perspective; their thoughts and knowledge
- **external** — an outside narrator; actions, behaviours, settings only
- **zero** — omniscient, from every perspective

*Says Who? Effective Zero-Shot Annotation of Focalization* (arXiv 2409.11390)
reports GPT-4o at **F1 84.8%** against human consensus, self-consistent at
α=0.94 and robust to prompt variation at α=0.74. The number that matters more:
**trained human annotators only reach Krippendorff's α of 0.55–0.65** on this
task. Focalization is genuinely hard and genuinely fuzzy, and a model matching
human consensus is matching a noisy target. Use it, but do not expect a clean
partition.

---

## 3. Appraisal theory — for stance and evaluation

Martin & White (2005), *The Language of Evaluation*. Three systems: **attitude**
(affect, judgement, appreciation), **engagement** (how other voices are
admitted), **graduation** (force and focus — turning evaluation up or down).

This is the established scheme for what `warm-mechanism` was reaching at:
warmth as an evaluative stance laid over harm. Graduation in particular is
close to the flatness signal already in `signals.py`.

**Recommend against adopting it.** Reliable appraisal annotation is notoriously
difficult — there is a whole ACL workshop paper on the challenges
(aclanthology.org/2024.isa-1.17). The scheme is fine-grained, the categories
are contested at their boundaries, and inter-annotator agreement is the
standing problem. It is a research programme, not a tagging pass.

---

## 4. In-context learning: how demonstrations are actually chosen

The most decision-relevant literature, because selecting *k* exemplars to
condition a generator is exactly what `pipeline draw` does. From *In-context
Learning with Retrieved Demonstrations: A Survey* (arXiv 2401.11624):

- **Similarity-based retrieval dominates the field**, but it is the wrong tool
  here — there is no query to be similar to. Fog Belt draws a set to establish
  register, not to match an instance.
- **Diversity helps**, specifically for "avoiding repetitive demonstrations"
  and "bringing different perspectives", and it matters most when the model is
  unfamiliar with the output space — which is the Fog Belt case exactly.
- **Established diversity methods**: determinantal point processes (DPP),
  **clustering retrieval — cluster, then take one per cluster**, and
  coverage-based selection over words or syntactic structures.
- **Set-level beats instance-level.** Picking each demonstration independently
  "might not yield the best combination"; iterative selection conditioned on
  what is already chosen does better.
- **Ordering is a large effect.** Performance ranges "from near-random to
  state-of-the-art depending on the order" of demonstrations.

### What this says about the current pipeline

`sample.py --coverage` — one per tag bucket before any bucket gets a second —
**is** clustering retrieval, the established diversity method. The design is
right; only the buckets are unfounded. Replace tag buckets with clusters over
Biber features and the method becomes both principled and self-derived.

**The unhandled finding is ordering.** `sample.py` renders the drawn set in
whatever order the picker produced. The literature says that alone can move
results from near-random to best-in-class. Nothing in the pipeline controls it,
and every packet in `extracted/packets/` should record it.

---

## Recommendation

1. **Substrate**: Biber features, via BiberPlus, instead of 22 hand-rolled
   lexical signals. Validated, interpretable, one `pip install`.
2. **Facets**: score D1 and D2, the two that demonstrably replicate here.
   Bucket into terciles for coverage. Do not adopt D3–D6 without evidence they
   discriminate in this corpus.
3. **Voice**: focalization (internal / external / zero) as an LLM-annotated
   field, if the voice axis earns its place — with the α=0.55–0.65 human
   ceiling written down next to it.
4. **Selection**: keep coverage sampling, re-base the buckets on clusters, and
   **fix ordering** — make it explicit, recorded, and eventually tested.
5. **Do not adopt appraisal theory** as a tagging scheme.
6. **Validate against `decisions.jsonl`**, not against argument. Once a few
   hundred verdicts exist, check which facet predicts a keep. Anything that
   predicts nothing gets dropped.

## Sources

- Biber, D. (1988) *Variation across Speech and Writing*. Dimensions as tabulated in Nini, *The Multidimensional Analysis Tagger* — https://andreanini.com/wp-content/uploads/2019/06/pre-print-the-multidimensional-analysis-tagger.pdf
- Biber, D. (1993) *Using Register-Diversified Corpora for General Language Studies* — https://gawron.sdsu.edu/functions_of_language/course_core/readings/using_register_diversified_corpora_biber-93.pdf
- Alkiek, K. et al. (2025) *Neurobiber: Fast and Interpretable Stylistic Feature Extraction* — https://arxiv.org/html/2502.18590v1 · code https://github.com/davidjurgens/biberplus · https://pypi.org/project/biberplus/
- pybiber — https://browndw.github.io/pybiber/ · biberpy — https://github.com/ssharoff/biberpy
- *Says Who? Effective Zero-Shot Annotation of Focalization* — https://arxiv.org/html/2409.11390
- Martin, J.R. & White, P.R.R. (2005) *The Language of Evaluation: Appraisal in English* · challenges — https://aclanthology.org/2024.isa-1.17.pdf
- Luo, M. et al. (2024) *In-context Learning with Retrieved Demonstrations for Language Models: A Survey* — https://arxiv.org/html/2401.11624v1
