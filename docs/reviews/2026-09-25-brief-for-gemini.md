# Brief for Gemini

25 September. Carry out `2026-09-24-the-plan-by-goal.md` from its first step
to its last. The plan is the task; this brief says the order, how the
branches stack, and where to stop for Chris. Where this brief and the plan
disagree, the plan holds, except for the branch model below.

Do not stop between steps. Stop only at a **Chris** point in the table, or
when a guard fails. At a stop, write the report for the steps since the last
stop, say what you need, and wait.

## Branches

You cannot merge or push, and later steps build on earlier ones. So the
branches stack:

- Each step is one branch in its own worktree, made from the tip of the
  branch before it: `git worktree add .worktrees/<name> -b <prefix>/<name> <previous branch>`.
- A step that fails its guard does not go on the stack. Record why, and make
  the next step from the last step that passed.
- Chris lands the stack in order.

The plan says arms are judged from `main` so that the judge log lands in
`main`'s `bank/`. Instead, judge from the worktree of the step, and commit the
log on that step's branch. It reaches `main` when Chris lands the stack. An arm
drafted in its own worktree sets `CLOUDCHAMBER_BANK` to that step worktree's
`bank/`, and links `corpus/` first (plan step 7, "Four limits").

## Order

| # | Plan step | Guard | Stop |
|---|---|---|---|
| 1 | 11, delete what nothing uses | the suite | — |
| 2 | 6, fewer judges | the stored log | **Chris** decides the judge list from your table. Continue with the full list until he answers. |
| 3 | 1, skip replaced calls; one claims screen | two tests | — |
| 4 | 12, the plot-hole set | none | **Chris** reads the 15 plants before any check runs on them |
| 5 | 2, check effort | checks and plot holes | **Chris** sets the effort from your table (plan: "Effort on the checks") |
| 6 | 3, find the claims once | checks | — |
| 7 | 4, repair contradicted claims | checks | **Chris** reads the repaired text of the replayed chains |
| 8 | 5, one clean pass at four samples | checks | — |
| 9 | 13, the reader check | checks and plot holes | skip it if step 12 showed no gap, and say so. Otherwise **Chris** reads what it keeps on the replayed chains |
| 10 | 7, the comparison runner | re-pool to the published numbers | — |
| 11 | 8, the listen ceilings | changed output | — |
| 12 | 9, write in sequence, then bind at once | changed output and canon | — |
| 13 | 10, effort `low` on the bind | changed output and canon | the end: the final report |

Steps 11 to 13 are one judged series, each arm against the last arm that
landed (plan: "The order").

## Detail the plan leaves to you

**Step 11.** Before each deletion, confirm that nothing imports, runs or names
the file or export, in `.ts` and `.tsx`. Measure the line count before and
after:

```
git ls-files '*.ts' '*.tsx' '*.py' | grep -v '\.test\.ts$' | xargs wc -l | tail -1
```

**Step 6.** Use `scoreGap` and `GAP_MARGIN` from `app/pipeline/lab/pool.ts`;
do not write a second formula. A reading's side is above `+GAP_MARGIN`, below
`−GAP_MARGIN`, or inside. Write `evals/20260925-fewer-judges.md`: one row per
experiment or arm pair, the gap with all judges and without each, and a
verdict per judge. Do not change the judge list in any config.

**Step 1.** Do not draft a real story. The scene and bind prompts of k+1 must
stay the same bytes.

**Step 12.** Choose briefs that passed gate 1. Write each plant yourself, in
the voice of the text around it. Record the span, the kind and the original
text in `evals/plotholes/`, so each plant can be undone.

## Money

Most `cloudchamber` commands call Claude, and `lab` calls the OpenRouter
judges. The hook asks Chris before each one. With each such command, state
the step, what the call does and its cost from the plan's figures. Run the
fewest drafts and judge passes that the guard needs. Record the list-price
spend of each step, from `usage.cost_usd` in the store and the judge log.

## Report

Write each report to `docs/reviews/2026-09-25-gemini-progress.md` on the
current branch, and add to it at each stop. Per step:

| Item | Content |
|---|---|
| Branch and commits | names and short SHAs; the branch it stacks on |
| What changed | one line per file |
| Guard | what ran after your last edit, and the result against the plan's bar |
| Spend | list dollars, Claude and judges |
| Unverified | anything you could not run |
| Disagreements | where the code, the plan and this brief do not agree |

The final report adds the plan's goal table with each goal's baseline and
its figure at the end, measured, not estimated.
