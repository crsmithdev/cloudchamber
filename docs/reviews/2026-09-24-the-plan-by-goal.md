# The plan, by goal

24 September, night. Chris set four principles and seven goals. This plan
replaces the order of `2026-09-24-the-plan-after-the-score-gap.md`. That
document and `2026-09-24-loop-sequence.md` stay the record of why each built
piece exists.

## Principles

- A highly configurable ideation pipeline that produces creative, original
  story ideas.
- Fact checks and red-team passes on each idea, against plot holes,
  non-sequiturs and canon violations.
- Drafts of compelling, best-in-class narratives, for reading and for audio
  drama.
- Evaluation against judge panels, per draft and against known examples.

## Goals and baselines

The baselines come from the live store and `bank/judgements.jsonl`, read on
24 September. The reference chain is the newest full chain, from a seed to a
drafted story under a setting with claims:
`88c3` (ideate, check) → `91bf` (repair) → `9c02` (repair, check, draft).

| # | Goal | Baseline | Target |
|---|---|---|---|
| G1 | Idea to drafted story | 77 min wall, gate waits excluded | < 20 min |
| G2 | Code or prompt change to judged result | 45–60 min: three parallel drafts of about 40 min, then the judge | < 10 min |
| G3 | Quality | the score gap against the channel transcripts and the stored premises, 24 Sep | no loss larger than `GAP_MARGIN` |
| G4 | Work repeated across check and draft runs | three full checks in one chain, about $3.5 and 5–10 min each | −80% |
| G5 | Claude usage, at list price | $36.57 for the reference chain | −50% |
| G6 | OpenRouter judge spend | $2.04 for a best of 3; $21.3 for the 732 passes of 24 Sep | −50% |
| G7 | Codebase simplicity | 13,062 lines of source, 5,178 of tests; per the 23 Sep review: 17 exports with no consumer, 6 tunables outside a toml, a suite of 81 s | each step deletes more than it adds |

G5 counts subscription use at list price, because the subscription limit is
what the list price measures.

## Where the reference chain spends

| Phase | Draw | Wall | List $ | Note |
|---|---|---|---|---|
| ideate | `88c3` | 2.1 min | 1.03 | premises to ending, under auto |
| check | `88c3` | 3.7 min | 3.37 | 2 samples of derivation and ledger |
| repair and check | `91bf` | 9.5 min | 5.64 | the whole brief is checked again |
| repair and check | `9c02` | 10.1 min | 6.00 | the whole brief is checked again |
| draft | `9c02` | 51.8 min | 20.54 | 42 scenes and 29 binds for 10 beats; the claims screen 126 calls, $9.94 |

On the critical path, one number dominates: `screen-ledger`, the bind, takes
34.5 call-minutes of the 51, in sequence with the scenes. Across all draws
since 20 September the bind is also the largest cost, $65 of $258, and 46% of
its output is thinking. The second cost is the claims screen: one Sonnet call
a claim, each call carries the whole setting.

On the judge side, Gemini 3.1 Pro makes one third of the passes and 61% of the
spend.

## Tensions to settle

**G2 against the last plan.** A full draft takes 40 minutes now and about 15 at
best after G1. No full-draft comparison fits in ten minutes. A scene-level
change can fit, if a comparison drafts only a few beats from a branch point.
That is L1, and the last plan deprioritised L1 because one calibration point
showed no special advantage. The ten-minute goal reopens it. **Recommendation:**
split G2 in two. A scene-level change gets < 10 min through beat branches. A
schedule-level change gets the G1 time, about 20 min. L1 lands only after it
predicts the full-draft score gap on the stored arms.

**G3 against G1, G4 and G5.** Most time and cost changes alter what a model
reads, and so owe a judged run. The panel resolves a large change only. "No
loss seen" from the panel is weak evidence on a small change. Two guards
follow:

- A change to a **detector** (a check or a screen) is judged by recall on the
  stored flags, not by the panel. The store holds 876 screen steps with
  flagged spans. A detector that finds the same flags at half the cost passes.
  This is L0 and costs nothing on OpenRouter.
