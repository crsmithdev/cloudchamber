# THEMES — what a theme is, and why the extractor is not producing one

*What the literature offers for the job `pipeline/themes.py` is supposed to do:
turning a corpus into **abstractions** — a mechanism, what it costs, who it is
done to — that can seed what gets made. Compiled 2026-09-03, after Chris read
the theme bank in the Ledger and said the themes looked like sentences. They
are sentences. This document establishes why, and what the field does instead.*

---

## 1. What the extractor actually produces

`themes.py` matches regexes over sentences — `in order to`, `so that`,
`sacrific\w+`, `routinely`, `subjects?` — and banks the whole sentence. Every
number below is measured over the 432 rows currently in
`extracted/themes.jsonl`.

| measurement | value | what it means |
| :-- | --: | :-- |
| contains unresolved deixis | **61%** | *this*, *it*, *the subject*, with no antecedent in the row |
| opens on a deictic | **12%** | the row cannot be read at all without the source article |
| median length | **24 words** | a sentence, not an abstraction |
| longest | 61 words | |
| carry the single label `mechanism` | **72%** | the label vocabulary is not discriminating |
| content signatures spanning >1 document | **0** | nothing abstracts across the corpus |
| correlation, themes-per-doc vs doc length | **r = 0.55** | it substantially measures verbosity |

Three of those are fatal on their own.

**Nothing is self-contained.** *"Typically this occurs through regular postage
routinely received by the subject"* — which occurrence, which subject. The row
is a pointer into an article, not a statement.

**Nothing spans two documents.** Not one theme signature appears in more than
one source article. A property held by exactly one document is a detail of
that document. A theme, on any definition in §3–§5 below, is a thing that
recurs; the extractor is structurally incapable of finding one because it
never compares documents to each other.

**Theme count tracks article length.** r = 0.55 against word count over 60
articles, and the top five documents supply 77 of the 432 rows. A long article
has more sentences, so it matches more regexes. Thematic richness is not what
is being counted.

### The category error

The extractor is **extractive** — it selects spans of the source. The task is
**abstractive** — it needs a statement that is true of the source without
being in it. No improvement to the regexes closes that gap, because the target
string does not occur in the input. The current design cannot produce a theme
by construction, and every remaining section is about what to replace it with
rather than how to tune it.

---

## 2. What counts as a theme — four candidate definitions

Worth fixing before choosing a method, because the four disagree.

| tradition | the unit | test for it |
| :-- | :-- | :-- |
| Topic modelling | a distribution over words | co-occurrence |
| Keyphrase extraction | a noun phrase in the document | salience within the document |
| Thematic analysis | an interpreted pattern of meaning across a dataset | the analyst can state it and defend it |
| Motif indexing | the smallest element with the power to persist in tradition | it recurs, and it is striking |

Fog Belt wants the bottom two. `extracted/README.md` already says so — "a
mechanism, what it costs, who it is done to" is a proposition with roles, not
a word cluster and not a noun phrase.

Thompson's definition is the sharpest available and is worth adopting as the
kill test: a motif is *"the smallest element in a tale having a power to
persist in tradition"*, and it "must have something unusual and striking about
it". Both halves indict the current bank. Nothing in it persists — no row
appears twice — and almost nothing in it is striking, because "personnel are
to be informed" is procedural furniture that matched a procedural regex.

---

## 3. Topic modelling — LDA, NMF, BERTopic

The obvious reach, and the wrong tool.

A topic is a ranked word list. It answers *what vocabulary clusters here*, not
*what mechanism is being described*, and turning a topic into a sentence is a
separate labelling problem the methods do not solve — with BERTopic,
"determining a clear title for each topic remains challenging", which is the
entire difficulty here rather than an afterthought.

It also fails on this corpus's shape. BERTopic's HDBSCAN stage discards
outliers, which is exactly backwards for a pool whose value is in its tails;
high-frequency general terms compromise topic specificity, and the SCP corpus
is saturated with shared institutional vocabulary — *containment*,
*personnel*, *procedure*, *subject* — that every article shares and that
carries no thematic information at all. A topic model over this corpus will
recover the register, which is already measured six ways by `biber.py`.

**Recommend against.** It answers a question nobody asked and answers it with
the one signal this corpus has least of.

---

## 4. Keyphrase extraction — RAKE, YAKE, KeyBERT, PatternRank

Cheaper and also wrong, for a structural reason: the output unit is a phrase
occurring in the document, which is the extractive failure of §1 with a
shorter span. *"Blood sacrifice"* is a keyphrase; *"a devotional system whose
required offering escalates until the devotee is consumed by it"* is a theme.
The methods cannot produce the second, and it is the second that seeds a
story.

