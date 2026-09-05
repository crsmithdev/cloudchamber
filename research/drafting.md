# DRAFTING — checking a story plan and writing the story

Evidence on three problems that come after a story has been planned: finding
what is wrong with the plan (facts, logic, sameness), writing prose from it at
length without losing the tension the plan was built for, and checking the
prose. Research pass 2026-09-05. Every figure traces to the source named beside
it; where a figure came from a summary rather than the paper, or the paper
could not be read in full, it says so.

---

## 1. The mechanism

### 1.1 Checking works on short text and fails on long text

Plot-hole detection is the closest published task to reading a story plan for
what does not hold. On FlawedFictions, stories averaging 731 words with one
synthesized inconsistency each, the best model matches people: Claude 3.5
Sonnet 0.76 classification accuracy against a human 0.76, and 0.68 on
localising the flawed span against a human 0.68. On the long split, averaging
2,703 words, the best model (o1) falls to 0.53 on localisation, barely above
the baseline of always answering "no error". More test-time reasoning does not
help: o3-mini's localisation *dropped* (0.52→0.47) with five times the
reasoning tokens.

Two more findings from the same work carry over. Models asked to summarise a
story introduce plot holes at a 50% higher rate than the original (0.31→0.45
detected), and asked to adapt one, at roughly double (0.14→0.27). A model
restating a plan is a source of new inconsistencies, not a neutral copy.

> Sclar et al., *Finding Flawed Fictions*, arXiv:2504.11900.

### 1.2 A ledger beats a reader

On narrative consistency in generated stories of tens of thousands of words,
an automated checker that first extracts contradiction-prone spans per error
category, then pairs spans and classifies each pair as consistent or
contradictory, then records exact quotes with character offsets, reached F1
0.678 on 1,000 planted errors — against professional web-novel writers at
0.229. Recall 55.0% versus 17.1%; precision 0.884 versus 0.660. Decomposed
extract-then-compare beats a whole-text read by a person by 3.2× on discovery,
and does it with evidence attached.

The taxonomy is five categories, nineteen subtypes: timeline and plot logic
(absolute time, duration, simultaneity, causeless effect, causal violation,
abandoned element); characterisation (memory, knowledge, skill, forgotten
ability); world (core rules, social norms, geography); factual detail
(appearance, nomenclature, quantity); narrative and style (perspective, tone,
style shift). Where the errors are: factual and temporal dominate; they
cluster around the middle of a narrative; the fact is set early-to-mid and the
contradiction comes later. Open-ended generation is worse than continuation,
expansion or completion of given text.

> Microsoft Research, *Lost in Stories*, arXiv:2603.05890, ACL 2026 Findings.

### 1.3 Feedback is specific and misses the point

On 1,300 stories with one deliberately introduced writing issue each, current
models give feedback that is specific and mostly correct — following it would
help in about 0.7–0.8 of cases for the best models — but they routinely fail
to name the biggest problem, and are wrong most of the time when they say a
story is fine as it is. Continuity errors in longer stories are named as a
known weakness.

The pattern in §1.1–1.3 is one pattern. A model reading a text produces
plausible local findings and does not rank them. Ranking, and finding the
one thing that breaks the piece, has to be asked for as its own question.

> Rashkin, Clark, Huot & Lapata, *Help Me Write a Story*, ACL 2025.

### 1.4 The tension failure is fixable at the plan, not the prose

The generation review (*generation.md* §1.4) established that model stories
resolve early: late-stage unpredictability 0.215 against 0.607 for professional
fiction. The same authors built the fix and measured it. A three-stage
pipeline: extract seven scene-level beats from a reference story (action,
technique, what made it memorable); adapt them to the target premise as a
"thick intermediate layer" — per beat, its narrative function, what is
revealed versus withheld, the tension mechanism, the stakes; then write the
story from idea plus beats.

| Claude Sonnet 4.6, 32 prompts | zero-shot | with beats |
| :-- | :-- | :-- |
| mean no-rate | 0.606 | 0.747 |
| late-stage no-rate | 0.139 | 0.339 |
| tension retained after a peak | 16.7% | 35.5% |
| EQ-Bench rubric | 82.04 | 85.03 |

