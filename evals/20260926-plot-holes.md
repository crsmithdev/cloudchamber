# Today's checks catch no plot hole that is not a contradiction

26 September. Plan step 12, done again. The first set (25 September) planted
literal contradictions and copied a ledger taken from the unplanted brief, so
it measured contradiction recall; see `docs/reviews/2026-09-24-the-plan-by-goal.md`.

## The set

15 plants in 5 briefs that passed gate 1, all with no setting
(`evals/plotholes/plants.json`). Each plant changes one or two sentences of a
vignette or the ending, in the voice of the text around it.

| Kind | Plants | What a reader asks |
|---|---|---|
| an event that does not follow | P01, P04, P13 | why does this happen? |
| a choice with a better option left open | P02, P09, P14 | why not the obvious other way? |
| knowledge before it can be learned | P07, P10, P15 | how could they know that yet? |
| a setup with no payoff | P05, P08, P11 | what was that for? |
| a broken outline rule (the control) | P03, P06, P12 | none: this one contradicts a stated rule |

The first four kinds contradict no stated fact, figure, name, time or rule.
Each copy of a brief has no ledger, so the check extracts one from the planted
text, as a real round 1 would.

## Runs

Today's check (`main` at `8764ad6`), two runs a brief, 10 passes, $20.49 at
list, 4–13 min a pass. `evals/plotholes/run.ts` runs it;
`results-today.json` holds every finding verify kept.

| Kind | Caught |
|---|---|
| broken rule | 5 of 6 (P03 2/2, P06 2/2, P12 1/2) |
| event that does not follow | 0 of 6 |
| choice with a better option left open | 0 of 6 |
| knowledge before it can be learned | 0 of 6 |
| setup with no payoff | 0 of 6 |

Three kept findings name no plant: a timeline error already in `f1a4` (twice),
a date slip in `35c1`, and a reading of "patient" as intent in `3cee`.

## Reading

The checks find contradictions, and nothing else. A plot hole that contradicts
no line is invisible to them. This is the gap step 13's reader check asks
about. P07 is the weakest plant: the outline dates the law it acts on to the
same day.
