# Judged at 24 passes: order-following is the noise, draft variance is real

24 September. No new drafting. Seven pairs that already existed, judged again
by the same three judges at **24 passes each** instead of 4: 504 passes,
$14.13. The rows are in `bank/judgements.jsonl`, experiments
`20260924-register-cut-x24`, `20260924-l2-floor-cut2-cut3-x24` and
`20260924-l1-beat1-5bfc-48ec-x24`.

## The numbers

"Read 2nd" is how often `ours` won when the judge read it second. That half
is free of the reading-order bias. The halves are the pool of passes 1–12 and
13–24.

| pair | kind | 4 passes | 24 passes | halves | ours won, read 2nd |
| --- | --- | --- | --- | --- | --- |
| cut1 v cut2 | floor | 0.38 | 0.33 | 0.23 / 0.40 | 0/36 |
| cut1 v cut3 | floor | 0.25 | 0.23 | 0.21 / 0.22 | 0/36 |
| cut2 v cut3 | floor | 0.19 | **0.55** | 0.57 / 0.54 | 6/36 |
| cut1 v fix1 | comparison | 0.00 | 0.19 | 0.22 / 0.16 | 2/36 |
| cut2 v fix2 | comparison | 0.72 | 0.65 | 0.71 / 0.60 | 7/36 |
| cut3 v fix3 | comparison | 0.00 | 0.22 | 0.25 / 0.17 | 2/36 |
| 5bfc v 48ec, beat 1 | L1 floor | 1.00 | **0.71** | 0.68 / 0.75 | 10/12 from gpt-5.1 |

Register cut, pooled: comparison **0.35** (0.15 from a coin flip), floor mean
distance **0.16**.

## What it says

**The judges follow the reading order on about 80% of passes.** Only the
other 20% carry information about the stories, so four passes a judge leave
about one informative pass each. That is why `cut2 v cut3` read 0.19 at four
passes and 0.55 at 24. The halves now agree to within 0.17 on every
pair, so 24 passes is enough to read one pair.

**Draft-to-draft variance is real, not an artefact of too few passes.** `cut1`
is weaker than both its siblings: when a judge read it second it never won,
72 passes out of 72. The comparison pairs still disagree: `fix` wins pairs 1
and 3, `cut` wins pair 2, and each of those holds in both halves. At L1 the
two beat-1 drafts differ too, and gpt-5.1 took `5bfc` 10 times of 12 when it
read it second.

**The register cut is still not resolved.** The arms differ by about as much
as two drafts of one arm do (0.15 against 0.16). Earlier today this was stated
as "twice the effect". At 24 passes it is "the same size as the effect". The
conclusion holds: three drafts an arm cannot resolve a change this size.

## What changes

1. **Four passes a judge is too few.** Every verdict of 22–23 September rests
   on four. The minimum is 24 at L2; a pass costs about $0.03, so a pair costs
   about $2.
2. **Drafts per arm, not passes, is now the limit.** A draft costs about $8 and
   a judged pair about $2, so the spend moves back to drafting.
3. **A failed call is not a verdict, but it is not visible either.** 114 of
   the first 360 register-cut passes failed fast at 120 concurrent calls, most
   likely on rate limits, and the log row keeps no error text. Re-run at 8
   concurrent calls, all 114 completed.
