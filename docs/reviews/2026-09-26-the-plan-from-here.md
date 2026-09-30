# The plan from here

28 September, revision 4. This plan replaces the order of
`2026-09-24-the-plan-by-goal.md`. That plan keeps its principles and its
goals. Revision 2, the red-teamed order of phases A to F, is in git at
`5ecdc97`; revision 3 cut it down to four steps and three rules, and
revision 4 adds the story IR's work after them.

## Revision 5

29 September. Gate 1 folds into the plan gate: IR spec §15, shape A,
accepted by Chris, then red-teamed (§15.11). ADR-0014 is proposed until T3.

| # | Step | Decides it | Cost |
|---|---|---|---|
| T1 | ~~L2, each symbol against the setting, with `amend`~~. Killed before it was built: on `b82d` it kept 0 of the 4 facts gate 1 contradicted. | measured | $4.04, spent |
| T1′ | **The plan's claims.** The plan check runs gate 1's claims extract and verify on the schedule's beat fields; a contradicted claim is a plan finding that `apply` can take. Built. | step 5's reading, on setting draws | about $1.1 a plan check |
| 5 | **Read the plan findings**, as below; it now also decides T1′. Each plan finding has a "real" and a "not real" mark, stored as a `reading`, so the reading is in the store. | Chris | $0 |
| T2 | **The plan gate is the only stop before gate 2.** Built (§15.12): a person's choose or fork drafts on to the plan gate, and gate 1 does not stop them. `--auto` passes the plan gate and its findings show at gate 2. | Chris uses the gate, or not, for two weeks | $0 |
| T3 | Retire gate 1's code. T3′ is skipped by Chris's decision: the prose-against-prose loss is accepted | as §15.8 | $0 |
| T4 | **The declared ledger.** Built before step 5, at Chris's "proceed" (§15.14): the outline declares `particulars` and `knowledge` as `<sym>` tags, and a new brief makes no `ledger-extract` or L1 call. 0 of 2 outlines failed shape. Kept: Chris heard the two drafts of draw `2dae` on 29 Sep and did not hear a flatter ending (#7). | by ear: done | about $9, spent |

Decisions taken with shape A: `--auto` applies no fix of its own; the
reader check moves to the plan gate with a five-draw kill; T4 waits on
step 5. Chris skipped T3′ on 29 Sep.

Found on the way: the confirm step (28 Sep) now demotes the mark fact of
`4797` at every layer. Whether gate 1 today still keeps the facts it kept
on 28 Sep is unknown; finding out is a check replay. T3 retired gate 1, so the replay is moot.

## Revision 4

Since revision 3, the story IR (`docs/specs/2026-09-28-story-ir.md`) went
from a design to a landed plan check, `f0f90fd`:

| Stage | State |
|---|---|
| S0, the beat's slice in the scene ask | killed by its own rule (`evals/20260928-ir-s0.md`) |
| S1′ schedule linter, S2′ symbols and the plan against the ledger | landed; L4 named the delegation 5 of 5, recall 28 of 30 (`evals/20260928-ir-s2prime.md`) |
| S3′ plan findings at gate 2 | landed, on by default (`screens.enabled` lists `plan`), about $0.45 a draft |
| Gate 2 ticks | landed: each flag has a checkbox and a note, one rewrite sends the ticked flags, and a plan view shows the schedule, its findings and the symbol table |
| S5 a plan fix at gate 2 | landed: `apply` at gate 2 writes again only the beats whose plan changed (IR spec §14.10); the rest of §9 waits on `uses` and `exit` |
| S3 the plan gate | landed, opt in: `draft --plan` (or "stop at the plan" in the draft form) stops at `awaiting_plan_gate`; apply fixes and edits, re-plan from a beat, or write (IR spec §14.9) |

