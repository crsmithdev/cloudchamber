# The plan from here

26 September, revision 3. This plan replaces the order of
`2026-09-24-the-plan-by-goal.md`. That plan keeps its principles and its
goals. Revision 2, the red-teamed order of phases A to F, is in git at
`5ecdc97`; this revision cuts it down.

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
| Principle 3 | drafts lose to Void of Fears on hook −0.59, presence −0.32, momentum −0.24 (`evals/20260926-where-drafts-lose.md`). No person has heard a draft beside a channel story |

Landed from revision 2: A1 to A5, C2, F1, step 4 dropped, reader check on by
default.

## The order

| # | Step | Decides it | Cost |
|---|---|---|---|
| 1 | **Chris listens.** `cloudchamber listen` on draft `20260924223235-3cee` (unrestricted, listen profile) and one Void of Fears story. Mark where attention goes, and where it goes away. | Chris | $0, a person's hour |
| 2 | **Bind at once** (`feature/bind-at-once-main`). One draft of `3cee` with `cloudchamber branch`; time and cost against `663a`'s split; one `lab canon` reading of it and of `3cee`'s stored draft. It lands unless canon doubles or the time does not fall. A scene now reads the unbound text of the beats before it, so canon is the one guard. | canon, time | ~$12 |
| 3 | **One change for the axis step 1 names** (hook unless the listen says otherwise). Three layers already state hook: `hook-late` (`write.ts:56`) is a screen, a register line and a rewrite line. First find, from the stored steps of `3cee`, why they do not fix the opening. Then change the one layer the accretion rule names. Two drafts, and Chris hears the first two minutes of each against `3cee`'s. The panel at 8 passes a pair checks for a large loss. | Chris; the panel against a loss above 0.5 | ~$30 |
| 4 | **G1 once**, read from step 3's drafts, with nothing else running. | — | $0 |

Total: about $42 and two listening sessions.

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
