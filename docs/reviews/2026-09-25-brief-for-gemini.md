# Brief for Gemini

25 September. Three steps of `2026-09-24-the-plan-by-goal.md`, in this order.
Each step is one branch in one worktree. Do not merge. When a step is done,
stop and report before you start the next.

Read the plan's row for each step before you start it. Where this brief and
the plan disagree, the plan holds; say so in your report.

## Step 11: delete what nothing uses

Branch `refactor/delete-unused`.

| Delete | Condition to check first |
|---|---|
| `evals/judge.py`, `evals/tally.py` | nothing imports or runs them; `rubric.test.ts` and `pool.test.ts` run on fixtures |
| `app/pipeline/lab/beats.ts` and `beats.test.ts` | nothing else imports `beats.ts` |
| the per-beat half of `app/pipeline/lab/rubric.ts` (`BeatPlan`, `beatPrompt`, `beatComplete`, `beatAxes`, from about line 103) and its tests | only `beats.ts` calls them |
| the exports `StoryRow` (`store/db.ts`), `DrawAction` and `OffList` (`ui/src/api.ts`) | no use anywhere, in `.ts` or `.tsx` |

Update the comments that name the deleted files. Measure the line count before
and after:

```
git ls-files '*.ts' '*.tsx' '*.py' | grep -v '\.test\.ts$' | xargs wc -l | tail -1
```

Report: the files removed, the two line counts, the test and type-check
results.

## Step 6: fewer judges

Branch `docs/fewer-judges`. This step makes no model call. It reads
`bank/judgements.jsonl` only.

1. Group the rows of 24 September by `experiment`, and by arm pair where an
   experiment has more than one.
2. For each group, compute the score gap with every judge, then without each
   judge in turn. Use `scoreGap` and `GAP_MARGIN` from
   `app/pipeline/lab/pool.ts`; do not write a second formula.
3. A reading's side is above `+GAP_MARGIN`, below `−GAP_MARGIN`, or inside.
   A judge can go if its absence leaves every reading on the side it had with
   all judges. Try Gemini 3.1 Pro first, then GLM-4.7.
4. Write the result to `evals/20260925-fewer-judges.md`: one table row per
   group, the gap with all judges and without each, and the verdict per
   judge. Put the script you used in the same commit only if it belongs next
   to the other `lab` code; otherwise keep it out.

Do not change the judge list in any config. Chris decides that from your
table.

## Step 1: skip what the round replaces, and one claims screen a draft

Branch `feature/skip-replaced`. Read the plan's row for step 1 in full,
and its "same prompts" guard.

- In `registerRewrites` (`app/pipeline/drafting.ts`), `regenerate(k)` does
  not rebind or re-screen beat k+1 when k+1 is due in the same round.
- The first-pass screen and every automatic rewrite skip the claims screen.
  `scenes` runs it once when the rewrites end, even when none ran. It records
  each beat's findings under that beat's latest pass, so `screenFindings`
  (`app/pipeline/chain.ts`) shows them.
- A gate-2 `rewrite k` still screens.

Tests, in the files the repo already keeps for drafting:

1. One test pins the call count of a draft with rewrites.
2. One test asserts that gate 2 shows the claims of the final text.

Do not draft a real story to check this. The guard is the tests. The scene
and bind prompts of k+1 must stay the same bytes.

## Your report, per step

| Item | Content |
|---|---|
| Branch and commits | names and short SHAs |
| What changed | one line per file |
| What ran | the commands, after your last edit, and their results |
| Unverified | anything you could not run |
| Disagreements | where the code, the plan and this brief do not agree |
