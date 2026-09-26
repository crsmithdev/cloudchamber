# The reference bind disagrees with itself by 0.62 a beat

26 September. Plan step 7 measures, once, how far two readings of one draft by
the reference bind (`lab canon`) disagree. The canon guard reads a change
against this figure.

Two readings of draw `20260918213337-0217`, 8 beats, stage `reference-bind`
(the bind's model and system at the default effort):

| Beat | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Total |
|---|---|---|---|---|---|---|---|---|---|
| Reading 1 | 0 | 3 | 1 | 1 | 1 | 1 | 0 | 1 | 8 |
| Reading 2 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 5 |
| Difference | 0 | 2 | 1 | 0 | 0 | 0 | 1 | 1 | 5 |

Disagreement: 5 / 8 = **0.62 contradictions a beat**, as `bindDisagreement`
reads it (mean absolute difference by beat). A net count would read 3 / 8.

One pair on one draft. It says a single reading cannot tell two arms apart
unless they differ by more than about 0.6 contradictions a beat. The guard
needs several readings an arm, or a figure from more pairs, before it judges
step 9 or step 10.

Cost: $2.06 a reading at list. Wall time: 13.8 min with the beats read in
sequence, 2.4 min with the beats read at once.
