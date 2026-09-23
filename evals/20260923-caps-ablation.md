# Ablation — removing the caps clause, and finding it load-bearing

Run 2026-09-23, after `20260923-presence.md`. The first run of the judged
protocol **backwards**: it removes a clause instead of adding one. The clause is
the caps sentence in `scheduleListen`, which has sat in the prompt since
`c7a443d` and has never been tested on its own.

**The clause earns its place.** Removing it loses on all three matched pairs and
on seven of eight axes. It stays.

## Why this clause

`20260922-replication.md` measured three arms and left a hole:

| arm | caps clause | last-beat floor | all axes |
|---|---|---|---|
| old | no | no | 4.32 |
| caps | yes | no | 4.21 |
| fix (landed) | yes | yes | **4.47** |
| **this run** | **no** | **yes** | — |

Caps alone was the arm that *lost*. It was never re-examined once the last-beat
floor was added to compensate; the pair was only ever tested as a bundle. Two
clauses sit in the prompt where one might have done, so the missing arm was
worth $1.60.

## What changed

`44af975`: one sentence deleted from `scheduleListen`, 409 words to 354. The
last-beat floor stays. `scheduleSignal` is untouched, because these drafts run
the listen template.

The deletion did what it should to the allocation:

| arm | paying beat ÷ median | last beat ÷ median |
|---|---|---|
| fix | 1.36, 1.40, 1.38 | 1.00, 1.06, 1.11 |
| no caps | 1.11, 1.18, 1.29 | 1.18, 1.23, 1.29 |

The words freed from the paying beat went to the last beat, which is the
mechanism `20260922-replication.md` identified. **The prediction from that
mechanism was that the ending axis would improve. It did not.**

## The result

Weighted share to the arm without the clause **0.19**, against a floor of
**0.52**. Every matched pair loses: −0.25, −0.07, −0.51.

| axis | no caps | fix | mean diff |
|---|---|---|---|
| hook | 4.03 | 4.26 | −0.23 |
| presence | 4.54 | 4.46 | +0.09 |
| people | 4.00 | 4.34 | −0.34 |
| feeling | 4.23 | 4.63 | −0.39 |
| cost | 4.63 | 4.86 | −0.23 |
| **ending** | **4.26** | **4.63** | **−0.37** |
| clarity | 4.00 | 4.29 | −0.28 |
| momentum | 3.94 | 4.40 | −0.46 |

The ending axis is the finding. The last beat got *relatively more* words and
the ending still got worse, so the ending is not a function of the last beat's
share of the budget. What the caps clause buys is the arrival and the paying
beat being **played out rather than summarised**, and losing that costs the
ending more than a longer last beat repays.

## The floor fix worked

`20260923-presence.md` ran its floor on 8 passes and two judges, with weights of
0.00 and 0.25 — too thin to size anything. This run gave the floor the same
three judges and two within-arm pairs as the comparison: 24 passes, weights
0.12, 0.25, 0.12, and a share of **0.52**, which is the coin flip a floor should
be. A floor that lands on 0.5 is what makes 0.19 readable as a real loss rather
than noise. Keep this shape.

## A gap in `tally.py`

The script tests only for a win:

```python
"clears the floor" if share - floor > 0.1 else "inside the floor, so this says nothing yet"
```

So it printed *"inside the floor, so this says nothing yet"* for a share of 0.19
against a floor of 0.52 — a difference of −0.33, which is the largest effect
either run has measured. Now that the protocol runs in both directions, a
decisive loss is an informative outcome and the script cannot say it. It needs a
third branch.

## What this changes about the accretion work

Two runs, two directions, both negative:

- adding a clause aimed at presence and people **lost** (`20260923-presence.md`);
- removing a clause that had never been justified alone **also lost**.

The prompt is closer to a local optimum than the accretion audit assumed. That
does not retire the audit — the register still holds five sentences that restate
a screen the pipeline already runs, two of them near-verbatim copies of
`LENGTH_LINE` and `NUMERAL_LINE`, and that redundancy is still unmeasured. But
it does retire the assumption that accumulated clauses are probably waste. Some
are load-bearing, and only the protocol tells them apart.

It also corrects the proposed budget test. A budget that forces a clause out
whenever one goes in would have deleted this clause. The budget's job is to
force the **question**, answered by a run, not to force a deletion.

## Not landed

`44af975` stays unmerged and the branch is removed. The caps clause stays in
`scheduleListen` on `main`, now with a run behind it.