Half the gap to professional fiction (0.765), closed by a plan that schedules
information rather than by any instruction about prose. Opus 4.6 and GPT-5.2
gained similarly on tension while their rubric scores slipped — the rubric and
the metric disagree, again.

> Sui, Zhu, Cheng, West, So, Long & Holtzman, *Spoiler Alert*, arXiv:2604.09854,
> ICML 2026.

### 1.5 What machine fiction does, structurally

Over 61,608 stories of about 5,000 words — 10,272 prompts, each written by a
person and five models — a classifier on 304 discourse-level features alone
(plot, agency, time, revelation, perspective; no style cues) separates human
from machine at 93.2% macro-F1, keeping 97% of the accuracy of a version that
also sees style. Human validators agreed with the feature assignments at
κ = 0.84. The fingerprint is in what is built, not how it is phrased.

| feature | AI | human |
| :-- | :-- | :-- |
| narrator explains the lesson | 77% | 52% |
| protagonist-driven, tidy resolution | 69% | 46% |
| no subplot | 79% | 57% |
| emotion conveyed as bodily sensation | 81% | 38% |
| morally ambiguous protagonist | 38% | 59% |
| specific textual references | 24% | 47% |

Per model: Claude's event intensity "escalates less than any other source";
Gemini has the tidiest endings and longest denouements; GPT leans on gossip as
a plot mechanism.

Each row is a presence check with a quote — the shape of question the
evaluation review (*literature.md* §4.1) says a model can answer. None is a
question about quality.

> Russell et al., *StoryScope*, arXiv:2604.03136. Figures via the HTML version.

### 1.6 Slop is countable

Over-used words, "not X but Y" constructions and trigrams can be scored by
over-representation against a human baseline; some patterns occur over 1,000×
more often in model text than in human text. The profiler is standalone and
runs on finished text. One public score weights the three classes 60 / 25 / 15.
This is lexical, deterministic, and needs a human corpus to compare against.

> Paech & Gökdeniz, *Antislop*, arXiv:2510.15061 · EQ-Bench slop-score page.

### 1.7 Polishing removes the voice

Four studies across three assistants (GPT-3.5, LLaMA 3, Gemini) and three
corpora (Reddit, local news, arXiv abstracts): LLM writing assistance
preserves content and homogenises style; classifiers that infer author
attributes from text lose accuracy on polished text. A separate line traces
the mechanism: polishing densifies vocabulary and compacts syntax.

Read against §1.4: a plan step raised tension; a polish step lowers
distinctiveness. Revision that reads the whole text and improves it is the
step to leave out.

> Sourati, Dehghani et al., Nature Human Behaviour — via a press summary, not
> the paper · *How LLMs Distort Our Written Language*, arXiv:2603.18161.

### 1.8 Private revision keeps drafts apart

Three reviewers on a draft, three rounds, with each author revising from its
own draft plus feedback and never seeing another's revision: raised
diversity (surprisal 0.476→0.573, KL to a reference 2.233→2.638) alongside
rubric gains, and beat teacher, debate and discussion setups. The caveat is
large: a 3B model, rubric-judged. Its structural claim is what transfers —
the revision must not see other revisions, or the drafts converge.

> Wang et al., *LLM Review*, arXiv:2601.08003.

### 1.9 Decomposition is preferred to one pass

Planning agents for conflict, character, setting and plot, then writing
agents for exposition, rising action, climax, falling action and resolution
in order, sharing a scratchpad: human raters preferred the decomposed system
to end-to-end generation on every dimension, most on creativity and
development. Human-written stories were still preferred overall. A separate
line trains a model to plan the next chapter from condensed story state and
finds the chapters preferred pairwise, more so in SF and fantasy.

> Huot et al., *Agents' Room*, ICLR 2025, arXiv:2410.02603 · Gurung & Lapata,
> *Learning to Reason for Long-Form Story Generation*, arXiv:2503.22828.

### 1.10 Verifying claims: extract only what can be checked

Long-form factuality pipelines decompose text into claims, retrieve, and
verify per claim. The distinction that matters: one line extracts every
statement, another extracts only *verifiable* claims and searches the open
web rather than an encyclopedia, and the second is the one that generalises
beyond biography. Expert fact-checkers shown model fact-checks rate them
accurate but less useful than their own — the title of a CHI 2026 paper whose
body was not readable this pass.