Worth knowing anyway, because it is a real ranking of the tools: YAKE is
purely statistical and has no contextual understanding; RAKE fails to strip
stop words reliably; KeyBERT selects candidates by n-gram rather than
part-of-speech pattern, and PatternRank's finding is that PoS-pattern
candidate selection beats plain noun phrases.

**Recommend against as a theme source.** Possibly useful later as a cheap
index over the *kept* set, which is a different job.

---

## 5. Thematic analysis — the actual method for the actual word

Braun & Clarke's reflexive thematic analysis is the standard qualitative
procedure for producing themes from a corpus, and its shape is the one this
pipeline should have: code the data, then build themes *from the codes*, with
the analyst's interpretation as a declared part of the instrument rather than
a contaminant. Two properties matter here.

**A theme is a pattern across the dataset, not a unit inside one document.**
This is the §1 finding restated as method: the codes are per-passage, the
themes are per-corpus. The current extractor has no second stage at all.

**Interpretation is not optional.** Reflexive TA insists the theme is
constructed by an analyst, not discovered by a procedure. That is a strong
argument for the division of labour this repo already runs on — the machine
proposes, Chris culls, and the cull is the load-bearing step.

### What LLMs do and do not do here

The 2024–2026 literature on LLM-assisted thematic analysis is directly
relevant and the headline caveat is unusually specific:

- On **deductive** coding — applying a taxonomy that already exists — LLMs
  perform comparably to humans with low hallucination rates.
- On **inductive** theme generation they are variable, and the recurring
  finding is that they "produce descriptive summaries rather than interpreted
  and abstracted themes of meaning."

That is precisely the failure mode to design against, and it says where the
model goes: **generating candidates and applying a taxonomy, not deciding what
the themes are.** A related warning from the reflexive-TA work is worth
writing down next to it — mandatory model assistance "risks displacing
reflexivity onto model suggestions rather than the researcher's own analytic
lens", i.e. if the model's list is the starting point, the taxonomy becomes
the model's taste. The cull is the mitigation.

---

## 6. TnT-LLM — the two-phase shape worth copying

Wan et al. (Microsoft / UW, KDD 2024) is the closest published match to what
this pipeline needs, and its structure is the recommendation:

1. **Phase 1 — induce the taxonomy.** A zero-shot, multi-stage reasoning pass
   over samples of the corpus produces and then *iteratively refines* a label
   taxonomy. The taxonomy is an output, not an input.
2. **Phase 2 — assign at scale.** The LLM labels a training sample, and a
   lightweight classifier does the rest of the corpus cheaply.

They report more accurate and relevant taxonomies than the baselines on Bing
Copilot intent data, under both human and automatic evaluation.

Mapping onto Fog Belt: **phase 1 is the theme bank** — a set of mechanisms
induced from the corpus and refined, where each theme is a written statement
rather than a span. **Phase 2 is coverage** — which articles instantiate which
mechanism, which is what makes `pipeline stats` able to say a theme recurs,
and what makes Thompson's persistence test computable.

It also fixes the label degeneracy in §1. The six hand-written label words
(`mechanism`, `cost`, `subject`, `normalized`, `irreversible`) were an
asserted taxonomy, and 72% of the bank landed in one of them — the same
failure the six register tags had, for the same reason.

---

## 7. Motif and trope detection — the closest domain

Computational folkloristics is the field that has actually tried to extract
this unit from fiction, and its results are a warning about difficulty rather
than a method to lift.

- Automated motif extraction from narrative is possible with supervised
  learning, but motifs had been extracted manually until recently, and the
  Thompson index itself is 46,248 hand-made motifs over 614 collections.
- A motif *detector* has to model not just whether a motif is mentioned but
  whether it is being used "in a motific way" — the trolls-under-bridges
  problem: a text can name a troll without the troll being the motif.
- Recent work applies LLMs to folktale type assignment at scale, which is
  §6's phase 2 in this domain.
- The honest summary from the field: automatic extraction of higher-order
  content units "has eluded folk narrative studies so far".

Two things to take. The **used-as-a-motif distinction** is the thing to build
a kill test around: an article that mentions a sacrifice is not an article
whose mechanism is sacrifice. And the difficulty estimate is a reason to keep
the human cull rather than to expect a clean pipeline.

---

## 8. Frame semantics — the right shape for the record

