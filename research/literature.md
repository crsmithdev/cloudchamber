# Evaluating Horror and SF: What the Literature Supports

A literature review on judging horror and SF premises. The question is not "how is horror written" but
"on what grounds is it judged," and specifically: which of those grounds survive translation into an
instruction given to a blind judge panel.

Bottom line up front: **the criticism offers more than expected, and the computational literature offers
worse news than expected.** There is a real, convergent, centuries-old set of criteria for what makes
a horror premise good. There is also strong published evidence that an LLM judge cannot reliably measure
the single criterion those traditions care most about — surprise/novelty — and that it is systematically
biased toward the fluent, conventional text that every one of those traditions calls failure. The protocol
in §4 is built around that conflict.

---

## 1. What the criticism actually offers

### 1.1 The claims that operationalise

**Carroll — art-horror as threat + impurity.** Carroll's definition is unusually rare in criticism for
being stated as jointly necessary conditions: the monster must be both *threatening* (harmful) and *impure*.
Impurity is cashed out specifically as categorical violation — the monster is "un-natural relative to a
culture's conceptual scheme of nature. They do not fit the scheme, they violate it" — via category jamming,
contagion, or disgust.
([summary](https://caitlinduffy.hcommons.org/2018/07/09/the-philosophy-of-horror-or-paradoxes-of-the-heart-1990/),
[text](https://archive.org/details/philosophyofhorr0000carr))

*Judge-ready: yes, and this is the single best import in the whole review.* It is a two-part conjunctive
test, both parts independently checkable, and it discriminates: a premise that is merely dangerous
(a bear, a gunman) fails impurity; a premise that is merely weird (a fish with too many fins) fails threat.
Ask them separately, not as a blended "is it scary."

*Contested:* Carroll's account is criticised for over-restricting horror to entity-based horror with a
literal monster, and for making disgust criterial. Filippo Contesi argues the emotion Carroll describes is
not what horror audiences actually report
([Contesi, "Carroll on the Emotion of Horror"](https://philpapers.org/archive/CONCOT-10.pdf)). Practically:
Carroll's test will under-reward psychological and atmospheric horror with no monster. Do not use it as a
gate; use it as one positive signal.

**Radcliffe — terror vs horror, and obscurity vs confusion.** "Terror and horror are so far opposite, that
the first expands the soul, and awakens the faculties to a high degree of life; the other contracts,
freezes, and nearly annihilates them." The mechanism is uncertainty: "where lies the great difference
between horror and terror, but in the uncertainty and obscurity, that accompany the first, respecting the
dreaded evil?"
([primary text](https://repositorio.ufsc.br/bitstream/handle/123456789/208925/On%20Supernatural%20in%20Poetry%20(Ann%20Radcliffe).pdf))

*Judge-ready: yes, and the second half is the more useful half.* Radcliffe explicitly separates **obscurity**
(productive: "leaves something for the imagination to exaggerate") from **confusion** (failure: "leaves only
a chaos in which the mind can find nothing to be magnificent"). This is a ready-made discrimination between
a premise that withholds well and a premise that is merely underspecified — which is precisely the failure
mode an LLM generator will produce in bulk. It is one of the few criteria in the criticism that names a
*near-miss* rather than a virtue.

**Todorov — the fantastic as sustained hesitation.** "The fantastic is that hesitation experienced by a
person who knows only the laws of nature, confronting an apparently supernatural event." The fantastic
exists *only* for the duration of the uncertainty; resolving it collapses the work into the uncanny
(natural explanation) or the marvelous (supernatural accepted).
([overview](https://jahsonic.com/TheFantastic.html))

*Judge-ready: partially.* "Does this premise sustain hesitation, or does it resolve on contact?" is a good
question. But note the structural problem for any judging protocol: Todorov's criterion is about the
*duration* of an effect across a text, and a premise has no duration. The answerable question is only whether
the premise *affords* hesitation, which is a proxy and should be labelled one.

**Fisher — the weird and the eerie.** The weird: "a weird entity or object is so strange that it makes us
feel that it should not exist, or at least it should not exist here" — and crucially, the wrongness is in
our categories, not the thing: "it is our conceptions that must be inadequate." The eerie is defined by
*agency*: "the eerie is fundamentally tied up with questions of agency. What kind of agent is acting here?
Is there an agent at all?" — failure of presence, or failure of absence.
([notes](https://bookmarker.dellsystem.me/book/the-weird-and-the-eerie/notes))

*Judge-ready: the eerie, yes; the weird, weakly.* "Is there an unresolved question of agency here — something
acting with no visible actor, or a space where an actor should be and isn't?" is a sharp, answerable
question that discriminates hard. The weird is harder because "should not exist" is close to a restatement
of Carroll's impurity, and asking both double-counts.

**Kristeva — abjection.** "It is thus not lack of cleanliness or health that causes abjection but what
disturbs identity, system, order. What does not respect borders, positions, rules. The in-between, the
ambiguous, the composite."
([primary text PDF](https://andrewstrombeck.com/wp-content/uploads/2017/12/kristeva-powers-of-horror.pdf),
[quotes](https://www.supersummary.com/powers-of-horror/important-quotes/))

*Judge-ready: yes, in its negative form.* Kristeva's own sentence is explicitly a rejection of gross-out as
the criterion — abjection is not filth, it is boundary violation. That yields a clean instruction for
distinguishing a premise that violates a category from one that is merely disgusting. Use the contrast, not
the theory.

**Clute — the four-part grammar.** SIGHTING, THICKENING, REVEL, AFTERMATH. Clute notes the proportions:
"the moment of Sighting may be conveyed in a sentence, but the process of Thickening normally occupies most
of any text being considered."
([Thickening](https://weirdfictionreview.com/2012/11/thickening/),
[review of the Lexicon](https://strangehorizons.com/wordpress/non-fiction/reviews/john-clutes-the-darkening-garden-a-short-lexicon-of-horror/))

*Judge-ready: as a diagnostic, not a score.* Clute's grammar is a structure for finished narratives. Its use
for premises is diagnostic: a premise that is *only* a Sighting (a striking image with nothing to thicken)
is the characteristic thin premise. "Does this contain the material for a Thickening, or is it a single
image?" is a good question. Do not ask a judge to score all four stages of a premise; three of them aren't
there yet.

**Lovecraft — the atmosphere test.** "The one test of the really weird is simply this — whether or not there
be excited in the reader a profound sense of dread, and of contact with unknown spheres and powers."
([quotations](https://www.hplovecraft.com/writings/quotes.aspx),
[full essay](https://americanliterature.com/author/h-p-lovecraft/book/supernatural-horror-in-literature/introduction))

*Judge-ready: no — and this is the clearest example of the sound-rigorous-but-isn't category.* It is phrased
as a test but is a report of a subjective state. Asking an LLM judge "did you feel a profound sense of dread"
elicits a confabulated affect report with no validity. Lovecraft's real contribution here is the *emphasis*
(effect over mechanism), not a usable instrument.

**Suvin — cognitive estrangement and the novum.** SF is defined by "the presence and interaction of
estrangement and cognition," organised around a narrative novum. Suvin goes further than most theorists and
states an explicit quality criterion: "a cognitive — in most cases strictly scientific — element becomes a
measure of aesthetic quality."
([Suvin's own essay](https://strangehorizons.com/wordpress/non-fiction/articles/estrangement-and-cognition/))

*Judge-ready: yes for the two-part structure, no for the value judgment.* "Does the premise contain a novum
(a specific point of departure from the actual), and is that novum treated cognitively (does the story take
its own consequences seriously) rather than decoratively?" is answerable and discriminating.

*Contested — flag this loudly.* Suvin's definition is among the most argued-with in SF criticism. It is
widely read as smuggling in a normative preference for didactic/utopian SF and dismissing fantasy and much
horror as cognitively worthless by definition. See the Suvin/Canavan exchange
([darkosuvin.com](https://darkosuvin.com/2016/02/13/note-to-canavan-9200-words-1979/)) and Gerry Canavan's
critical framing ([Marquette](https://epublications.marquette.edu/cgi/viewcontent.cgi?filename=0&article=1200&context=english_fac&type=additional)).
For a *horror* anthology this matters concretely: applied strictly, Suvin's criterion penalises supernatural
horror as such. Import the novum/consequence structure; leave the "cognition is quality" thesis out.

**Aristotle — structure over spectacle, and the *miaron*.** "Fear and pity may be aroused by spectacular
means; but they may also result from the inner structure of the piece, which is the better way." And the
key exclusion: "Those who employ spectacular means to create a sense not of the terrible but only of the
monstrous, are strangers to the purpose of Tragedy." Plus: "We must not demand of Tragedy any and every kind
of pleasure, but only that which is proper to it."
([Poetics XIV](https://monadnock.net/aristotle/poetics-14.html))

*Judge-ready: yes — the best anti-gross-out instrument in the review, and 2,300 years older than the problem
it solves.* The *miaron* distinction — shocking rather than moving, spectacle substituting for structure — is
exactly the failure mode of an LLM generator reaching for intensity. The third quote is also the strongest
available argument for *genre-relative* judging: do not ask whether the premise is good writing, ask whether
it delivers the pleasure proper to horror.

### 1.2 The claims that sound rigorous and are not

- **Freud/Jentsch on the uncanny.** Genuinely important, but the *unheimlich* is an etiological theory
  (repressed material returning, the familiar made strange) rather than an evaluative one. There is no
  quality criterion in it. It also does not distinguish good from bad horror — a clumsy story can be
  uncanny. Note also that Fisher explicitly positions the weird and the eerie as *outside* the unheimlich,
  which is domestic and inward-facing; using both frameworks at once will double-count.
- **"Cosmic horror" / scale.** Widely invoked, almost never defined in a way that discriminates. Bigness is
  not a criterion; every premise can be made cosmic by adding a clause.
- **Lovecraft's dread test.** See above — a phenomenological report dressed as a test.
- **Thacker's "world-without-us."** ([*In the Dust of This Planet*](https://www.johnhuntpublishing.com/zer0-books/our-books/in-dust-of-this-planet-horror-philosophy))
  Philosophically rich and a good generative prompt, but it describes a *subject matter*, not a standard.
  It cannot separate a good unthinkable-world premise from a bad one.
- **Joshi's quality verdicts.** Joshi is unusually willing to state that specific weird tales are bad, but
  his criterion is largely coherence-of-worldview — whether the tale expresses a consistent philosophical
  vision. That is a real criterion, but it is heavily entangled with agreeing with Lovecraft's
  materialism, and it does not generalise to a judge panel.
- **Any criterion phrased as "is it original."** See §3 — this is the one an automated judge measurably
  cannot do.

---

## 2. The convergences

Where traditions that never read each other agree, the criterion is worth more. Five convergences:

**C1 — Category violation, not harm, is the core of horror.**
Carroll's impurity (category jamming), Kristeva's abjection ("what does not respect borders, positions,
rules... the in-between, the ambiguous, the composite"), and Fisher's weird ("it is our conceptions that
must be inadequate") are three independent arrivals at the same claim from analytic aesthetics,
psychoanalysis, and cultural theory respectively. Note that Kristeva and Carroll agree on the *negative*
too: neither thinks disgust or filth is the criterion. **This is the strongest single criterion here.**

**C2 — Structure beats spectacle; the shocking is not the horrifying.**
Aristotle's *miaron* exclusion (c. 335 BCE), Radcliffe's terror/horror distinction (1826), and the
Strange Horizons editorial cliché list (2020s, empirical) converge exactly. Aristotle says spectacle
producing the monstrous is "strangers to the purpose"; Radcliffe says the clarified threat "contracts,
freezes, and nearly annihilates"; the editors' list is dominated by premises whose entire content is a
final shock. Three traditions, ~2,400 years, one criterion: **a premise whose whole payload is its
shock is a failed premise.**

**C3 — Withheld explanation is productive; absent explanation is not.**
Radcliffe's obscurity-vs-confusion, Todorov's sustained hesitation, and Fisher's eerie (an unresolved
question of agency, not an unasked one) all distinguish deliberate withholding from vagueness. This
convergence is valuable because it names the *near-miss*, and near-misses are what a generator produces
most of.

**C4 — The novum must have consequences.**
Suvin's cognition requirement, Clute's Thickening (the Sighting is a sentence; the Thickening is the text),
and Carroll's plot structure of discovery and confirmation all say a premise must *afford development*
rather than terminate in itself. Independently, the editorial evidence agrees: Strange Horizons' single
largest cliché category is the premise with no narrative beyond its own statement ("a place is haunted,
with no plot").

**C5 — Judge against the genre's proper pleasure, not against literary quality in general.**
Aristotle ("not any and every kind of pleasure, but only that which is proper to it"), Suvin (SF quality is
SF-specific), and Joshi (the weird tale judged as a weird tale) agree. Practical consequence: **a panel should
not be asked whether the premise is "good," but whether it is good *horror*.** A generic quality question is
the single easiest way to import an LLM judge's bias toward polished, conventional, well-formed prose.

---

## 3. Known failure modes of automated judging

This is where the news is bad, and it should govern the design.

### 3.1 The disqualifying finding: judges cannot measure surprise

*The Limits of Automatic Evaluation of Creativity in Large Language Models*
([arXiv:2608.23705](https://arxiv.org/html/2608.23705)) tested LLM judges against human ratings across 11
creativity dimensions on human-authored stories:

| Dimension | Kendall τ_b vs human |
|---|---|
| Elaboration | 0.31 (p < 0.001) |
| Creativity | 0.23 |
| **Surprise** | **0.01 (p = 0.867)** |
| Effectiveness, Novelty, Surprise, Usefulness | not statistically significant |

The purpose-built "Creativity Index" correlated with human creativity judgments at ρ = 0.07. The same paper
finds LLM judges "exhibit a systematic preference for AI-generated stories."

**Read that against §2.** Surprise and novelty are load-bearing in every tradition surveyed. The judge is
measurably unable to detect them — not weakly, but at zero. Any rubric line item called "originality,"
"surprise," or "novelty" will return noise that looks like signal.

Corroborating, from the closest methodological analogue available — Si, Yang & Hashimoto's blind expert
review of research *ideas* rather than executed work
([arXiv:2409.04109](https://arxiv.org/html/2409.04109)) — every LLM judge scored at or below chance at
ranking ideas: Claude-3.5 pairwise 53.3%, GPT-4o pairwise 45.0%, direct scoring 50–51.7%, "AI Scientist"
agent 43.3%. Human experts reached only 56.1% balanced accuracy themselves (vs. 66% for NeurIPS 2021 and
71.9% for ICLR 2024 on full papers), which the authors attribute to "the higher subjectivity involved when
evaluating ideas without seeing actual experiment results." They explicitly caution against trusting LLM
evaluation for this task.

**This is the single most important finding in the review, because the task in that paper is the same task:
blind evaluation of unexecuted premises.**

### 3.2 Self-preference, and why it points the wrong way for horror

Self-preference bias is real and largest in the strongest models
([arXiv:2410.21819](https://arxiv.org/html/2410.21819v1)). Zheng et al. measured GPT-4 favouring its own
outputs by ~10 percentage points of win rate over human judgment, Claude-v1 by ~25
([arXiv:2306.05685](https://arxiv.org/pdf/2306.05685)).

The mechanism matters more than the magnitude. The 2410.21819 authors find the bias is driven by
**perplexity, not self-recognition**: judges "assign significantly higher evaluations to outputs with lower
perplexity than human evaluators," regardless of who wrote them, and the bias persists when the judge is not
told which output is its own.

**A low-perplexity preference is, definitionally, a preference for the expected.** Every criterion in §2 —
Carroll's category violation, Fisher's "our conceptions must be inadequate," Suvin's estrangement, Radcliffe's
obscurity — rewards text the model finds *unlikely*. The judge's bias runs directly opposite to the
criterion. This is not a nuisance bias to be averaged out; it is anti-correlated with the thing being
measured.

*Mitigation:* self-preference cannot be fixed by telling the judge to be fair (it operates without
self-recognition). Use judges from a different model family than the generator, and treat cross-family
disagreement as signal rather than noise. Accept that residual bias remains.

### 3.3 Position bias

Zheng et al. ([arXiv:2306.05685](https://arxiv.org/pdf/2306.05685)), consistency under swapping A/B order:

| Judge | Consistency | First-position preference |
|---|---|---|
| GPT-4 | 65.0% | 30.0% |
| GPT-3.5 | 46.2% | 50.0% |
| Claude-v1 | 23.8% | 75.0% |

*Mitigation, well-established:* evaluate both orders (A|B and B|A) and average, or declare a tie when the
two disagree. EQ-Bench does exactly this in production
([eqbench.com/about](https://eqbench.com/about.html)). Few-shot judging raised GPT-4 consistency from 65.0%
to 77.5% (Zheng et al., Table 12). **Never run a single-order pairwise comparison.**

### 3.4 Verbosity and style distraction

Zheng et al.'s "repetitive list attack" — lengthening answers without adding content — fooled GPT-3.5 and
Claude-v1 91.3% of the time and GPT-4 8.7% of the time.

More alarming for premise judging, *Pairwise or Pointwise?*
([arXiv:2504.14716](https://arxiv.org/html/2504.14716v1)) introduces **"distracted evaluation"**: injecting
stylistic distractors (assertiveness, prolixity, sycophancy) flipped **pairwise** preferences ~35% of the
time versus ~9% for absolute scoring. Pairwise judges also refuse ties — 2.4–7.3% tie rates on
objectively-equivalent responses, against 84.6–93.2% identical scores under absolute scoring.

*Mitigation:* truncate/normalise length before judging (EQ-Bench caps at 4,000 characters). More important
still: **normalise premise style before judging.** Si et al. did exactly this — an LLM rewrote all ideas
into a uniform style, after which experts could distinguish AI from human ideas at 50% (chance). Without
this, what is measured is prose polish.

### 3.5 Judge self-inconsistency

*Rating Roulette* ([arXiv:2510.27106](https://arxiv.org/html/2510.27106v1)) measures whether a judge agrees
*with itself* across repeated runs. On MT-Bench ranking, Krippendorff's α: Llama 3.1 0.265, DeepSeek-R1
0.507, Qwen-3 0.563 — all below the conventional 0.8 threshold. The best model "gave the same judgment on
all 3 runs for only 61.3% of cases." Human–LLM agreement α ranged 0.239–0.426.

*Mitigation:* majority-vote across repeated samples; report chance-corrected agreement (Krippendorff's α),
not raw accuracy, which inflates. Note their caveat that disabling temperature sampling reduced variance but
*degraded performance* — so sample and aggregate rather than going greedy.

### 3.6 The pairwise-vs-absolute question is genuinely contested

This is not settled, whatever is claimed for either side. The evidence splits **by rater type**:

- **For human raters, pairwise is more reliable.** Six radiologists rating CT image quality: ICC 0.785
  (pairwise) vs 0.665 (Likert) on a high-variation set, and 0.562 vs 0.276 on a low-variation set — i.e.
  the advantage *grows* as items become more similar. Cost: ~3× the time.
  ([Eur Radiol 2024](https://link.springer.com/article/10.1007/s00330-023-10493-7);
  see also [AJR 2015](https://ajronline.org/doi/10.2214/AJR.14.13022))
- **For LLM raters, pairwise is more manipulable.** 35% vs 9% flip rates under style distractors, and
  near-total refusal to tie ([arXiv:2504.14716](https://arxiv.org/html/2504.14716v1)).

Both can be true: pairwise removes the human's scale-anchoring problem but amplifies the LLM's stylistic
sensitivity. The resolution in §4 is to use pairwise where the comparison is the point and forced ties are
permitted, and absolute scoring where calibration matters — not to pick a global winner.

### 3.7 Metrics-vs-human correlation generally

HANNA ([COLING 2022](https://aclanthology.org/2022.coling-1.509/),
[arXiv:2208.11646](https://arxiv.org/abs/2208.11646)) benchmarked 72 automatic metrics against 6 human
criteria (Relevance, Coherence, Empathy, Surprise, Engagement, Complexity). Two findings transfer:

- Story-level correlations are weak-to-moderate (best: BARTScore Kendall τ 42.6%); **system-level
  correlations are far higher** (BARTScore 92.7%, BERTScore 91.1%). Automatic evaluation is much better at
  ranking *generators* than at ranking *individual items*.
- Human inter-annotator agreement itself was only ICC2k 0.29 (Coherence) to 0.56 (Complexity) — "fair" to
  "moderate," and the authors note this is normal for NLG evaluation.

**Design consequence:** a judge panel is more trustworthy as a comparator of generator configurations across
many premises than as a verdict on any single premise — and this is a claim about coarsely different
generators, not about telling two near-identical prompt variants apart. Say so wherever the protocol is
documented.

### 3.8 Homogenisation

LLM generations converge on a narrow plot distribution
([PNAS 2025, "Echoes in AI"](https://www.pnas.org/doi/10.1073/pnas.2504966122);
[Homogenizing effect of LLMs on creative diversity](https://www.sciencedirect.com/science/article/pii/S294988212500091X);
[arXiv:2508.01491](https://arxiv.org/html/2508.01491v2)). Combined with §3.2 (judges prefer low perplexity),
generator and judge push in the same direction: toward the middle. A protocol with no explicit
diversity term will converge and the scores will *rise* as it does.

*Mitigation:* measure inter-premise diversity as a **batch-level metric outside the judge** (embedding
dispersion, distinct-n, or near-duplicate clustering over the premise set). Never ask a judge whether a
premise is original — ask the corpus.

---

## 4. Recommended judge protocol

Design principles, in priority order: (1) never ask the judge a question the literature says it cannot
answer; (2) measure structure, not affect; (3) make everything order-symmetric and repeated; (4) put
novelty outside the judge.

### 4.1 Ask these — binary, evidence-anchored, one construct each

Run each as an independent binary judgment with a required one-sentence quotation or span from the premise
as justification. Binary because §3.5 shows fine-grained scales are not reproducible; evidence-anchored
because it forces grounding and makes the panel auditable.

1. **Threat.** Does the premise contain something that would harm or endanger someone in it? (Carroll)
2. **Category violation.** Does it violate a boundary — between living and dead, self and other, inside and
   outside, animal and human, one thing and another? Not: is it disgusting. (Carroll ∩ Kristeva ∩ Fisher; **C1**)
3. **Agency question.** Is there an unresolved question about *what is acting* — something acting with no
   actor, or an actor-shaped absence? (Fisher's eerie)
4. **Obscurity vs confusion.** Is what is withheld withheld *deliberately and legibly* — leaving something
   for the imagination to exaggerate — or is the premise simply underspecified? Forced binary: OBSCURE or
   CONFUSED. (Radcliffe; **C3**)
5. **Thickening potential.** Does the premise contain material for development beyond its own statement, or
   is it a single image / a single reveal? (Clute ∩ Suvin ∩ editorial evidence; **C4**)
6. **Spectacle dependence.** Is the premise's entire payload a shock, a gross-out, or a final twist?
   (Aristotle's *miaron* ∩ Radcliffe ∩ Strange Horizons; **C2**) — scored as a **negative**.
7. **Consequence.** If there is a novum or point of departure, does the premise take its own consequences
   seriously? (Suvin, stripped of his normative thesis)

Items 1–5 and 7 positive; item 6 negative. Report the profile, not only the sum — a premise that is all
threat and no category violation is a different failure from one that is all image and no thickening, and
collapsing them to a scalar destroys the diagnostic value.

### 4.2 Add a cliché screen, from revealed editorial preference

Strange Horizons publishes a horror-specific list of overused premises
([Horror Stories We've Seen Too Often](https://strangehorizons.com/submit/fiction-submission-guidelines/horror-stories-weve-seen-too-often/)),
and a general one
([Stories We've Seen Too Often](https://strangehorizons.com/wordpress/submit/fiction-submission-guidelines/stories-weve-seen-too-often/));
Clarkesworld publishes its own ([submission guidelines](https://clarkesworldmagazine.com/submissions/)).
These are the highest-value documents in the entire review for practical purposes, because they are
*empirical* — distilled from real slush at scale, stating what fails rather than what succeeds.

The horror list clusters into: protagonist-is-dead/is-the-killer twists; the-madman-was-right; place-is-
haunted-with-no-plot; supernatural-inevitability; ironic-comeuppance; abuse-as-backstory-for-monstrosity.
Note that these are almost entirely **twist-dependent or single-reveal** structures — the same failure
Aristotle and Radcliffe name.

Implement as a retrieval-style match against an enumerated list, **not** as a judge asked "is this a
cliché" — the latter is a novelty judgment and falls under §3.1.

### 4.3 Refuse to ask these

- **"Is this original / novel / surprising?"** τ_b = 0.01 for surprise; novelty not significant
  ([arXiv:2608.23705](https://arxiv.org/html/2608.23705)). This will produce confident noise.
  Handle novelty at corpus level (§3.8).
- **"Did you find this frightening / how much dread did you feel?"** Confabulated affect report. Lovecraft's
  test is not implementable.
- **"Is this good?" / "Rate overall quality 1–10."** Invites the low-perplexity/polish bias directly
  (§3.2), and violates C5. A scalar, if one is needed, should be derived from §4.1 rather than asked for.
- **Fine-grained scales (1–10).** Not reproducible across runs ([arXiv:2510.27106](https://arxiv.org/html/2510.27106v1)).
- **Any single-order pairwise comparison.** §3.3.

### 4.4 Forced-choice vs rating — the split

Given the contested evidence in §3.6:

- **Use binary forced-choice for the §4.1 construct questions.** Each is a genuine yes/no about presence of
  a structural feature, not a magnitude. This sidesteps the scale-anchoring problem entirely.
- **Use pairwise comparison only for same-construct head-to-heads within a matched pair**, with ties
  explicitly permitted and encouraged, both orders run and averaged. Ties must be allowed because §3.4 shows
  LLM pairwise judges manufacture spurious distinctions (2.4–7.3% tie rates on identical-quality items).
- **Use absolute scoring for nothing that matters.** A leaderboard across generator configurations is better
  built from aggregated binary rates, which is also where HANNA says automatic evaluation is actually
  reliable (system-level, not item-level — §3.7).

### 4.5 Protocol mechanics

| Concern | Measure |
|---|---|
| Position bias (§3.3) | Both orders, averaged; disagreement → tie |
| Style/verbosity (§3.4) | Normalise every premise to uniform length and register *before* judging, per Si et al. |
| Self-preference (§3.2) | Judge family ≠ generator family; treat cross-family disagreement as signal |
| Self-inconsistency (§3.5) | ≥3 samples per judgment, majority vote, temperature on |
| Reporting | Krippendorff's α, not raw agreement; publish α alongside every score |
| Anchoring | 2–3 worked examples per construct (few-shot raised consistency 65.0%→77.5%) |
| Diversity (§3.8) | Batch-level embedding dispersion, computed outside the judge |
| Validation | Hold out a human-rated calibration set; if judge–human α < ~0.4, the construct is not measurable — retire it |

That last row is the important one. **The human calibration set comes first.** Without it there is no way to
distinguish a working judge from a confidently wrong one, and every number above says confidently wrong is
the default state.

---

## 5. What is not measurable

Stated plainly, so nobody builds on sand:

1. **Whether a premise is original.** Not by the judge. Zero measured correlation on surprise
   ([arXiv:2608.23705](https://arxiv.org/html/2608.23705)). Corpus-level diversity is a proxy for
   *non-repetition*, which is not the same thing as originality and should never be relabelled as such.
2. **Whether a premise is frightening.** Fear is a reader-state. No validated instrument takes a text as
   input and returns fear as output. The Morbid Curiosity Scale
   ([Scrivner 2021, α = 0.94, 4 factors: Minds of Dangerous People, Paranormal Danger, Body Violation,
   Interpersonal Violence](https://gwern.net/doc/psychology/personality/2021-scrivner.pdf)) and the
   Transportation Scale–Short Form
   ([Appel et al., 6 items, α = .77–.88](https://www.mcm.uni-wuerzburg.de/fileadmin/06110300/user_upload/Publikationen/Appel-_Gnambs-_Richter-_-_Green_-_TS-SF_-_PREPRINT.pdf))
   are both properly validated — and both measure **persons, not texts.** MCS measures a stable disposition
   that predicts horror fandom (β = 0.48); it does not score a story. Do not repurpose either as a rubric;
   that would be an unvalidated use of a validated instrument, which is worse than an honest ad-hoc scale.
3. **How good the finished story will be.** The object judged is a premise. Si et al.'s follow-up
   ([The Ideation–Execution Gap, arXiv:2506.20803](https://arxiv.org/abs/2506.20803)) found that ideas
   rated more novel before execution *did not* retain their advantage once executed. Premise quality is a
   weak predictor of executed quality, in the one domain where this has been measured end-to-end.
4. **Any single premise's absolute quality.** HANNA: item-level metric correlation is weak; system-level is
   strong. A judge panel can rank generator configurations. It should not be quoted on individual premises.
5. **The ceiling.** Human experts agreed only 56.1% on idea quality
   ([arXiv:2409.04109](https://arxiv.org/html/2409.04109)); human raters on story criteria reached ICC2k
   0.29–0.56 ([HANNA](https://aclanthology.org/2022.coling-1.509/)). **A judge that agrees with humans more
   than humans agree with each other is broken, not excellent.** Set the target at human-level agreement and
   treat anything above it as a bug — most likely the judge has latched onto a stylistic regularity.
6. **Whether the rubric is the right rubric.** Nothing in this review validates the *selection* of criteria
   in §4.1 against reader outcomes. The convergences in §2 are evidence that these criteria are what
   critics have independently cared about; they are not evidence that premises scoring well on them produce
   stories readers find frightening. That link is untested and, absent a reader study, untestable here.

---

## Sources

Criticism and theory
- Carroll, *The Philosophy of Horror* — [archive](https://archive.org/details/philosophyofhorr0000carr) · [summary](https://caitlinduffy.hcommons.org/2018/07/09/the-philosophy-of-horror-or-paradoxes-of-the-heart-1990/) · [Contesi critique](https://philpapers.org/archive/CONCOT-10.pdf)
- Radcliffe, "On the Supernatural in Poetry" — [PDF](https://repositorio.ufsc.br/bitstream/handle/123456789/208925/On%20Supernatural%20in%20Poetry%20(Ann%20Radcliffe).pdf)
- Todorov, *The Fantastic* — [overview](https://jahsonic.com/TheFantastic.html) · [excerpt](https://openlab.citytech.cuny.edu/profscanlan-eng2001-o535-fall2021/files/2021/09/pdf-The-Fantastic_Todorov-Scanlan.pdf)
- Fisher, *The Weird and the Eerie* — [notes](https://bookmarker.dellsystem.me/book/the-weird-and-the-eerie/notes)
- Kristeva, *Powers of Horror* — [PDF](https://andrewstrombeck.com/wp-content/uploads/2017/12/kristeva-powers-of-horror.pdf) · [quotes](https://www.supersummary.com/powers-of-horror/important-quotes/)
- Clute, *The Darkening Garden* — [Thickening](https://weirdfictionreview.com/2012/11/thickening/) · [Revel](https://weirdfictionreview.com/2012/11/revel/) · [Horror](https://weirdfictionreview.com/2012/10/horror/) · [review](https://strangehorizons.com/wordpress/non-fiction/reviews/john-clutes-the-darkening-garden-a-short-lexicon-of-horror/)
- Suvin, "Estrangement and Cognition" — [text](https://strangehorizons.com/wordpress/non-fiction/articles/estrangement-and-cognition/) · [Suvin/Canavan](https://darkosuvin.com/2016/02/13/note-to-canavan-9200-words-1979/) · [Canavan](https://epublications.marquette.edu/cgi/viewcontent.cgi?filename=0&article=1200&context=english_fac&type=additional)
- Aristotle, *Poetics* — [ch. XIV](https://monadnock.net/aristotle/poetics-14.html) · [ch. XIII](https://monadnock.net/aristotle/poetics-13.html) · [IEP](https://iep.utm.edu/aristotle-poetics/)
- Lovecraft, *Supernatural Horror in Literature* — [text](https://americanliterature.com/author/h-p-lovecraft/book/supernatural-horror-in-literature/introduction) · [quotations](https://www.hplovecraft.com/writings/quotes.aspx)

Editorial / revealed preference
- [Strange Horizons — Horror Stories We've Seen Too Often](https://strangehorizons.com/submit/fiction-submission-guidelines/horror-stories-weve-seen-too-often/)
- [Strange Horizons — Stories We've Seen Too Often](https://strangehorizons.com/wordpress/submit/fiction-submission-guidelines/stories-weve-seen-too-often/)
- [Clarkesworld submission guidelines](https://clarkesworldmagazine.com/submissions/) · [Neil Clarke on fast rejections](https://neil-clarke.com/on-fast-rejections/)
- [Shirley Jackson Awards — rules](https://www.shirleyjacksonawards.org/rules/) · [Clarke Award](https://www.clarkeaward.com/) · [What is the point of awards?](http://csff-anglia.co.uk/clarke-shadow-jury/what-is-the-point-of-awards/)

Empirical / psychological
- [Scrivner, Morbid Curiosity Scale (PDF)](https://gwern.net/doc/psychology/personality/2021-scrivner.pdf) · [journal](https://www.sciencedirect.com/science/article/abs/pii/S0191886921005183)
- [Appel et al., Transportation Scale–Short Form](https://www.mcm.uni-wuerzburg.de/fileadmin/06110300/user_upload/Publikationen/Appel-_Gnambs-_Richter-_-_Green_-_TS-SF_-_PREPRINT.pdf) · [Green & Appel review](https://www.mcm.uni-wuerzburg.de/fileadmin/06110300/2024/Pdfs/Green___Appel__2024__Advances_Preprint.pdf) · [Green & Brock 2000](https://pubmed.ncbi.nlm.nih.gov/11079236/)
- [Consensual Assessment Technique — a CAT with caveats](https://www.tandfonline.com/doi/full/10.1080/21650349.2015.1084893) · [A Scattered CAT](https://www.researchgate.net/publication/332682639_A_scattered_CAT_A_critical_evaluation_of_the_consensual_assessment_technique_for_creativity_research) · [CAT reliability over time](https://onlinelibrary.wiley.com/doi/full/10.1002/jocb.462)

Computational evaluation
- [Zheng et al., Judging LLM-as-a-Judge (MT-Bench)](https://arxiv.org/pdf/2306.05685) · [abs](https://arxiv.org/abs/2306.05685)
- [Limits of Automatic Evaluation of Creativity](https://arxiv.org/html/2608.23705)
- [Si, Yang & Hashimoto, Can LLMs Generate Novel Research Ideas?](https://arxiv.org/html/2409.04109) · [Ideation–Execution Gap](https://arxiv.org/abs/2506.20803)
- [Self-Preference Bias in LLM-as-a-Judge](https://arxiv.org/html/2410.21819v1)
- [Pairwise or Pointwise? Feedback Protocols for Bias](https://arxiv.org/html/2504.14716v1)
- [Rating Roulette: Self-Inconsistency in LLM-as-a-Judge](https://arxiv.org/html/2510.27106v1)
- [HANNA: Of Human Criteria and Automatic Metrics](https://aclanthology.org/2022.coling-1.509/) · [arXiv](https://arxiv.org/abs/2208.11646)
- [Pairwise vs Likert for subjective image quality (Eur Radiol)](https://link.springer.com/article/10.1007/s00330-023-10493-7) · [AJR 2015](https://ajronline.org/doi/10.2214/AJR.14.13022)
- [EQ-Bench creative writing methodology](https://eqbench.com/about.html) · [repo](https://github.com/EQ-bench/creative-writing-bench)
- [Echoes in AI: plot diversity (PNAS)](https://www.pnas.org/doi/10.1073/pnas.2504966122) · [Homogenizing effect on creative diversity](https://www.sciencedirect.com/science/article/pii/S294988212500091X) · [Homogenizing effect on expression and thought](https://arxiv.org/html/2508.01491v2)
- [Do Language Models Enjoy Their Own Stories?](https://arxiv.org/html/2405.13769) · [Rulers: locked rubrics, evidence-anchored scoring](https://arxiv.org/html/2601.08654)
