# L1, beat 1: a second point, and the panel loses two judges

24 September. The first clean L1 pair: `20260924180256-5bfc` against
`20260924181408-48ec`, both branches of `20260921145735-c933`. They share the
schedule, and their code differs only by `eaf3ef9`, which changed no prompt. So
this is a within-arm pair. `whyNotL1(a, b, 1)` passed, and `judgeableBeats`
returned beat 1 only.

The texts differ as two drafts should: 858 and 870 words, word-set Jaccard
0.31.

Three judges, four passes each, both orders. 12/12 complete, $0.19, 177 s wall.
The rows are the first 12 lines of `bank/judgements.jsonl`, experiment
`20260924-l1-beat1-5bfc-48ec`.

| judge | took 5bfc | followed the reading order | weight |
| --- | --- | --- | --- |
| gemini-3.1-pro-preview | 2/4 | 4/4 | 0.00 |
| gpt-5.1 | 4/4 | 2/4 | 0.50 |
| glm-4.7 | 2/4 | 4/4 | 0.00 |

Pooled share **1.00**, distance from a coin flip **0.50**.

## What it says

Not what it was asked. The number is one judge's four passes, because the
other two took the first version they read every time and the pooling gives
them no weight.

That is not special to beats. On the runs of 23 September (L2, the 164 passes
in `pool.fixture.json`) the three judges followed the reading order on 0.50 to
1.00 of their passes, about 0.75 on average, and two of 17 judge runs sat at
1.00. At a rate of 0.75, four passes out of four happen about one time in
three. So two judges at 4/4 on one beat is what the panel already does, seen
through too few passes.

gpt-5.1's four wins are not four agreements either. Its axis calls move from
pass to pass: `presence` went to 48ec three times of four, and `feeling`,
`cost` and `hook` each changed sides.

So there are now two L1 beat-1 points, 0.19 and 0.50. Neither is evidence that
L1 is narrower than L2 (0.18). The limit is the panel's order-following, at
both levels: four passes per judge leave most of the weight at zero or near it.

## What would answer the L1 question

More branches do not fix this. More passes per judge on the pairs that exist
do, or at least show whether they can: a beat pass costs about $0.016, so 24
passes a judge on this one pair is about $1.15. That comes before the $15 or
$45 of drafting that more beat pairs cost.