"A mechanism, what it costs, who it is done to" is not a sentence. It is a
**frame with roles**, and frame semantics is the established formalism for
exactly that: semantic role labelling detects "who did what to whom, when and
where", and FrameNet's 1200+ frames each unite the words that evoke a common
situation.

This is worth adopting as the *storage shape* of a theme, independent of how
the theme is generated:

```
mechanism    what the process does, stated as a process
subject      who it is done to, and at what scale
cost         what is given up, and whether it returns
normalisation how the setting makes it ordinary
```

Those four are what the current label strings were groping at. As free-text
labels on a span they did nothing; as required roles on an abstracted
statement they are a schema a candidate can be checked against — and an
incomplete frame is a visible defect rather than an invisible one.

Full SRL tooling is not needed to get this. The roles can be required fields
in the generation step, which is cheaper and more reliable than parsing them
back out of prose.

---

## 9. Propositions — the self-containment criterion

The Dense X Retrieval work (Chen et al., EMNLP 2024) is not about themes, but
it supplies the missing acceptance test. Its three principles for a
proposition:

1. **distinct** — corresponds to one piece of meaning, and the set of them
   composes the meaning of the whole text;
2. **minimal** — cannot be split further;
3. **contextualised and self-contained** — carries the context needed to
   interpret it.

Principle 3 is the one 61% of the current bank fails. It is also trivially
checkable and belongs in the selftest: a theme that contains an unresolved
*this* / *it* / *the subject* is rejected at write time, not culled later.

Their empirical result — proposition-granularity indexing beats passage
granularity for retrieval and downstream QA — is a secondary argument for the
same unit, since `pipeline draw` retrieves themes to condition a generation
call.

---

---

## 10. Fitness for the actual use — a generation input beside examples

§3–§9 rank the methods on whether they produce a theme. That is the wrong
question on its own: a theme here is consumed by `pipeline draw`, which sets
it beside 150–400-word verbatim passages in one prompt. `research/generation.md`
already has the evidence, and it decides the choice more sharply than the
thematic-analysis literature does.

**Few-shot conditioning acts on form.** §3.3 of that file is explicit, and the
caution it draws is that feeding in criticism or taxonomy conditions the model
to produce more criticism and taxonomy. The same mechanism applies to the seed
block: **anything in the prompt is available for imitation as form, whether or
not it was put there for its content.**

That is a live defect, not a hypothetical. The current themes are verbatim SCP
sentences at a median of 24 words, and `sample.render` prints them immediately
above six verbatim SCP passages. In the same register, at a similar grain, in
the same document. The theme block is currently functioning as a second,
worse example set — diluting the register conditioning the example slot
exists to provide.

**A theme must therefore be formally unlike prose.** Notation, not sentences.
If it cannot be mistaken for an example it cannot compete with one, and the
structured frame of §8 gets this for free while an abstractive paragraph — the
tempting default, and what an LLM produces unprompted — gets it exactly wrong.

**Underspecification is a feature.** Exposure to a single worked example
raises design fixation and produces fewer, less varied and less original ideas
than no example at all (Wadinambiarachchi et al., CHI 2024, via
`generation.md` §2). A theme written as a finished premise is that example. A
frame states the mechanism and leaves the story undone, which is what a seed
has to do.

**The deck precedent.** The Oblique Strategies deck beat ChatGPT on
group-level idea distinctness (Anderson, Shah & Kreminski, C&C 2024), and
`generation.md` §3.2 draws the moral: randomness sourced outside the generator
does real work. The theme bank *is* that deck. Decks are made of short
discrete combinable cards, and playbook §1 required combination — "at least
one must be a combination — two or three entries held together". Paragraphs do
not combine; roles do. (That requirement was ideation's, and went with the
playbook; the deck argument stands on the externally-sourced randomness above,
which is a property of drawing rather than of combining.)

### Ranked for this use

| approach | as a generation input | verdict |
| :-- | :-- | :-- |
| **Frame with roles** (§8), induced TnT-LLM-style (§6) | notation, combinable, underspecified, corpus-level so the draw has known cardinality | **use this** |
| Abstractive prose theme | competes with examples for register; a worked premise, so maximally fixating | actively harmful |
| Keyphrase | deck-like and combinable, but carries no mechanism, so it seeds nothing about what happens | insufficient alone |
| Topic model | a word list cannot be drawn against or combined | no |

### Consequences for the packet

Two things fall out that are not about extraction at all:

1. **`sample.render` has the order backwards.** It prints SEED then REGISTER.
   The skill and `generation.md` §3.3–§3.4 both put examples first and the
   constraints last, nearest the ask, because instruction force decays with
   distance from the point of generation while register conditioning does not.
