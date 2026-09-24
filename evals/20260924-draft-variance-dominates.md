# Draft-to-draft variance is twice the effect we are measuring

24 September. No new drafting: twelve fresh judge passes over drafts that
already existed, $0.55, 198 s. The question was whether the register cut of 23
September becomes readable under the corrected floor rule. It does not, and the
reason is worse than the original verdict.

## What was run

`evals/20260923-register-cut.md` was rejected as unreadable because both its
floor pairs hung off `cut1`, the weakest of its three drafts. The corrected rule
pairs all three — 1 v 2, 1 v 3, 2 v 3 — and `cut2 v cut3` had never been asked.
It was asked now, with the same three judges and the same four passes each.

| floor | pairs | passes | share |
| --- | --- | --- | --- |
| as run on 23 Sep | cut1–cut2, cut1–cut3 | 24 | 0.29 |
| all three pairings | + cut2–cut3 | 36 | **0.26** |

Read the way `tally.py` reads it, the register cut's comparison share of 0.39
against a floor of 0.26 is a gap of 0.13 and **clears the floor**. That reading
is wrong.

## Why it is wrong

A within-arm floor compares two drafts of the same code. Which of the two is
called `ours` is arbitrary — there is no arm under test. So the floor's
*direction* carries no information, and only its *distance from a coin flip*
does. A floor that lands at 0.26 makes anything above 0.36 "clear", including a
comparison that is more balanced than the floor pairs are.

Each within-arm pair on its own, `ours` being the first-named draft:

| pair | share | distance from 0.5 |
| --- | --- | --- |
| cut1 v cut2 | 0.38 | 0.12 |
| cut1 v cut3 | 0.25 | 0.25 |
| cut2 v cut3 | 0.19 | 0.31 |
| last1 v last2 | 0.75 | 0.25 |
| last1 v last3 | 0.46 | 0.04 |
| pres1 v pres2 | 0.62 | 0.12 |

Two drafts of one arm sit a mean of **0.18** from a coin flip across all six
pairs, and **0.23** across the register cut's three. The register cut's
comparison sits **0.11** from a coin flip.

**The arms differ by half as much as two drafts of one arm do.**

## The per-pair numbers say the same thing louder

Pooled over three matched pairs, the cut arm scores 0.39. The three pairs
underneath it are:

| pair | share |
| --- | --- |
| cut1 v fix1 | 0.00 |
| cut2 v fix2 | 0.72 |
| cut3 v fix3 | 0.00 |

Two pairs where every judge in both reading orders took `fix`, and one where
most took `cut`. That is not one measurement with noise on it; it is three
measurements that disagree. The same shape appears in the other arms —
`last1/fix1` 0.00 against `last3/fix3` 0.11, `pres2/fix2` 0.75 against
`pres3/fix3` 0.08.

The panel is close to deterministic **within** a pair and wildly inconsistent
**across** pairs. The variance lives between drafts, not between passes, and
adding passes cannot reach it.

## What it is not

Length was the obvious suspect and it is not the cause. Over fifteen pairs the
longer draft won nine — chance. The drafts range 9,009 to 10,644 words and the
ranking does not follow.

## What follows

1. **The floor statistic is distance from 0.5, not the share.** `tally.py`'s
   `share - floor > 0.1` can flip a verdict on which draft happened to be named
   first. This is the third defect found in the floor rule in two days, and the
   first two both changed a run's conclusion.
2. **Three drafts a side is not enough for an effect this size.** A 0.11
   difference under a 0.18–0.23 per-draft spread is not resolvable at n=3. The
   replication run of 22 September already said three were needed to see past
   the schedule; this says three are not enough to see past the draft.
3. **This is the real reason the three runs of 23 September all failed to
   land.** The conclusion recorded then was that the prompts sit at a local
   optimum. The better-supported conclusion is that the instrument could not
   resolve the change either way, and only the cost differences — which are
   deterministic and were measured directly — were ever trustworthy.
4. **Beat-level judging (L1, step 3) is now the priority over more L2 runs.** A
   beat pair holds the brief, the schedule and the story so far fixed, so it
   removes exactly the between-draft variance that is swamping L2. The
   calibration the sequence already owes should ask whether L1's spread is
   narrower, not only whether it reproduces L2's losses.

## Caveats

Six within-arm pairs, each pooled over 12 passes, on one brief. The distance
statistic is not the protocol's and has not been agreed. Nothing here says the
register cut is good or bad; it says the run could not tell, and neither could
the two beside it.

## Correction, the same day

`evals/20260924-judged-at-24-passes.md` judged these pairs again at 24
passes a judge. Two claims above do not hold:

- "The panel is close to deterministic within a pair" is false. `cut2 v cut3`
  moved from 0.19 to 0.55. The judges follow the reading order on about 80%
  of passes, so four passes carry about one informative pass each.
- "Twice the effect" becomes "about the same size": the floor sits 0.16 from
  a coin flip and the comparison sits 0.15.

The main claim holds. Draft-to-draft variance is real (`cut1` never won when
read second, 0/72), and three drafts an arm cannot resolve the register cut.