Step 2 is done (`46c3057`); steps 1, 3 and 4 are open: the store and git hold
no listen, and step 3 waits on it. Steps 5 to 9 are new. They
follow the three rules: steps 5 and 9 cost $0, and steps 6 to 8 are small
code changes decided by reading the code and one run. Steps 6 to 8 are done.

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
| 2 | **Bind at once.** Done in `46c3057` (26 Sep), on main with its sessions, low effort and edits in place: measured on `3cee` (branch `1b09`), the draft took 10.0 min and $3.22 against 29.5 min and $8.02, canon 0.83 a beat for both, panel gap +0.09 within margin. `e177cd8` gave rewrites the same rule. `feature/bind-at-once-main` is superseded and not merged. | canon, time | done |
| 3 | **One change for the axis step 1 names** (hook unless the listen says otherwise). Three layers already state hook: `hook-late` (`write.ts:56`) is a screen, a register line and a rewrite line. First find, from the stored steps of `3cee`, why they do not fix the opening. Then change the one layer the accretion rule names. Two drafts, and Chris hears the first two minutes of each against `3cee`'s. The panel at 8 passes a pair checks for a large loss. | Chris; the panel against a loss above 0.5 | ~$30 |
| 4 | **G1 once**, read from step 3's drafts, with nothing else running. | — | $0 |
| 5 | **Read the plan findings (S3′'s own test).** On the next five drafts, Chris reads each plan finding at gate 2 and marks it real or not. The findings are already there; the reading is the cost. Kill: fewer than half real over five drafts turns `plan` off in `draft.toml`. | Chris | $0, the plan check's ~$0.45 a draft |
| 6 | **A plan finding is settled when a scene is rewritten under it.** Now it stays open after the rewrite, so gate 2 shows it again. Suggestion: the rewrite records a `keep` verdict on each ticked plan finding with `method: "rewrite"`, and `chain.settled()` (`chain.ts:210`) skips every finding that is not `source: "check"`, not only `screen`. Without the second half, an accepted plan finding would enter the fixes that later repair rounds must keep. One test: rewrite under a plan finding; the finding reads settled; `settled()` stays empty. Done: the rewrite records the `keep`, and `settled()` skips `plan` beside `screen` (gate 1 operator instructions stay in it). | code, one test | done |
| 7 | **L4 reads hours against a stated pace.** Done in the IR follow-up branch: the hour the bind patched on `7715` was in the plan from the start, and L4's prompt excluded hours. With hours in its remit (dates and day numbers still out) L4 names it 3 of 3 against 0 of 3 (`evals/20260928-l4-hours.md`, $2.12). Re-checking a revised plan before a rewrite writes prose stays a candidate for when a fix makes a conflict, which this case did not show. S2′'s recall under the new prompt is 28 of 30, as before, though the misses moved from a plant to the plan's own conflict ($5.08). | three runs a draw | done, $7.20 |
| 8 | **A sibling gets the plan check.** `branch` copies its source's config (`drafting.ts:338`), so a draft configured before `f0f90fd` never runs `plan`, and neither do its siblings. The copy keeps two arms comparable, and `branch --profile P` already builds a fresh config. Suggestion: when the copied config lacks `plan`, add it. The plan check writes no prose and changes no scene, so the arms stay comparable. About ten lines in `resolved()` and one test. Done, and one more gap closed with it: a branch that carries its schedule ran no plan check at all, so it now checks the carried plan beside the scenes (about $0.45 a branch). | code, one test | done |
| 9 | **S0′, classify the kept findings** (IR spec §12.6). Done: 35 of 40 kept findings (88%), 25 of 30 distinct defects, are typed or model-on-a-slice; the bar was half, so §12 stays a live design (`evals/20260928-s0prime.md`). It takes those findings only once the brief's facts are lowered to symbols. | reading | done, $0 |

Total: about $42 and two listening sessions for steps 1 to 4; about $1
and five readings at gate 2 for steps 5 to 9.

## S4 and S6: the cases, not run

The IR's last two stages (spec §13.3) are written down here and not run.

**S4, the conformance screen (about $25).** It asks a scene against its
beat's slice of the IR, beside or in place of the bind's read against the
ledger. Its case rests on the plan findings being real: a slice is only
worth checking a scene against if the plan it comes from is right. Step 5,
Chris reading five drafts' plan findings, measures that at $0. S0′ does
not bear on it: it shows gate 1's findings are typed or slice-shaped, not
that scenes drift from their slice. Decision: wait for step 5. Run S4 if
at least half the plan findings read real, and if a draft shows a scene
that breaks its beat's plan where the bind said nothing.

**S6, parallel beats (about $30 with the panel, about $10 by ear alone).**
`scenes.order = "parallel"` exists (`scenesession.ts:141`) and no draw has
run it. It writes every beat at once from the schedule, with no story so
far. The gain is wall time. On `e6f0` and `b82d` the first-pass scenes
take 6.4 min in sequence, and the longest single scene 49 s, so parallel
saves about 5.5 min of a 9 to 16 minute draft. The risk is continuity: a beat
that does not read the one before it can repeat it or miss its hand-off.
No measurement bears on that. S0 bears on a nearby claim and does not
help: a beat's slice of the plan in the ask did not hold the writer to the
facts (ledger flags fell 0.39 to 0.44 a beat on one draft, under the 0.6
bar, and rose on the other), so the IR is not yet a substitute for the
prose so far. Decision: not
now. It becomes worth two drafts, the same brief in each order, heard by
Chris, when G1's wall time is the constraint again and step 1's listen has
said what the ear hears. Kill: a loss the ear hears, or above 0.5 on the
panel.

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