2. **The two blocks must be visually incommensurable** — the frame as a
   labelled record, the examples as unframed prose. Presentation is doing
   load-bearing work here, not decoration.

### The record

Portable, so it can be drawn against anything. No proper nouns from the
source: a theme carrying `SCP-2000` drags the model toward that article.

```
mechanism      the process, as a process           required
subject        who it is done to, and at what scale required
cost           what is given up; whether it returns required
normalisation  how the setting makes it ordinary   optional
```

Short clauses, not sentences. An incomplete frame is a defect (§8); an
unresolved deixis is a rejection at write time (§9); a frame appearing in one
document only is a detail rather than a theme (§7).

---

## 11. What the working bank actually looks like — and a correction

§8 proposed a four-field frame and §10 argued for it. **Measured against
playbook §2, that is over-engineered, and this section supersedes both on the
storage format.** §2–§5 are the banks that produced twenty-five stories; they
are the only seed format in this project with evidence behind it, and they are
not frames.

| | §2 bullets (n=376) | mined `themes.jsonl` (n=432) |
| :-- | --: | --: |
| median words | **21** (p10 15, p90 32) | 24 |
| a single sentence | 98% | — |
| carries a turn connective | **63%** | 35% |
| names who it is done to | **40%** | 17% |
| implies a cost or a no-exit | **17%** | 6% |
| contains a proper noun | **0%** | **53%** |
| opens on a deictic | **0** | 12% |

**The mined bank is already the right length.** That was not the problem. It
fails on four content properties, and the largest gap is portability: 53% of
mined rows carry a proper noun from their source, which drags a generation
call back toward the article the row came from instead of seeding a new one.

What a §2 bullet is, from the bank itself:

> The body altered to meet a written specification, and the specification is a
> purchasing document.

> The victim who is also the weapon, so that rescuing him and releasing him
> are the same act, and the humane thing is to leave him where he is forever.

> The criterion is nine years old, arbitrary, and load-bearing: raise it and
> the whole series restarts at one.

One sentence. A mechanism, and a **turn** — the move playbook §1.3 calls the
slate's signature, where a real thing that works becomes the mechanism. Roles
are present but *compressed into the clause chain*, never enumerated.

### Why the single line beats the frame here

1. **§1.1 requires combination** — "at least one must be a combination, two or
   three entries held together". Two 21-word lines hold together. Two
   four-field records give eight fields and produce mush; the worked
   combination attempted on 2026-09-03 was the weakest artefact in that batch.

   *Expired, 2026-09-04.* §1.1 was the ideation pull, and it was removed with
   the playbook — an idea-generation requirement was doing the ranking in a
   theme-extraction argument. Reason 2 below does not depend on it and carries
   the conclusion on its own. `draw -t 2` is the only combination left, and it
   is a default rather than a requirement.
2. **The turn is the payload, and a frame has nowhere to put it.** "…and the
   specification is a purchasing document" lives in the sentence's syntax.
   Decomposing into `mechanism` / `subject` / `cost` destroys exactly the thing
   that makes the seed live, which is why only 63% → 35% is the gap that
   matters most after portability.
3. **Brevity already solves the form problem.** §10 worried that a prose theme
   competes with the examples for register conditioning. A 21-word line in a
   bulleted bank is incommensurable with a 200–400 word passage on length and
   formatting alone. Field labels were solving a problem brevity had solved.

### And the Oblique Strategies result does not argue for generic cards

`generation.md` §3.2 cites the deck beating ChatGPT on distinctness. The moral
it draws is that **randomness sourced outside the generator does real work** —
not that the cards should be contentless. Fog Belt cannot use contentless
cards: §1.3 kills any premise without an engine, and a generic card leaves the
engine to the model, which is precisely where the model reaches for its
modal move. The §2 grain sits between the oblique card and the worked premise,
and the evidence for that position is twenty-five stories.

### The spec, restated

```
one sentence, 15-32 words
a mechanism, and a turn on something that works
no proper nouns — portable off its source
self-contained — no unresolved deixis
implies who it is done to, and what it costs
```

The roles from §8 survive, but as a **drafting scaffold and an acceptance
test**, not as the stored object: draft by answering mechanism / subject /
cost, then compress to one line, then check the line still implies all three.
The acceptance test is now measurable, and its target is a distribution rather
than a rule — a mined bank should be statistically indistinguishable from §2
on the table above.

## Recommendation

*Built 2026-09-03. `pipeline/themes.py` is the rewrite; items 1, 2, 5, 6 and 9
below are done, and 3 is done as machinery with the corpus pass outstanding.
The calibration held both ways: playbook §2 passes its own validator at 98%,
the 432 mined rows at 20%.*

