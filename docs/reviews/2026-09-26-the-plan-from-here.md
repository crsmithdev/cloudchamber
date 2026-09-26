# The plan from here

26 September. This plan replaces the order of
`2026-09-24-the-plan-by-goal.md`. That plan keeps its principles and its
goals, and its revision 12 is the record of where each of its steps stands.

Revision 2 of this plan answers a red team of five reviewers (measurement,
guards, goals and order, cheaper alternatives, operations). What it changed
is listed at the end.

## The goals now

| Goal | Target | Now | Basis |
|---|---|---|---|
| G1 idea to drafted story | < 20 min | 59–67 min for a claims chain; unrestricted not measured on `main` | 2 min ideate, 19–27 min today's check loop (replays), 38.0 min draft `663a`. `663a` ran beside 21 other draws, so it is a figure under load |
| G2 change to judged result | < 10 min | not measured | GLM-4.7 takes 2–8 min of every judged run |
| G3 hold the bar | no loss | not re-measured | step 5 changes which findings auto repairs, so it changes drafted text; it landed on the checks guard only |
| G4 repeated work | −80% | draft side met; check side not | claims calls 126 → 14 in one draft; claims still re-verified each check round |
| G5 Claude list $ | −50% | one draft −56%; chain about −40–50% on estimate | $20.54 → $9.13 on one draft each side |
| G6 judge $ | −50% | not met | no judge can go under the side-by-side test |
| G7 simpler | fewer lines | +185 | 16,125 against 15,940 |

Where `663a`'s 38 min went: the first pass 23.8 min (binds 17.5, scenes 6.2),
six rewrites in sequence 13.9 min (binds 10.0), the claims screen 0.35 min.
The bind is 72% of draft time.

## What the last run taught

1. **A guard that did not run is not a guard.** Each step below names the
   run that decides it.
2. **A replay starts from the root's own ledger.** `copyBrief` carries the
   chain's amended ledger, which answers the findings under test.
3. **Verify's drop-if-any rule is where findings are lost.** `verifyFindings`
   drops a finding when either of its two readings drops it
   (`check.ts:156-189`). On `88c3` the checkers raised the cardigan and 1979
   findings 3 of 4 times and verify dropped them. The reader's first verify
   dropped most planted holes the reader raised.
4. **A rule in code beats a rule in a prompt.** The reader verify drops a
   question only on a quote `quoted()` finds in the prose: 11 of 24 plants
   against 4 of 24 the run before. That gain is in-sample: the rule was
   written after the first run on the same plants.
5. **Auto must not repair a departure from the setting.** The one canon
   repair in the replay rewrote the premise.
6. **One reading, one replay and one draft are all inside the noise.**
   `low`'s 6 against 10 on `4400` is recurrence noise: today's effort scored
   the same finding 6 in round 1 of `new-4400`. Two canon readings of one
   draft differ by 0.62 a beat. The panel's per-pair gaps at three pairs have
   a standard error near 0.13, so it resolves about 0.5, three times
   `GAP_MARGIN`.
7. **A claims finding cannot drive auto.** It scores about 3, under the floor
   of 7, and step 4 is dropped. Re-verifying claims each round only feeds the
   gate.

## Decisions for Chris

Each moves a given. The order below assumes the recommendation.

| Decision | Options | Recommendation |
|---|---|---|
| G1's profile | the listen profile (10,000 words, 10–14 beats), or the 5,000-word default | measure G1 on both; the listen profile's best case in the plan by goal was 17–29 min before the check loop |
| G2 and GLM | keep GLM; drop it for latency | drop it: its absence moves only three thin 4-pass pairs from inside the margin to `+`, and every experiment mean keeps its side. G6 −17%, G2 loses its slowest judge |
| G6's rest | 4 passes a judge on pooled reads; accept G6 unmet | accept it unmet: 24 passes is the measured minimum for one pair, and 4 passes leave about one informative pass a judge |
| Claims | every round, as today; at the gate only; off | at the gate only: claims run on the brief a person rules on |
| Step 4 | land; drop | drop |
| Reader check | on by default; on demand (`--checks reader`) | on by default after its two defects are fixed; it adds 13–20% to a check pass |

## Rules for every run

- **Runners are in the repository.** `evals/plotholes/run.ts` is. The chain
  replay moves there from the scratchpad, and each writes its results under
  `evals/`. A runner sets effort through the same `stages.toml` a landing
  uses.
- **A run writes its verdicts to a scratch `bank/`** (`CLOUDCHAMBER_BANK`),
  and archives the draws it copied when it ends.
- **Nothing lands on `main` while a run is in flight.** A commit on `main`
  reloads the service, and recovery fails any draw between calls.
- **A replay a call timeout kills (15 min, `model.ts:41`) is run again from
  the start.** Its partial result is not read.
- **One source per series, named:** the checks use `4400` and `88c3`; the
  drafts use `20260924223235-3cee` (unrestricted, drafted, listen profile).

## Guards

**Checks.** A change replays both chains twice from each root's first
ledger; today's loop replays them twice too, and that spread is the floor.
The change fails if a finding today's loop kept in both its replays is kept
in neither of the change's. Findings are compared at round 1 only: later
rounds follow different repairs, and their sets cannot be compared.

**Plot holes.** Two sets: today's 15 plants, and 15 more written by a
different author (B2), held out from any tuning. Two runs a set. Counted kind
by kind with the spread between the two runs stated. The count of kept
questions that name no plant is reported, and a person reads them.

**Canon.** Three readings of each draft. The spread comes from the control
arm's nine readings (D1), not from the one pair of 26 September. An arm
fails if its mean contradictions a beat exceed the control's by more than
twice the standard error of that difference. The reference bind reads each
beat against the ledger and the beat before it only, so contradictions two
beats apart are not counted.

