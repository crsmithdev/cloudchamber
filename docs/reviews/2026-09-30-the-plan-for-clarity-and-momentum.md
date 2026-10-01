# The plan for clarity and momentum against channel F

On 30 September the draw `bf3e`, drafted with the listen profile from the
title of `vs-hIS0zHK8`, beat the transcript by +1.43 over 16 of 16 passes
(`compare-zHK8-vs-bf3e-muoe8y6t`, $0.77). Gemini gives ours every axis. GPT-5.1
does not:

| Axis | GPT-5.1 gap | Passes it gives the source |
|---|---|---|
| hook | −0.13 | 4 of 8 |
| clarity | 0.00 | 4 of 8 |
| momentum | 0.00 | 4 of 8 |
| people | +0.75 | 1 of 8 |
| presence, feeling, cost, ending | +0.88 to +1.00 | 0 |

The gap to close is clarity and momentum on GPT-5.1. Hook is not a target:
the passes split on which opening is stronger.

## What the judges say

- **Clarity.** "intricate counting, nine-minute seams, and rule-changes
  (whatever was open went through)"; "metaphysical inside-out sequences";
  the source is "a chronological, first-person account of oddities… easier
  to follow on a single listen".
- **Momentum.** "long stretches in counting, procedure, and reflection";
  the source "escalates its anomalies steadily… the one fewer listeners
  would abandon mid-drive".

## What the text shows

| | ours (`bf3e`) | source |
|---|---|---|
| words | 11,852 | 6,785 |
| mean sentence | 14.6 words | 17.8 (auto-captions) |
| "count" | 39 | 10 |
| "nine" | 24 | 0 |
| "open" / "closed" | 28 / 13 | 10 / 2 |

The sentences are not the problem: ours are shorter than the source's, and
the listen screen already holds long sentences under 12% a beat. The problem
is the number of rules a listener must hold (the count, the nine minutes,
open against closed, the seam), said again and again, and the length.

## What the earlier runs show

| Transcript | Length | Our momentum | Our clarity |
|---|---|---|---|
| channel S `-cg2zIQHmUU` (27 Sep, `a4cd`) | 11,919 words | +1.19 | +1.25 |
| channel F `vs-hIS0zHK8`, 8 drafts pooled to 26 Sep (`evals/20260926-where-drafts-lose.md`) | 6,785 | −0.24 | +0.16 |
| channel F `vs-hIS0zHK8` (30 Sep, `bf3e`, GPT-5.1 alone) | 6,785 | 0.00 | 0.00 |

Against the longer channel we win momentum; against the shorter one we
lose or tie it. The listen profile drafts 10,000 words for either.

The pooled channel F losses to 26 Sep were hook −0.59, presence −0.32 and
momentum −0.24. `bf3e` wins hook (+1.00) and presence (+1.47) on the mean of
both judges, but it is one pair. Hook has its own item, todo #9; this plan
leaves it there.

Two earlier one-clause changes to `scheduleListen` did not move the score
past the floor (the midpoint disagreement +0.38, the ongoing ending −0.11,
floor about 0.5). A change must be bigger than one clause, or the test must
be larger, to be seen.

## Hypotheses

| # | Hypothesis | Lever |
|---|---|---|
| H1 | Momentum falls with length: a listener tires in the last third | `length.words` per channel |
| H2 | Clarity falls with the number of rules the anomaly has | a rule budget in the schedule |
| H3 | Momentum falls in beats that change nothing | an escalation rule per beat |

## Steps

Each step is an A/B with `lab compare`: three briefs, and on each a sibling
per arm (`Drafting.sibling(draw, opts)` from a scratch script, as the 27 Sep
experiments did: the brief and ledger are copied, the schedule is new),
8 passes a judge. One experiment costs about $2.30 for the pairs and
$1.50 for the floor, and about 60 minutes of drafting. The key has $41 left.

0. **Confirm the pattern (no code).** Draw and draft from the title of
   `qT46_pYAdyk`, the only other channel F transcript in the corpus, and
   from one more `vs-hIS0zHK8` draw, and compare each with its transcript. If GPT-5.1 gives ours clarity and
   momentum on both, the gap belongs to `bf3e`'s mechanics and the plan stops
   here. About 90 minutes, $1.60.