1. **Retire local sentence extraction.** It cannot produce a theme; §1 is not
   a tuning problem. Keep the code in history, drop it from the pipeline, and
   do not re-point the regexes.
2. **Store one sentence in the playbook §2 grain — not a frame.** §11
   supersedes §8 and §10 on this: 21 words, a mechanism and a turn, no proper
   nouns, self-contained. The four-field record survives as a drafting
   scaffold and an acceptance test, not as the stored object. Target the §2
   distribution, which is the only seed format here with evidence behind it.
3. **Make the research intake the primary path.** `pipeline themes --research`
   → brief → a session reads → `--ingest` is already the right architecture:
   a model drafts abstractions, Chris culls. It was built as the fallback for
   settings whose text is too large to hold; it should be the default for
   everything.
4. **Two phases, TnT-LLM shaped.** Induce a taxonomy of mechanisms over the
   corpus and refine it; then assign articles to it. A theme becomes a
   corpus-level object with document instances, which is what makes recurrence
   measurable.
5. **Enforce self-containment at write time.** Reject unresolved deixis in
   `themes.py`, with a selftest check. This is the cheapest fix in the
   document and it invalidates 61% of the current bank.
6. **Fix the packet.** `sample.render` prints the seed before the register;
   both the skill and `generation.md` put the examples first and the
   constraints last. Cheap, independent of the rebuild, and worth doing first.
7. **Adopt two kill tests, both from §2 and §7.** Does it recur in more than
   one document — persistence. Is the mechanism the article's subject rather
   than something it mentions — the motific test.
8. **Do not adopt topic modelling or keyphrase extraction** as theme sources.
9. **Re-cull from scratch.** The 432 rows are spans, not themes; a keep on one
   would be a keep on the wrong kind of object. `theme-decisions.jsonl` does
   not exist yet, so nothing is lost — and this is the good case, exactly as
   it was for the six register tags.

The pattern here is the same one `research/tagging.md` found: a component
invented its own taxonomy, asserted it, and the assertion collapsed into one
bucket. The fix is the same too — take the unit from a field that has argued
about it, and validate against Chris's verdicts rather than against argument.

---

## Sources

- Braun, V. & Clarke, V. (2006/2019) *Reflexive thematic analysis* — the standard procedure; codes across a dataset, then themes from codes.
- Wan, M. et al. (2024) *TnT-LLM: Text Mining at Scale with Large Language Models*, KDD 2024 — https://arxiv.org/abs/2403.12173 · https://dl.acm.org/doi/pdf/10.1145/3637528.3671647
- Chen, T. et al. (2024) *Dense X Retrieval: What Retrieval Granularity Should We Use?*, EMNLP 2024 — https://arxiv.org/abs/2312.06648 · dataset https://chentong0.github.io/factoid-wiki/
- *LLM-in-the-loop: Leveraging Large Language Model for Thematic Analysis* — https://arxiv.org/pdf/2310.15100
- *Large language models for thematic analysis in healthcare research: a blinded mixed-methods comparison with human analysts*, PLOS Digital Health — https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0001189
- *Reflecting on LLM Support in Reflexive Thematic Analysis*, Qualitative Health Research — https://journals.sagepub.com/doi/10.1177/10497323251365211
- *DeTAILS: Deep Thematic Analysis with Iterative LLM Support* — https://arxiv.org/html/2510.17575v2
- Karsdorp, F. et al. *Learning a Better Motif Index: Toward Automated Motif Extraction* — https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.CMN.2016.7
- *Finding Trolls Under Bridges: Preliminary Work on a Motif Detector* — https://arxiv.org/pdf/2204.06085
- *Large language models for folktale type automation* — https://arxiv.org/pdf/2510.18561
- *Semantic Role Labeling: A Systematical Survey* (2025) — https://arxiv.org/html/2502.08660v1
- FrameNet — frame semantics, 1200+ frames; via the SRL survey above.
- BERTopic — https://www.emergentmind.com/topics/bertopic-based-topic-modeling · short-text limitations, *BERTopic_Teen* — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12378273/
- *PatternRank: Leveraging Pretrained Language Models and Part of Speech for Unsupervised Keyphrase Extraction* — https://arxiv.org/pdf/2210.05245

*The Braun & Clarke citation is to the method as it is universally described
in the LLM-assisted papers above rather than to a copy of the original read
for this document. Everything else was read at the URL given, except the
thematic-analysis journal articles, which were read as search abstracts.*
