# The plan from here

28 September, revision 4. This plan replaces the order of
`2026-09-24-the-plan-by-goal.md`. That plan keeps its principles and its
goals. Revision 2, the red-teamed order of phases A to F, is in git at
`5ecdc97`; revision 3 cut it down to four steps and three rules, and
revision 4 adds the story IR's work after them.

## Revision 4

Since revision 3, the story IR (`docs/specs/2026-09-28-story-ir.md`) went
from a design to a landed plan check, `f0f90fd`:

| Stage | State |
|---|---|
| S0, the beat's slice in the scene ask | killed by its own rule (`evals/20260928-ir-s0.md`) |
| S1′ schedule linter, S2′ symbols and the plan against the ledger | landed; L4 named the delegation 5 of 5, recall 28 of 30 (`evals/20260928-ir-s2prime.md`) |
| S3′ plan findings at gate 2 | landed, on by default (`screens.enabled` lists `plan`), about $0.45 a draft |
| Gate 2 ticks | landed: each flag has a checkbox and a note, one rewrite sends the ticked flags, and a plan view shows the schedule, its findings and the symbol table |

Steps 1 to 4 below are still open: the store and git hold no listen, and
`feature/bind-at-once-main` is not merged. Steps 5 to 9 are new. They
follow the three rules: steps 5 and 9 cost $0, and steps 6 to 8 are small
code changes decided by reading the code and one run.

## Why revision 3

On 26 September the draws cost $352 at list, 140 draws. About $330 of it went
to check stages: replays that measure the check loop. The check loop is not
where the drafts lose. Revision 2 had about $600 of measurement left, most of
it to guard changes that save $5 a chain or less. One guard, C3's, cost about
$50 to decide a change that saves about $5 a chain, and it did not close.

Three rules replace the guards of revision 2:

1. **A measurement costs less than what it protects.** Before a run, state
   its cost and the saving or the gain it decides. If the run costs more than
   a month of the saving, decide by reading the code and one run.
2. **The ear decides quality; the panel checks for a large loss only.** The
   panel resolves about 0.5 of score gap at three drafts. A person listening
   costs no model spend.
3. **The check loop is frozen.** No more check replays until a draft shows a
   check failure that a person hears.

## Where it stands

| Goal | Now |
|---|---|
| G1 idea to drafted story | 59–67 min for a claims chain; the bind is 72% of draft time |
| G4, G5 repeated work, Claude $ | draft −56%. Check: claims calls halved by C2 (`6a8540f`); a 4400 replay is $4.5–11 |
| G6 judge $ | −17% (GLM dropped); the rest accepted unmet |
| Principle 3 | drafts lose to channel F on hook −0.59, presence −0.32, momentum −0.24 (`evals/20260926-where-drafts-lose.md`). No person has heard a draft beside a channel story |

Landed from revision 2: A1 to A5, C2, F1, step 4 dropped, reader check on by
default.

## The order

| # | Step | Decides it | Cost |
|---|---|---|---|
| 1 | **Chris listens.** `cloudchamber listen` on draft `20260924223235-3cee` (unrestricted, listen profile) and one channel F story. Mark where attention goes, and where it goes away. | Chris | $0, a person's hour |
| 2 | **Bind at once** (`feature/bind-at-once-main`). One draft of `3cee` with `cloudchamber branch`; time and cost against `663a`'s split; one `lab canon` reading of it and of `3cee`'s stored draft. It lands unless canon doubles or the time does not fall. A scene now reads the unbound text of the beats before it, so canon is the one guard. | canon, time | ~$12 |
| 3 | **One change for the axis step 1 names** (hook unless the listen says otherwise). Three layers already state hook: `hook-late` (`write.ts:56`) is a screen, a register line and a rewrite line. First find, from the stored steps of `3cee`, why they do not fix the opening. Then change the one layer the accretion rule names. Two drafts, and Chris hears the first two minutes of each against `3cee`'s. The panel at 8 passes a pair checks for a large loss. | Chris; the panel against a loss above 0.5 | ~$30 |
| 4 | **G1 once**, read from step 3's drafts, with nothing else running. | — | $0 |
| 5 | **Read the plan findings (S3′'s own test).** On the next five drafts, Chris reads each plan finding at gate 2 and marks it real or not. The findings are already there; the reading is the cost. Kill: fewer than half real over five drafts turns `plan` off in `draft.toml`. | Chris | $0, the plan check's ~$0.45 a draft |
| 6 | **A plan finding is settled when a scene is rewritten under it.** Now it stays open after the rewrite, so gate 2 shows it again. Suggestion: the rewrite records a `keep` verdict on each ticked plan finding with `method: "rewrite"`, and `chain.settled()` (`chain.ts:210`) skips every finding that is not `source: "check"`, not only `screen`. Without the second half, an accepted plan finding would enter the fixes that later repair rounds must keep. One test: rewrite under a plan finding; the finding reads settled; `settled()` stays empty. | code, one test | $0 |
| 7 | **Re-check the plan before a rewrite writes prose.** On draw `7715` a ticked plan finding moved a wounded man to the eleventh yard, and the scene kept the schedule's 02:05. The ledger's pace (a yard every 19 minutes from 00:55) puts the eleventh yard near 04:24, so the bind patched the hour after the rewrite. The patch was right; the defect was in the plan, and it was found only once prose existed. Suggestion: when a rewrite carries plan findings, apply each finding's `replacement` to its beat's schedule entry, run L3 and L4 on that revised plan (about $0.40), and show any new finding in the rewrite panel before a scene is written. This is the IR's claim at its smallest: fix the plan, check the plan, then write. Decide it on `7715` beat 4: does L4 on the revised plan name the hour? | one run on `7715` | ~$0.40, then ~$0.40 a rewrite with plan findings |
| 8 | **A sibling gets the plan check.** `branch` copies its source's config (`drafting.ts:338`), so a draft configured before `f0f90fd` never runs `plan`, and neither do its siblings. The copy keeps two arms comparable, and `branch --profile P` already builds a fresh config. Suggestion: when the copied config lacks `plan`, add it. The plan check writes no prose and changes no scene, so the arms stay comparable. About ten lines in `resolved()` and one test. | code, one test | $0 |
| 9 | **S0′, classify the kept findings** (IR spec §12.6): the share of gate 1 that a type checker on the plan would take. Under half keeps §12 a design. | reading | $0 |

Total: about $42 and two listening sessions for steps 1 to 4; about $1
and five readings at gate 2 for steps 5 to 9.

## Dropped from revision 2

| Step | Why |
|---|---|
| B1 rest, B2 runs | measured the noise of a loop that is now frozen |
| C1 verify keep-any | needs about $65 of replays and a read of added findings; the check loop is frozen |
| C3 `low` and Sonnet checks | Sonnet saves $5 a replay but on `88c3` kept one of two Opus findings, at score 3 under the floor of 7 (vault: Claims Run At The Gate And Sonnet Checks Miss Findings). `low` is not run |
| D0, D1's three drafts, D3, D4 | noise studies and arms that each cost more than they save; a Sonnet bind carries the Sonnet check's recall risk |
| F2 bar at 24 passes, F4 best of three, F5 at six drafts an arm | the ear replaces the panel for a gain; the panel stays a loss check |
| E as its own phase | step 4 reads G1 from drafts made anyway |

Branches not landed: `feature/verify-keep-any`, `feature/c3-sonnet`. Their
worktrees are removed; the branches stay.