> Song et al., *VeriScore*, EMNLP 2024 Findings · Wei et al., *SAFE*,
> arXiv:2403.18802 · *Beyond Accuracy*, CHI 2026 (abstract only).

---

## 2. The ledger

| Finding | Figure | Source |
| :-- | :-- | :-- |
| Plot-hole detection at ~700 words, best model vs human | 0.76 vs 0.76 | arXiv:2504.11900 |
| Same at ~2,700 words, best model, localisation | 0.53 ≈ always-no | same |
| More reasoning tokens on the same task | 0.52→0.47 | same |
| Plot holes introduced by model summarisation / adaptation | +50% / ~+100% | same |
| Extract-pair-quote checker vs professional writers, F1 | 0.678 vs 0.229 | arXiv:2603.05890 |
| Dominant error classes | factual, temporal | same |
| Feedback that would help, best models | 0.7–0.8 | ACL 2025 Rashkin et al. |
| Beat scaffold, mean tension, Sonnet 4.6 | 0.606→0.747 | arXiv:2604.09854 |
| Same, late-stage | 0.139→0.339 | same |
| Human/AI classifier on narrative features only | 93.2% F1 | arXiv:2604.03136 |
| Narrator explains the lesson, AI vs human | 77% vs 52% | same |
| Morally ambiguous protagonist, AI vs human | 38% vs 59% | same |
| Slop pattern over-representation, worst cases | >1,000× | arXiv:2510.15061 |
| Private-revision review, diversity | surprisal 0.476→0.573 | arXiv:2601.08003 (3B) |
| Decomposed vs end-to-end, human preference | preferred, all dims | arXiv:2410.02603 |

**The one that governs the rest** is the length cliff in row two. Checking is
reliable on a scene and unreliable on a story. Every check below is a check of
a short piece against a short reference, never a read of the whole.

---

## 3. What to do, in order of return

### 3.1 Schedule the information before writing anything

The beat layer in §1.4 is the largest measured effect on the failure that
matters. Per beat: what the reader knows at its end, what is still withheld,
what the beat is for, what is at stake. Derive it from the plan; write from it.
Tension is a property of the schedule, and the schedule is a document.

### 3.2 Check short against short, with a ledger

Extract facts (names, numbers, dates, places, who knows what) into a ledger
from the plan; check each scene against the ledger and against its neighbours,
not the whole text against itself (§1.1, §1.2). Every finding carries a quote.
The five-category taxonomy in §1.2 is the checklist; factual and temporal
first.

### 3.3 Ask for the one thing that breaks it

A finding list is cheap and unranked (§1.3). Ask separately: which single
finding, unfixed, breaks the premise rather than a detail. Ask it of each
checker independently, and compare.

### 3.4 Verify claims about the world with retrieval, one claim per call

Extract only verifiable claims — a statute, a rate, a procedure, a date — and
check each with search, returning a source and a quote or *unverifiable*
(§1.10). A finding with no source is not a finding. Rank by what the claim
carries in the plan, not by the checker's confidence; confidence is the
number the evaluation review says is noise.

### 3.5 Write scene by scene, each from a fresh anchor

Decomposition is preferred (§1.9); long sessions drift by turn two
(*generation.md* §1.6). Each scene is its own call carrying the plan, the
schedule, the ledger, and the text so far. Nothing continues a transcript.

### 3.6 Screen structure, not affect; count slop outside the model

The §1.5 rows are presence checks with quotes: does the narrator explain the
theme, is emotion rendered as bodily sensation, does the ending resolve
everything, is there a subplot, is the protagonist allowed to be wrong. Run
them per scene and on the ending. Run the lexical slop screen (§1.6) as a
deterministic pass against a human corpus, the way a linter runs. Neither is
a score; each is a flag with a location.

### 3.7 Repair by regeneration, never by polish

A finding becomes a positive constraint in a fresh call that rewrites one
scene or re-derives one section of the plan. No call reads the whole story and
improves it (§1.7). Revisions do not see other revisions (§1.8).

