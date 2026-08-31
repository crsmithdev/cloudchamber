# EVALS — measuring the playbook, not the story

*This grades `playbook.md`. It does not grade a story, and no generator consults it. That distinction is the whole design: the moment a generator is allowed to read this, it becomes a rubric, and §0 is not a rubric.*

## What this can and cannot tell you

It is a **comparator of playbook variants**, not a verdict on any single premise. Item-level agreement between automated judges and human raters is weak; system-level agreement is strong. So "premise 4 scored badly" means nothing. "Premises generated without §2.20 scored worse than premises generated with it" means something.

Three things are deliberately **never asked**, because the literature shows judges return confident noise on them: is it original, is it surprising, did you feel dread. A judge rating creativity dimensions against human raters scores about zero correlation on surprise. Nothing in here has an originality axis.

Two ceilings are worth remembering. Human experts blind-reviewing unexecuted research *ideas* agreed with each other 56% of the time; the best automated judges were at or below chance. And a judge that agrees with people more than people agree with each other has latched onto a stylistic regularity, not a quality.

## The tests

### 1. Degradation detection — does the judge see what §0 claims matters

Six synopses from `stories/`, each damaged six ways, one §0 property removed per variant, length matched within 10% and voice held constant:

| | removes |
| :-- | :-- |
| `D1_no_impossibility` | the speculative element — the premise becomes accurate journalism |
| `D2_no_turn` | the goodness of the mechanism — it becomes defective or malicious instead |
| `D3_generic` | the particulars — counts, durations, named instruments |
| `D4_reckoning` | adds one — somebody understands, or is exposed, or is punished |
| `D5_exit` | adds a usable one |
| `D6_small` | the scale — a population becomes a handful |

Intact against damaged, both orders, forced choice with ties permitted. A judge that cannot rank the intact original above its own damaged version cannot be trusted on anything else.

### 2. The decoy control — is the judge discriminating or performing

Half the pairs are two unrelated slate synopses, where no correct answer exists. **A judge that never ties on decoys is manufacturing distinctions, and its accuracy on the real pairs is meaningless.** This is the load-bearing control and it should be run every time. Pairwise judges are known to invent differences between items of identical quality; the decoy tie rate is what catches it.

### 3. Design leakage — the failure this harness has already had

Presented with all 72 pairs of test 1 at once, a judge worked out that it was looking at an ablation study and said so. Once that happens it is inferring the experiment rather than reading the text, and the result is void. Mitigations, all now standard here: interleave decoys, keep batches small, never state or imply the construction, and instruct the judge to discard any reasoning about the shape of the set.

## Protocol

Forced choice, **ties permitted and encouraged**. Both orders, averaged. No numeric scales. No overall-quality question. The question is genre-relative — *which is the stronger horror premise* — never *which is better*, which imports a preference for polish. Judge model should differ from generator model; self-preference in these judges tracks low perplexity rather than authorship, which means it rewards the expected, which is the opposite of the register.

## Files

- `corpus/slate.json` — the 24 developed synopses, the standard
- `corpus/degraded.json` — 36 damaged variants
- `corpus/pairs_blind.json`, `corpus/control_blind.json` — what a judge sees
- `corpus/pairs.json`, `runs/control_key.json` — answer keys, never shown to a judge
- `prompts/` — the judge prompts as run
- `runs/` — results
- `score.py <key> <run>` — accuracy excluding ties, position bias, decoy tie rate, per-degradation detection, order consistency

## Run of 2026-08-31

| judge | real pairs | ties | per-construct |
| :-- | :-- | :-- | :-- |
| opus, naive | 72/72 | 0 | all six at 100% |
| sonnet, naive | 72/72 | 0 | all six at 100% |
| haiku, naive | 56/69 | 1 | D3, D6 at 100%; D1 64%; D4 58% |
| opus, given §0 | 72/72 | 0 | all six at 100% |
| **opus, decoy control** | **18/18** | **0** | **44% ties on decoys** |

The first four runs are contaminated by the leakage in test 3. The control run is not, and it holds: perfect discrimination where a difference exists, ties on nearly half the pairs where none does.

**The finding worth keeping.** Haiku, which did not infer the design, splits §0's properties in two. Specificity, scale and the turn it detects naively — those are horror craft that any competent reader feels. The absent impossibility and the added reckoning it is near chance on. Those two are **house conventions rather than universals**, which means the playbook has to enforce them, because a reader will not supply them and will not miss them.

## Next

Generated premises against the slate, same protocol. Then ablation: regenerate with one section removed and compare. That is what the harness is for.
