# THEMES — what a theme is, and what it costs to get one out of a corpus

What published work supports for turning a body of text into **abstractions** —
a mechanism, what it costs, who it is done to — rather than into a pile of
quotations. Research pass 2026-09-04. Sources only; the design rules at the end
are marked where they are reasoned rather than cited.

---

## 1. Four definitions, and they do not agree

Worth settling before choosing a method, because the four traditions that use
the word mean different things by it and license different tests.

| tradition | the unit | the test for it |
| :-- | :-- | :-- |
| **literary thematics** | an abstraction predicated of the work — a claim the work makes or embodies | can it be stated as a proposition the work does not contain verbatim? |
| **folklore motif** | a concrete recurring narrative element (a magic object, a substituted bride) | does it appear, as an instance, in an index of such elements? |
| **qualitative research** (reflexive thematic analysis) | a pattern of shared meaning organised around a central concept | is it *constructed* by an analyst across coded extracts, and does it hold across them? |
| **topic modelling** | a distribution over words | do the top words read as belonging together? |

Two collisions to hold onto. A **motif is not a theme** — it is concrete,
enumerable and indexable, and that is exactly why it automates (§3.1). A
**topic is not a theme** — it is a word distribution, and the field's own
evaluation literature says the resemblance to meaning is weaker than its
metrics suggest (§4).

The qualitative tradition is explicit that themes are *constructed, not found* —
which makes "extract the themes" a category error inside that tradition
regardless of what does the extracting.

---

## 2. The category error that makes this hard

**Extractive** methods select spans of the source. **Abstractive** ones produce
a statement true of the source without occurring in it. Definitions 1 and 3
above are abstractive; nothing extractive can satisfy them, because the target
string is not in the input. This is not a tuning problem — no improvement to a
selector closes a gap of that shape.

Models default to the extractive end even when asked for the other one. The
finding is now reported directly: in an exploratory study of LLM support for
reflexive thematic analysis, models "appear more likely to produce descriptive
summaries than to generate interpreted and abstracted themes of meaning," with
outputs lacking the detail and reflective nuance of the human analysis. (Abstract
only — the journal blocked full-text retrieval this pass.)

The largest system study of LLM-assisted thematic analysis reports the same
shape from the inside: generated codes and themes "lack the cultural specificity
and interpretive depth" of human analysis, fluent output invites over-trust from
less experienced analysts, and — the sharpest observation — analysts' critical
attention narrows onto *verifying the machine's output* instead of interrogating
their own reading, which is the opposite of what the method is for.

> Vikan, Aryan, Kannelønning, Riegler & Danielsen, *Reflecting on LLM Support in
> Reflexive Thematic Analysis*, Qualitative Health Research, 2026 ·
> Sharma, Cochrane & Wallace, *DeTAILS*, arXiv:2510.17575.

---

## 3. What the field actually does

### 3.1 Motif indexing — works, because the index exists first

The first computational treatment of motif indexing pairs a folklore corpus with
a published motif index and detects expressions of indexed motifs in text.

| | |
| :-- | --: |
| motifs covered | 200 |
| positive motif expressions | 2,670 |
| annotated sentences | 58,450 |
| fine-tuned Llama3 | **F1 0.85** (P 0.86 / R 0.84) |
| fine-tuned Mistral | F1 0.81 |
| off-the-shelf embeddings | F1 0.57–0.65 |
| retrieve-and-rerank baseline | F1 0.36 |
| human agreement overall | κ 0.72 |
| human agreement, complex expression | κ 0.51–0.54 |
| expressions spanning >1 sentence | 1.1% |

Three lessons. **Detection against a hand-built index is a solved-ish task, and
open discovery is not the same task** — the index is what makes it tractable.
**Retrieval alone is nearly useless here** (0.36), so nearest-neighbour lookup
against a bank of existing entries will not identify recurrence. And **human
agreement halves when the expression is complex**, which bounds what any
automatic scheme can be validated against.

> Alyami & Finlayson, *Automated Motif Indexing on the Arabian Nights*,
> arXiv:2603.19283, March 2026.