**Changed output.** The panel, at three drafts an arm, detects a loss of
about 0.5 in score gap and nothing smaller. It stays as the check against a
large loss. An arm lands on time, cost and canon, if the panel shows no gap
below −0.5.

## The order

### A. Fix, move and clean up ($0)

| # | Step | Decides it |
|---|---|---|
| A1 | **Fix the reader check's two defects.** A reader question merged with a derivation or ledger finding goes to `checkVerify` and becomes auto-eligible; it must stay a question for a person. A drop quote that is the question's own span must not count. Then land it after Chris reads its questions. | tests; Chris |
| A2 | **Move the chain replay into `evals/`** with a scratch bank, archiving, and effort from `stages.toml`. | a test run on the fake model |
| A3 | **Port steps 9 and 10 onto `main`** as branches from `main`, from Gemini's stack; keep none of its evals. Then remove Gemini's twelve branches and `feature/canon-claims`. | the suite |
| A4 | **Drop GLM** from `JUDGES`, if Chris agrees. | the stored log |
| A5 | **Archive the 48 scratch draws of 26 September.** | — |

### B. Measure the noise ($65)

| # | Step | Cost |
|---|---|---|
| B1 | Today's loop replays `4400` and `88c3` twice more. | ~$40 |
| B2 | A second plot-hole set of 15 plants, by a different author, run twice with today's check and the reader. | ~$25 |

### C. The check loop ($150)

| # | Step | Decides it | Goals | Cost |
|---|---|---|---|---|
| C1 | **Verify's rule.** Keep a finding when either reading keeps it, against today's drop-if-any. Both chains twice, both plot sets twice. | checks and plot holes | principle 2 | ~$65 |
| C2 | **Claims at the gate only.** Claims run on the brief auto stops on and on each brief a person checks, not on every auto round. | the gate shows every claim today's loop shows at its gate, in B1's replays | G4, G5 | ~$20 |
| C3 | **Check effort `low`**, and a Sonnet arm for the derivation and ledger checks. Both chains twice, both plot sets twice, each arm. | checks and plot holes | G1, G5 | ~$65 |

### D. The draft ($230)

| # | Step | Decides it | Goals | Cost |
|---|---|---|---|---|
| D0 | **The bind's own noise.** The stored bind prompts of one draft, run twice at today's setting (plan by goal, step 10). | — | — | ~$10 |
| D1 | **The control arm.** Three drafts of `3cee` with `cloudchamber branch`, three canon readings each. | — | canon spread | ~$50 |
| D2 | **Step 9, bind at once.** Three drafts; time and cost; canon; the panel against a large loss. | canon and changed output | G1, G7 | ~$55 |
| D3 | **Step 10, bind effort `low`, and a Sonnet bind.** Two arms, as D2. | canon and changed output | G1, G5 | ~$105 |
| D4 | **Step 8's ceilings.** Recount the rewrite triggers on D1's and D2's drafts under each ceiling, then canon on the one that lands. | canon | G1, G5 | ~$10 |

### E. Measure G1 ($40)

One chain end to end on each profile the G1 decision names, with nothing else
running, after C and D.

## What the order can move

Only measured or derived figures; the rest is left open.

| Goal | Moves it | What is known |
|---|---|---|
| G1 | D2, C3, the profile decision | binds are 72% of draft time; D2 leaves the scene calls, about 6–9 min, as the floor |
| G2 | A4 | GLM's p50 is 123 s, its max 504 s |
| G4 | C2 | claims verify was $17.19 of $87.81, 20%, of the check spend on the claims chains of 26 September |
| G5 | C2, C3, D3 | `low` halved check cost on the plot-hole set |
| G6 | A4 | −17%; the rest is accepted unmet |
| G7 | D2 removes the serial rewrite loop | A1 adds about 50 lines |

Principle 1, ideation, is outside this plan. No step makes a draft better:
every step here cuts time or cost behind a guard against loss. Principle 3
needs its own plan.

## Dropped

| Proposal | Why |
|---|---|
| step 3, find claims once | C2 runs claims once where they are read, with no stability work |
| stabilizing the claims verify | C2 makes it matter less; C1 covers the drop rule for every checker |
| step 4, repair canon claims | its only repair rewrote the premise |
| `medium` check effort | `low`'s loss on `4400` was noise; C3 tests `low` properly |
| reading pooled comparisons at 4 passes | 4 passes leave about one informative pass a judge |
| Gemini's evals of steps 2, 8, 10 and 12 | contradiction plants, amended ledgers, withdrawn findings counted |
| the 0.62/√3 canon threshold | one pair, a mean absolute difference read as a standard deviation |

## What the red team changed

| Finding | Change |
|---|---|
| the canon threshold's arithmetic was wrong, and rested on one pair | the spread comes from D1's nine readings |
| the checks guard excused findings verify dropped, which lets lower recurrence pass | removed; two replays of today's loop are the floor |
| the plot-hole thresholds sat inside one run's noise, and the reader was tuned on the same plants | kind by kind with the spread stated; a held-out set (B2) |
| the panel cannot resolve `GAP_MARGIN` at three drafts | kept as a large-loss check; arms land on canon, time and cost |
| B stabilized the claims verify, which cannot drive auto | replaced by claims at the gate (C2) and the drop rule for every checker (C1) |
| steps 9 and 10 existed only on Gemini's stale stack, which A1 would have deleted | A3 ports them first |
| costs were understated (A summed to $45, C to about $220) | recounted from this session's figures |
| a reload kills in-flight draws; a 15-min timeout kills a replay | rules for every run |
| the reader check auto-accepts a merged finding | A1 fixes it before landing |
| the G1 target may be out of reach at the listen profile | a decision for Chris, and E measures both profiles |
