# The L1 calibration was invalid, three ways

24 September. One branch ($7.41) and 132 beat passes ($2.47), and the result
cannot be read. Written up because the three errors are each worth more than
the number would have been.

## What was asked

`evals/20260924-draft-variance-dominates.md` found that at L2 two drafts of one
arm differ about twice as much as two arms do, which is why no change of 23
September could be resolved. L1 was supposed to fix that: a beat pair holds the
brief, the schedule and the story so far fixed and varies only one beat's
prose. The question was whether L1's within-arm spread is narrower than L2's
0.18.

`cloudchamber branch 20260921145735-c933` made a schedule-pinned sibling, 11
beats, and all 11 beat pairs were judged by the three-judge panel, four passes
each, both orders. 132/132 complete, 720 s wall.

| beat | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| share to c933 | 0.69 | 0.92 | 0.68 | 0.32 | 0.62 | 0.00 | 0.95 | 0.96 | 0.95 | 0.83 | 0.75 |

Mean distance from a coin flip **0.32**, against L2's 0.18. Read naively: beat
judging is nearly twice as noisy as draft judging, and L1 is worthless.

That reading is wrong. Nine beats of eleven went the same way, which is not
noise — it is a systematic difference, and there are three reasons for one.

## 1. The two drafts are not the same arm

`c933` drafted its scenes on 21 September. The branch drafted on 24 September
under `eaf3ef9`. **Nine commits touched `prompts.ts` or `write.ts` in between**,
including `4c7e4b1` (the last beat keeps the median beat's words) and `191a9bb`
(the listen profile fixes a linear chronology).

So this was never a within-arm pair. It compared two code versions, which is a
comparison, not a floor. `steps.version` would have caught it and did not,
because `c933` predates the column — its steps carry no version at all.

## 2. Both sides were judged against one side's story so far

The judge is shown the story so far once, above both versions. The script
passed **`c933`'s** story so far for both. The branch's beat *k* was written
after the branch's own beats 1..*k*−1, which differ, so it was judged against a
context it was not written for: its callbacks point at events the judge was
never shown.

That is the shape of the result. The draft whose context was used won nine
beats of eleven.

## 3. A branch at beat 1 does not make beat *k* a pair

This is the design error under the other two. The review says to branch the
baseline **at each chosen beat**. A branch at beat 1 copies the schedule and
writes every scene again, so the two drafts diverge immediately; by beat 4 they
have told different stories. Only **beat 1** has a story so far both share,
because it is empty.

One branch does not give eleven beat pairs. Eleven beat pairs need eleven
branches, one at each beat, each copying beats 1..*k*−1 word for word.

## What survives

One data point: beat 1, share 0.69, distance **0.19** — and even that carries
error 1, since the arms differ in code. It is indistinguishable from L2's 0.18
and settles nothing.

## What it cost, and what it bought

$9.88 and about ninety minutes, for one unusable number and three lessons. The
lessons are cheap at the price, because every one of them would have been
repeated at L2 scale later:

1. **An arm is a commit, and a comparison needs both arms' commits to be
   known.** The sequence already says this (change 4). It now also needs: a
   draft whose steps carry no `version` cannot be an arm in any comparison.
2. **Two beats are a pair only when the story before them is identical.**
   `whyNotL1(a, b, n)` now refuses otherwise and names the branch that would fix
   it, and `judgeableBeats` returns only the beats that qualify. Run against
   this calibration it would have passed beat 1 and refused the other ten.
3. **A precondition that is not code is not a precondition.** All three errors
   were things I knew and did not check. The preconditions of change 2 are worth
   more than the runner they guard.

## What a real L1 calibration costs

Eleven branches at beats 1..11, each writing beats *k*..11, is roughly six full
drafts of work — about $45 — before a single pass is judged. That is the honest
price of the design as written, and it should be known before step 3 is
committed to. A cheaper shape is to pick three or four beats rather than all
eleven, which the review already allows with `--beats`.
