# The evaluation run

A fixed protocol for taking one seed from ideate to a drafted story and saying
how the pipeline did. The point is comparability: two runs a month apart should
produce the same numbers about different stories, so a change to the pipeline
can be judged rather than felt.

Run it unrestricted, at the defaults. A setting adds the claims checker and its
own lists, which is a second variable; evaluate the setting separately.

## The run

| Step | Command | Fixed |
|---|---|---|
| 1 | `cloudchamber draw --seed "<one sentence>"` | gate manual, unrestricted, sampling tail, genre from the examples |
| 2 | read the five premises, choose one | the choice is yours and it is recorded |
| 3 | `cloudchamber gate <draw> auto` | the defaults in `draft.toml` `[repair]` |
| 4 | read the round table the loop writes | pick the round it names as lowest, not the last |
| 5 | `cloudchamber draft <best-round>` | `screens.samples = 1`, otherwise the defaults |
| 6 | `cloudchamber story <draw>` and read it | |
| 7 | write the report below | |

Nothing in steps 3 to 5 is hand-steered. If you accept or dismiss a finding by
hand, the run is not an evaluation run any more — say so in the report.

## The stop conditions

Step 3 ends by itself, on one of three outcomes. Which one it was is the first
result of the evaluation.

| Stopped on | Means |
|---|---|
| `floor` | nothing left scoring `stop_score` or more. **The pipeline converged.** |
| `patience` | the total open score stopped falling. Converged as far as it will. |
| `cap` | the rounds ran out with findings still over the floor. **Non-convergence: a problem, and the run's headline result.** |

A `cap` stop is a failure of the pipeline, not of the seed. Record the round
table and stop; do not raise `rounds` to force it through.

## What to record

Take these from the `auto` artifact and `cloudchamber findings <draw> --all`.
Every number is already stored; none of it needs a model call.

```
seed
premise chosen (index, stated probability)
stopped on            floor | patience | cap
rounds
best round            id, and whether it was the last
total open score      per round, as a series
serious findings      score >= 7, per round
re-opened             findings matching a fix accepted earlier, per round
calls                 steps on the chain, and the model per stage
```

The series is the diagnosis. Falling is the pipeline working. Flat is the
standard moving under the text. Rising after a round that regenerated a whole
document is churn.

## The story rubric

Subjective, so fix the axes and the scale and record them every time. Five
axes, 1 to 5, and one sentence of evidence per axis quoting the draft.

| Axis | 5 | 1 |
|---|---|---|
| **premise kept** | the drafted story is the premise that was chosen, developed | it drifted into a different story |
| **mechanism holds** | the story's own rule is stated once and never broken | the rule bends when the plot needs it |
| **the ending earns it** | the last beat follows from the first and is not a restatement | it resolves by arriving, or explains itself |
| **register** | one voice, held for the whole length | it drifts by the second page, or states its theme |
| **surface** | nothing a reader would stop at | slop, repetition, or a sentence that means nothing |

Then two counts that are not subjective, from the gate 2 panes:

- **ledger flags left** at keep, by beat
- **slop**: lexicon hits, the not-X-but-Y rate against the pool, trigrams
  repeated three or more times and absent from the pool

A story can score well on the rubric with flags left; note both. A story with
no flags and a 2 on mechanism means the checkers are looking at the wrong
thing, which is a finding about the pipeline.

## The report

One file per run, in `evals/<draw-id>.md`, with the recorded block, the rubric
table, the round table verbatim, and three sentences: what the pipeline did
well, what it did badly, and the one change that would most improve the next
run. Link the brief and the draft directories.

Keep the failures. A `cap` run with a bad story is the most useful row in the
table.