- A change to a **writer** (a scene, a schedule, a rewrite order) needs the
  panel: three drafts a side, matched briefs, both orders, the score gap.

**G7 against everything.** Each speed step adds a mechanism: a cache, a wave,
a pipeline. Each step must also remove one. The removals are listed with the
steps.

## The order

| # | Step | Goals | Guard | Removes |
|---|---|---|---|---|
| 1 | **The chain metrics row.** `cloudchamber timeline <draw>` walks the lineage and prints wall by phase, list $ by stage, and repeated calls. The lab reads the same row. | all | none: reads the store | the hand queries in this document |
| 2 | **Fix the reference set.** Three briefs, their stored drafts, the Void of Fears and Vox Mortis transcripts, the score gap of each today. Every later step reads against it. | G3 | none | the ad hoc baselines in `evals/` |
| 3 | **Re-pool the 732 stored passes** with no Gemini, and at 4 passes a judge. If the score gap keeps its side in the stored sets, change the panel. | G6 | the stored log; free | a third of the judge spend; `judge.py`, `tally.py` |
| 4 | **Cache the floor per baseline** in `lab`. A within-arm pair is judged once a brief. | G6, G2 | pooled numbers pinned in `pool.test.ts` | the floor run per experiment |
| 5 | **The bind at effort low, then on Sonnet.** Rerun the bind on 50 stored scenes and compare its patches with the stored patches. | G1, G5 | L0 recall on stored patches | — |
| 6 | **The claims screen asks one call per scene**, with every claim of the scene in it, and caches a verdict per setting and statement. | G5, G4 | L0 recall on stored claim verdicts | the per-claim call loop |
| 7 | **A repair round checks what the repair touched.** The derivation and ledger checks re-ask the open findings and the changed parts; one full check runs before the draft. | G4, G1, G5 | L0: findings recall on the stored chains | the full check per round |
| 8 | **The rewrite waves (04b) and the next beat during the bind (05).** | G1 | panel, 3 a side | the serial rewrite loop |
| 9 | **The comparison runner** on the score gap: N drafts an arm, matched briefs, both orders, the cached floor, its own clock. | G2 | pinned to the stored runs | the scratch scripts in `~/.cloudchamber/ab` |
| 10 | **Beat branches as a comparison level.** Draft beats K to K+2 from a branch, judge them. First check that its reading predicts the full-draft score gap on the stored arms. | G2 | the stored arms | — |
| 11 | **The simplify leftovers (09)**, one per step above where it touches the same file. | G7 | the suite | the 17 unused exports, the untyped ceilings, the restated screen or its flags |

Steps 1 to 4 need no model call on the Claude side. Steps 5 to 7 are detector
changes and need no panel. Step 8 is the first writer change, and the first
real judged run.

## Expected effect

Estimates, to check with step 1 after each step.

| Goal | After 3–4 | After 5–7 | After 8 | After 9–10 |
|---|---|---|---|---|
| G1 wall | 77 min | about 45 min | about 20 min | — |
| G2 loop | — | — | about 25 min | < 10 min scene-level, about 20 min schedule-level |
| G4 repeats | — | about −80% | — | — |
| G5 list $ | $36.57 | about $20 | about $18 | — |
| G6 judge $ | about −50% | — | — | — |

G1 is the goal most at risk. The draft is 51 minutes, and steps 5 and 8 both
have to land to reach 20. If the bind on Sonnet loses recall, G1 depends on
step 8 alone.

## Rules that hold

- No prompt text changes until its guard can judge it. A detector has the L0
  guard from step 5; a writer has the panel from step 9.
- An arm is a commit.
- Read with the score gap, both orders.
- Keep calls in flight under about 24 at once.
- A time or cost figure in a write-up comes from step 1's row, not a hand
  query.

## Open questions

- **The panel is a proxy.** No person has heard a draft and a channel story
  side by side. G3 rests on the panel alone.
- **Is the chain the right unit for G1?** The reference chain ran two repair
  rounds. A chain with no repair is 25 minutes shorter today.
- **Gate waits.** G1 excludes the time a draw waits for Chris. Under `--auto`
  there is none.
