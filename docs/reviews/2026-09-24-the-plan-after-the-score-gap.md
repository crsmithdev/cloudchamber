# The plan, after the score gap

24 September, evening. This is the plan as it stands after one day of
measurement. It replaces the order of `2026-09-24-loop-sequence.md` where the
two disagree; that document stays the record of why each step exists.

## The goals

Chris set two goals, in this order:

1. **The quality of real outputs.** A draft of five to ten thousand words that
   a listener with forty minutes in the car chooses over a narrated channel.
2. **A good, fast iteration loop.** It serves goal 1 and is not a goal of its
   own. Do not let the process become the work.

## What the day changed

| Belief this morning | Measurement | Belief now |
| --- | --- | --- |
| Four passes a judge are enough. | The same pairs at 24 passes a judge: `cut2 v cut3` moved from 0.19 to 0.55. | The weighted overall call needs 24 passes a judge. The judges take the story they read first on about 80% of passes. |
| Two drafts of one arm differ twice as much as two arms. | 24 passes: floor 0.16 from a coin flip, the arms 0.15. | They differ about as much. The register cut is still not resolved. |
| The panel judges a prompt change cheaply. | A change the size of the register cut needs about 12 matched pairs an arm. | The panel resolves a large change only. |
| A beat pair (L1) is the cheap, narrow instrument. | Beat 1 of `5bfc v 48ec` at 24 passes: 0.71, a stable preference. | Beat judging has no special advantage. L1 is deprioritised. |
| The overall call is the statistic. | The mean score gap over the axes. Six disjoint sets of four passes a judge land on the side of the margin the 24-pass reading does. | **The score gap is the statistic.** A judged pair costs $0.36 to $0.72, not $2.15. |
| A draft costs about $8. | That is the list price. Drafting runs on the subscription. | A draft costs time (about 40 minutes). Only judging costs money. |

Two consequences follow:

- **Draft variance is a quality lever, not only noise.** The panel ranks two
  drafts of one brief reliably, and some drafts are clearly weaker: `cut1` never
  won when read second, 0 of 72. Best of N uses this directly.
- **Iteration is cheap again**, because the score gap needs four passes a
  judge. A prompt change still needs several drafts an arm, but the drafts cost
  time only.

## What exists

| Piece | State |
| --- | --- |
| `cloudchamber branch <draw> [--at-beat K]` | Landed. Pins the schedule, or the story up to beat K. |
| `Drafting.sibling` | Built. Drafts a brief again: the brief and ledger are copied, the schedule and scenes are new. |
| `cloudchamber lab best <draw> [--n 3] [--passes 8]` | Built and run live once: `c933` against `f8bc`, a gap of +0.08, no winner, $2.04 at 24 passes. |
| `scoreGap`, `GAP_MARGIN` in `lab/pool.ts` | Built. Pinned to the register cut's pairs. |
| `bank/judgements.jsonl` | 732 passes on 24 September, every one with the draws, the judge and the tree it ran under. |
| The comparison runner for a prompt change | Not built. Scratch scripts do this job today. |

## The order from here

| # | Step | Serves | Cost |
| --- | --- | --- | --- |
| 1 | Done: `evals/20260924-against-the-channels.md`. No change detectable since 20 September; Trench Crusade leads Vox Mortis by +2.6 on the text. | 1 | $3.39 |
| 2 | Land `lab best` and the score gap. | 1, 2 | none |
| 3 | Make best of 3 the default way to draft a real story. Chris reads the winner. | 1 | about $2 a story, and 3 × 40 minutes of subscription |
| 4 | Fold judging against a source transcript into `lab`, so the scratch script goes. | 2 | none |
| 5 | Build the comparison runner on the score gap: N drafts an arm, matched briefs, both orders. | 2 | none to build |
| 6 | With the runner, test the prompt changes that landed unjudged on 21–23 September, and the rewrite waves and the next-beat overlap (the old steps 4 and 5). | 1 | a few dollars each |
| 7 | Back up the store (ADR-0012). | both | none |

Deferred, because they do not lead to a better story: L1 calibration, the
provenance timeline, the constraints table and the template system.

## Rules that hold

- No prompt text changes until the comparison runner can judge the change.
- An arm is a commit. A draft whose steps carry no `version` is not an arm.
- Read with the score gap, both orders. Eight passes a judge for one pair; four
  when the reading is a mean over several pairs. Use 24 passes of the overall
  call only to check the score gap.
- Keep calls in flight under about 24 at once. About 120 at once failed 114 of
  360 passes.
- Run the check before the sentence that claims it.

## Open questions

- **The panel is a proxy.** It prefers our drafts to the narrated channels by a
  wide margin (+0.1 to +0.7 against Void of Fears). No person has yet heard a
  draft and a channel story side by side to check that. The plan has no step
  for it.
- **The score gap was chosen after the data was seen**, on one experiment. Each
  new run must check it again: its halves must agree.
- **Best of N sets its own margin.** `GAP_MARGIN` is 0.15. Against a source,
  four passes a judge spread by up to 0.50 between halves, so one pair needs
  eight. The margin is not yet tested against a person's choice.
- **Text, not audio.** Against Vox Mortis the panel reads a transcript of an
  audio production. The +2.6 says our text is ahead, not that our story is the
  better listen.