### 3.8 Check the batch for sameness outside any judge

Narrator person and gender, tense, chronology, ending shape, container form,
closing construction — tabulated across finished stories by extraction, not
asked of a judge as "is this like the others". The evaluation review's rule
holds: novelty is a corpus-level measurement.

---

## 4. What to stop doing

| | Why |
| :-- | :-- |
| One call that reads the whole plan and reports problems | Chance at 2,700 words (§1.1) |
| Reasoning budget as the fix for a missed inconsistency | Made it worse (§1.1) |
| Asking a checker to restate or summarise the plan | Introduces holes (§1.1) |
| A finding list without a ranking question | Misses the biggest issue (§1.3) |
| Writing the story in one call | Resolves early; decomposition preferred (§1.4, §1.9) |
| A polish or "improve this" pass over the draft | Removes voice (§1.7) |
| Revisions that see each other | Converge (§1.8) |
| A checker's stated confidence as the ranking | Noise; rank by what the claim carries (§3.4) |
| Asking whether the draft is scary, good, or original | Not measurable (*literature.md* §5) |

---

## 5. Gaps

- **No published fact-check of fiction.** Every pipeline in §1.10 verifies
  expository text. Which claims in a story are the ones that a reader with
  domain knowledge would catch, and how to extract *those*, is untested.
- **Nothing on checking a plan before prose exists.** The plot-hole and
  consistency work reads finished stories. Whether a plan can be checked more
  reliably than a story of the same length is an inference from the length
  cliff, not a result.
- **The beat scaffold was measured on literary short fiction** at EQ-Bench
  prompt lengths. Horror, and stories built on a derived ending, are
  untested.
- **Sequential scene calls versus parallel scene calls from one schedule** is
  unmeasured. Sequential is the practitioner default; parallel is what the
  diversity work would predict; nobody has run the comparison.
- **Two papers could not be read.** The CHI 2026 expert fact-checker study
  (403) and *Red Reading the Text* (Philosophy & Technology, 2025; login
  wall). Both are cited from abstracts.
- **The revision result is from a 3B model** with rubric judging. The claim
  that private revision preserves diversity is plausible and unreplicated at
  frontier scale.

---

## Sources

Sclar et al., *Finding Flawed Fictions* — https://arxiv.org/abs/2504.11900 ·
*Lost in Stories: Consistency Bugs in Long Story Generation by LLMs* — https://arxiv.org/abs/2603.05890 ·
Rashkin, Clark, Huot & Lapata, *Help Me Write a Story*, ACL 2025 — https://aclanthology.org/2025.acl-long.1254/ ·
Sui et al., *Spoiler Alert* — https://arxiv.org/abs/2604.09854 ·
Russell et al., *StoryScope* — https://arxiv.org/abs/2604.03136 ·
Paech & Gökdeniz, *Antislop* — https://arxiv.org/abs/2510.15061 · EQ-Bench slop score — https://eqbench.com/slop-score.html · EQ-Bench longform — https://eqbench.com/creative_writing_longform.html ·
Sourati, Dehghani et al., LLM assistants homogenise style — https://aiweekly.co/alerts/nature-study-finds-llm-rewrites-flatten-linguistic-diversity (press summary) ·
*How LLMs Distort Our Written Language* — https://arxiv.org/abs/2603.18161 ·
Wang et al., *LLM Review* — https://arxiv.org/abs/2601.08003 ·
Huot et al., *Agents' Room*, ICLR 2025 — https://arxiv.org/abs/2410.02603 ·
Gurung & Lapata, *Learning to Reason for Long-Form Story Generation* — https://arxiv.org/abs/2503.22828 ·
Song et al., *VeriScore* — https://aclanthology.org/2024.findings-emnlp.552/ ·
Wei et al., *SAFE* (Long-form factuality) — https://arxiv.org/abs/2403.18802 ·
*Beyond Accuracy: Experts See AI Fact-Checks as Accurate but Less Useful*, CHI 2026 — https://dl.acm.org/doi/10.1145/3772318.3791625 ·
*Red Reading the Text* — https://link.springer.com/article/10.1007/s13347-025-00955-9 ·
*ConWriter* — https://arxiv.org/abs/2608.05169