### 3.2 Topic modelling and taxonomy induction — the loop is the contribution

Prompt-based topic modelling produces natural-language topic labels rather than
word lists and aligns better with human-annotated topics than LDA, SeededLDA and
BERTopic (the frequently quoted coherence figures, 0.74 against 0.64 on
Wikipedia, come from secondary reporting and were not verified against the paper
this pass).

The more useful recent result is architectural. An iterative taxonomy-induction
framework — density clustering, then LLM synthesis under **global consistency**,
where each new cluster is evaluated against the topics already accepted before a
new label is allowed — is scored by human annotators against alternatives:

| method | mean score /5 | chosen best (of 20) |
| :-- | --: | --: |
| BERTopic | 1.2 | 3 |
| single-shot LLM labelling | 2.7 | 5 |
| iterative, globally consistent | **2.8** | **12** |

Annotator κ 0.66. Pipeline shape: ~80M documents reduced to 4,510 after
deduplication and clustering, 72 clusters, synthesised to 14 topics.

Note the gap between the mean scores (2.7 vs 2.8, nothing) and the head-to-head
preference (5 vs 12, decisive). What the loop buys is **non-redundancy**, which a
per-item quality score cannot see. Any single-pass labelling has no mechanism to
avoid saying the same thing twice.

> Brady & Islam, *Iterative Topic Taxonomy Induction with LLMs*,
> arXiv:2510.15125.

### 3.3 Thematic analysis with a machine in the loop — fast, and it costs something specific

DeTAILS implements six phases after Braun & Clarke — background, load, code,
review codes, generate themes, report — with every phase editable and changes
propagating forward. Evaluated with 18 qualitative researchers stratified by
expertise.

Analyses finished in ~33 minutes against a typical 7–8 hours. Alignment with
reference analysis by phase (F1): related concepts 0.86, concept outline 0.98,
initial coding 0.90, global coding 0.97, reviewing codes 0.90, theme generation
1.00. Perceived usefulness 4.21/5, workload low-to-moderate.

And the failure list is the part to keep: interpretive depth lost, reflexivity
narrowed to output-checking, over-trust among novices, no backward propagation,
and fluent justifications that mask uncertainty. Participants estimated "probably
a week" of checking before they would trust results in publication.

> arXiv:2510.17575.

### 3.4 Proposition decomposition — the substrate, not the answer

A mature line of work splits text into **atomic propositions**: minimal,
self-contained units, each interpretable without its surrounding context.
Abstractive proposition segmentation does this as a generation task rather than
a span-selection one, and the downstream literature (claim decomposition, atomic
content units, fact verification) is built on the same primitive.

The transferable property is **self-containedness**, and it is a testable one: a
unit with an unresolved *this*, *it* or *the subject* is a pointer into its
source, not a statement. Any theme bank inherits that test for free.

> *Scalable and Domain-General Abstractive Proposition Segmentation*,
> arXiv:2406.19803 · *A Closer Look at Claim Decomposition*, arXiv:2403.11903.

### 3.5 Keyphrase extraction — the honest baseline

Cheap, robust, and extractive by construction. Worth running as a floor. It
cannot produce §1's definitions 1 or 3, and it should not be expected to.

---

## 4. The evaluation metrics do not measure what they are used for

Automated topic coherence has been under sustained attack for years — "the
incoherence of coherence" — and the 2026 evidence is worse than mixed. Six
approaches, ~4,000 human annotations in a specialist domain:

- Top2Vec took the **highest** automated coherence (C_V 0.72–0.80) and
  near-perfect automated diversity (0.98–1.00) while scoring **worst** on the
  human-judged index (0.693).
- BERTopic took the highest human coherence (0.900 accuracy).
- Human word-intrusion agreement was 80.3% (κ 0.688) — the humans are reliable
  enough for the comparison to mean something.

So the ranking inverts between the automated metric and the people. Earlier work
found automated coherence uncorrelated or negatively correlated with human
interpretability, and unreliable on short texts and neural models specifically.

**Consequence:** a coherence score is not evidence a theme bank is any good. If
quality is claimed, it has to be claimed off a human-scored sample, and word
intrusion is the one protocol with an agreement number attached.

