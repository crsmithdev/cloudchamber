# Ablation — the register's two copies of a deterministic ceiling

Run 2026-09-23, after `20260923-caps-ablation.md`. The narrow test the accretion
audit pointed at: `sceneSignal` told the model, on every beat, what
`NUMERAL_LINE` and `LENGTH_LINE` already say almost word for word, and both of
those are repair lines a **deterministic** measure fires on its own. The claim
under test was that a preemptive copy of such a line does no work.

**It does work. The change is rejected on cost.** Quality is inconclusive;
drafting cost rose 46%.

## What changed

`da5c335`: two sentences out of `sceneSignal`, 108 words to 76.

| Cut | The line it duplicated | What fires it |
|---|---|---|
| "Keep only the numbers a person would say aloud, round the rest, and never put two exact figures in one sentence." | `NUMERAL_LINE` | `numerals_per_1k > 12` |
| "One thing per sentence, short enough to say in one breath." | `LENGTH_LINE` | `long_sentence_share > 0.12` |

The three sentences that paraphrase a *model* screen — bodily-emotion,
one-voice, time-unplaced — were left in, so the run tests one thing.

## Cost: decisive

| arm | draft cost | drafting calls | register rewrites |
|---|---|---|---|
| fix | $7.73, $6.89, $8.38 | 86, 82, 103 | 3, 2, 5 |
| cut | $11.21, $12.29, $10.03 | 156, 141, 115 | **10, 10, 6** |

Mean **$7.67 → $11.18, up 46%.** Rewrites 10 → 26.

The mechanism is visible in the prose. With the preemptive lines gone it drifted
toward the ceilings they name:

| | mean numerals / 1k | mean long-sentence share |
|---|---|---|
| fix | 2.2 | 0.068 |
| cut | **3.2** | **0.079** |

The rewrite loop pulled nearly every beat back under — final breaches are 0 to 1
a draft in both arms — but paid about $3.50 a draft to do it. Structure flags
that trigger a register rewrite rose only 7 → 11 across the three drafts, while
total rewrites rose 10 → 26; the gap is ceiling-driven, which is exactly the two
lines removed.

**A blast radius again.** `bodily-emotion` flags went 0 → 4, and that is
sentence 2, which this run did **not** cut. Removing two sentences made beats
fail a screen they were never about.

## Quality: inconclusive, and the floor is why

Weighted share **0.39** against a floor of **0.29**. The gap is exactly +0.10
and the threshold is *greater than* 0.10, so `tally.py` reports it inside the
floor.

| pair | all axes |
|---|---|
| cut1 / fix1 | −0.42 |
| cut2 / fix2 | +0.27 |
| cut3 / fix3 | −0.16 |

| axis | cut | fix | diff |
|---|---|---|---|
| hook | 3.86 | 4.23 | −0.39 |
| **presence** | **4.63** | 4.37 | **+0.26** |
| **people** | **4.17** | 4.06 | **+0.11** |
| feeling | 4.23 | 4.46 | −0.23 |
| cost | 4.60 | 4.74 | −0.15 |
| ending | 4.17 | 4.51 | −0.35 |
| clarity | 4.26 | 4.23 | +0.01 |
| momentum | 4.17 | 4.23 | −0.08 |

Presence and people are the only axes up, and they are the two the
`20260923-presence.md` run tried and failed to raise by *adding* a clause. That
is worth remembering, but it is not a result: this run cannot separate it from
noise.

## The floor design was wrong, and it is the second time

Both floor pairs were anchored on the same draft, `cut1` against `cut2` and
`cut1` against `cut3`. `cut1` is the weakest of the three (−0.26 over all axes
against its siblings, and the shortest at 9,009 words against 10,116 and
10,398), so **one weak draft set the floor at 0.29 instead of near 0.5.**

`20260923-caps-ablation.md` used the same shape and got 0.52 only because
`last1` happened to be middling. That run's conclusion stands anyway — its
comparison share of 0.19 loses against any plausible floor, and all three pairs
lost — but the floor was lucky, not sound.

**Fix the protocol:** a within-arm floor must not be anchored on one draft. Use
all three pairings — 1 v 2, 1 v 3, 2 v 3 — so no single draft's quality sets the
level.

## Not landed

`da5c335` stays unmerged and the branch is removed. A change that cannot show a
gain does not earn a 46% cost rise, and this one could not show a gain. The
duplicates prevent drift; the ceilings catch the overflow afterwards and charge
for it.

The wider reading, with `20260923-presence.md` and `20260923-caps-ablation.md`:
**three changes, three directions, none landed.** Adding a clause lost, removing
a load-bearing clause lost, and removing a redundant one cost half as much again
for nothing measurable. The drafting prompts are at a local optimum in quality
*and* in cost.