1. **H1, length (a knob, no code).** Make two siblings of each of the three
   briefs, one at 10,000 words and one at 7,000 (`length.words = 7000`,
   beats 8 to 10). `branch` with no `--at-beat` does not serve: it carries
   the schedule, and the schedule fixes the length. Read momentum and
   clarity on GPT-5.1. If 7,000 wins, add a `listen-short` profile or set the
   length from the channel the title comes from.

2. **H2, a rule budget (one prompt change).** Add to `scheduleListen`: the
   thing has at most one rule the listener must hold; the schedule states it
   in plain words in the beat where it is first seen, and a later beat that
   uses it says it again in one short line. Add a `rules` tag to the schedule
   so the plan check can count them. Test against the control on the three
   briefs.

3. **H3, escalation (one prompt change).** Add to `scheduleListen`: every
   beat after the first changes the danger — it comes nearer, takes someone,
   or breaks a rule the listener was holding; a beat of procedure alone is
   folded into the next. Test as in step 2.

4. **Land what wins.** A change lands when the gap on its target axis is
   above the floor on GPT-5.1 and no other axis falls below −0.3. Record each
   result in the vault note "The Score Gap Is The Judge Statistic".

Step 0 (todo #14) decides whether steps 1 to 3 (todo #15) run. Steps 2 and 3 run after step 1, on
its winning length, so the three changes do not mask each other.

## What this plan does not do

- It does not touch the hook: todo #9 holds that, and the passes on `bf3e` disagree about it.
- It does not change the judges or the rubric.
- It measures text only; it says nothing about how the story sounds aloud.

## Results (1 October)

Step 0 confirmed the gap. Steps 1 to 3 did not close it, and none lands.

| Step | Experiment | Gap | Floor (mean abs gap) | GPT-5.1 clarity | GPT-5.1 momentum | GPT-5.1 hook | Largest loss | Judging |
|---|---|---|---|---|---|---|---|---|
| 0, `17e7` v `qT46_pYAdyk` | `compare-Adyk-vs-17e7-muoumhta` | +1.73 | — | −0.13 | +0.50 | −0.25 | — | $0.70 |
| 0, `69c0` v `vs-hIS0zHK8` | `compare-zHK8-vs-69c0-muouz6c3` | +1.13 | — | −1.00 (7 of 8 to the source) | −0.25 | −0.25 | — | $0.75 |
| 1, 7k v 10k | `compare-bf3e-vs-9f29-muow1zou` | −0.06 | 0.41 | −0.08 | −0.08 | +0.29 | people −0.44, feeling −0.27 | $3.35 |
| 2, rule budget | `compare-bf3e-vs-7243-muowh9et` | −0.14 | 0.48 | +0.29 | +0.04 | −0.21 | people −0.42, hook −0.38 | $3.36 |
| 3, escalation | `compare-bf3e-vs-7193-muow8zni` | +0.08 | 0.33 | +0.25 | +0.17 | +0.42 | presence −0.17 (GPT-5.1) | $3.58 |

Control: `bf3e`, `17e7`, `69c0` (10,000 words, listen profile). Step 1:
`9f29`, `b9ff`, `1acf`; the 7k target ran 8,560 to 8,870 words. Step 2:
`7243`, `4e41`, `e51b`. Step 3: `7193`, `38f1`, `a81c`. A first step 1 run
lost 67 of 96 passes to an empty OpenRouter account and is discarded.

The clauses under test, after "none is not an answer." in `scheduleListen`:

- Step 2: "The thing that is wrong has at most one rule a listener must hold,
  one a person in the story could say in a sentence; it is said plainly in
  the beat where it is first seen, and a later beat that turns on it says it
  again in one short line. No second rule, count or interval for the
  listener to track."
- Step 3: "Every beat after the first changes the danger: it comes nearer,
  takes someone or something, or breaks what the listener thought they knew.
  A beat of procedure, counting or reflection alone is folded into the beat
  beside it."

### Reading

- **Length is not the lever.** 7k loses people and feeling more than it
  gains clarity. H1 is not supported.
- **The rules are in the brief, not the schedule.** A sibling copies the
  brief, and the counting comes from it: `7243` still says "count" 30 times
  against `bf3e`'s 39. A schedule clause cannot take out a rule the outline
  put in. A test of H2 has to change the outline or the premise.
- **Escalation is the best of the three** (+0.29 clarity, +0.17 momentum
  on both judges together) but stays inside the floor. With three pairs the
  floor is about 0.4. The floor falls with the square root of the pairs, so
  halving it to about 0.2 takes twelve pairs.