> *When Numbers Tell Half the Story*, arXiv:2603.01945, March 2026 · Hoyle et
> al., *Is Automated Topic Model Evaluation Broken?*, NeurIPS 2021.

---

## 5. What a usable theme statement looks like

Six properties. Four are supported by the work above; two are marked as reasoned.

| property | test | basis |
| :-- | :-- | :-- |
| **abstractive** | the statement does not occur verbatim in any source | §2 |
| **self-contained** | no unresolved deixis; readable with the source unavailable | §3.4 |
| **recurrent** | attested in ≥2 documents | §1 — recurrence is what separates a theme from a detail in the folklore and thematic traditions alike |
| **non-redundant** | compared against every banked entry before admission, not just scored on its own | §3.2 |
| **discriminating** | the label vocabulary's usage histogram is not concentrated on one value | closed-set collapse is documented for LLM annotation generally; applying it to a theme vocabulary is *reasoned* |
| **not a function of length** | per-document yield does not correlate with document word count | *reasoned*. A per-sentence matcher necessarily returns more rows for longer documents, which measures verbosity rather than thematic richness. No study found this pass measures it |

And one process rule from §3.3: whatever produces the bank, the person reading it
should be checking their own reading, not only the machine's output. That failure
mode is documented and it is invisible from inside.

---

## 6. Gaps

- **No published method does open thematic discovery over fiction.** Motif work
  needs a pre-existing index; topic work returns word distributions or short
  labels; thematic analysis assumes a human analyst throughout. The abstractive,
  cross-document, unindexed case is not covered by anything found.
- **Nothing measures whether a bank of themes is any use downstream.** Every
  evaluation above scores themes for coherence or for agreement with a reference
  reading. Whether a theme, once banked, causes better work is unmeasured.
- **Multi-sentence and multi-document expression is deliberately out of scope**
  in the strongest motif result (1.1% of cases, excluded). Cross-document
  abstraction — the thing definition 1 requires — is exactly what stays unsolved.
- **The reflexive-thematic-analysis finding is abstract-only here.** The journal
  blocked retrieval; the claim about descriptive summaries is quoted from the
  abstract and has not been checked against the study's data.

---

## Sources

Braun & Clarke, reflexive thematic analysis (worked example) — https://link.springer.com/article/10.1007/s11135-021-01182-y ·
Vikan, Aryan, Kannelønning, Riegler & Danielsen, *Reflecting on LLM Support in Reflexive Thematic Analysis*, Qualitative Health Research 2026 — https://journals.sagepub.com/doi/10.1177/10497323251365211 ·
Sharma, Cochrane & Wallace, *DeTAILS: Deep Thematic Analysis with Iterative LLM Support* — https://arxiv.org/abs/2510.17575 ·
Alyami & Finlayson, *Automated Motif Indexing on the Arabian Nights* — https://arxiv.org/abs/2603.19283 ·
*Large language models for folktale type automation based on motifs* — https://arxiv.org/abs/2510.18561 ·
Pham et al., *TopicGPT: A Prompt-based Topic Modeling Framework*, NAACL 2024 — https://aclanthology.org/2024.naacl-long.164.pdf ·
Brady & Islam, *Iterative Topic Taxonomy Induction with LLMs* — https://arxiv.org/abs/2510.15125 ·
*Scalable and Domain-General Abstractive Proposition Segmentation* — https://arxiv.org/abs/2406.19803 ·
*A Closer Look at Claim Decomposition* — https://arxiv.org/abs/2403.11903 ·
Prouteau et al., *When Numbers Tell Half the Story: Human-Metric Alignment in Topic Model Evaluation* — https://arxiv.org/abs/2603.01945 ·
Hoyle et al., *Is Automated Topic Model Evaluation Broken? The Incoherence of Coherence*, NeurIPS 2021 — https://proceedings.neurips.cc/paper/2021/file/0f83556a305d789b1d71815e8ea4f4b0-Paper.pdf ·
*Narrative Structure in Tropes: A Computational Analysis* — https://arxiv.org/abs/2606.19499
